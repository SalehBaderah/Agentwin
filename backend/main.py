"""HTTP and WebSocket routes for the local Agentwin application.

Validation belongs in models, persistence in Store, and background work in Runtime.
Keep routes small so contributors can follow each request to its owning module.
"""
import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .agent import answer, provider_available, provider_configured
from .hardware_templates import firmware_check, firmware_package, template_catalog
from .models import (
    ComponentAction, DeviceCreate, ProjectCreate, Question, Scenario,
    SessionCreate, Settings,
)
from .notifications import smtp_configured
from .runtime import Runtime
from .store import Store

load_dotenv()

ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'testserver']
ALLOWED_ORIGINS = {
    'http://127.0.0.1:5173', 'http://localhost:5173',
    'http://127.0.0.1:8000', 'http://localhost:8000',
}


def create_app(path=None, background=True):
    """Create one SQLite-backed app; tests can disable background services."""
    store = Store(path or os.getenv('DATABASE_PATH', 'data/agentwin.db'))
    runtime = Runtime(store)

    @asynccontextmanager
    async def lifespan(app):
        tick = None
        try:
            if background:
                runtime.start_mqtt()
                tick = asyncio.create_task(runtime.tick())
            yield
        finally:
            if tick is not None:
                tick.cancel()
                await asyncio.gather(tick, return_exceptions=True)
            try:
                await runtime.close()
            finally:
                store.db.close()

    app = FastAPI(title='Agentwin', lifespan=lifespan)
    app.state.store = store
    app.state.runtime = runtime
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

    @app.middleware('http')
    async def origin(request: Request, call_next):
        request_origin = request.headers.get('origin')
        if request_origin and request_origin not in ALLOWED_ORIGINS:
            return JSONResponse({'detail': 'Origin not allowed'}, status_code=403)
        return await call_next(request)

    @app.exception_handler(ValueError)
    async def invalid(request, error):
        return JSONResponse({'detail': str(error)}, status_code=400)

    @app.get('/api/health')
    async def health():
        configured = provider_configured()
        return {
            'status': 'ready',
            'mqtt': runtime.mqtt_connected,
            'mqtt_rejections': runtime.rejections,
            'agent_configured': configured,
            'agent_available': await provider_available() if configured else False,
            'agent_provider': os.getenv('LLM_PROVIDER', 'openai'),
            'email_configured': smtp_configured(),
            'email_default_recipient_configured': bool(os.getenv('AGENTWIN_EMAIL_TO')),
        }

    @app.get('/api/projects')
    def projects():
        return [store.state(project['id']) for project in store.projects()]

    @app.get('/api/project-templates')
    def project_templates():
        return template_catalog()

    @app.post('/api/projects', status_code=201)
    def create(body: ProjectCreate):
        return store.create_project(body)

    @app.delete('/api/projects/{pid}', status_code=204)
    def delete_project(pid: str):
        store.delete_project(pid)

    @app.post('/api/projects/{pid}/devices', status_code=201)
    def register_device(pid: str, body: DeviceCreate):
        return store.register_device(pid, body)

    @app.get('/api/projects/{pid}/devices/{device_id}/setup')
    def device_setup(pid: str, device_id: str):
        project = store.project(pid)
        device = next((item for item in project['devices'] if item['id'] == device_id), None)
        if not device:
            raise ValueError('Device is not registered to this project')
        fields = {
            key: value for key, value in project['graph']['fields'].items()
            if value.get('device_id') == device_id
        }
        components = [
            item for item in project['graph']['components']
            if item.get('configuration', {}).get('device_id') == device_id
        ]
        topic = f'agentwin/{pid}/{device_id}'
        return {
            'project_id': pid,
            'device_id': device_id,
            'connector': device['connector'],
            'serial_port': device.get('serial_port'),
            'baud_rate': device.get('baud_rate', 115200),
            'topics': {
                'telemetry': topic + '/telemetry',
                'command': topic + '/command',
                'status': topic + '/status',
            },
            'fields': fields,
            'components': components,
            'freshness_seconds': project['freshness_seconds'],
            'session_registration_required': True,
        }

    @app.get('/api/projects/{pid}/devices/{device_id}/firmware-check')
    def check_firmware(pid: str, device_id: str, template_id: str):
        return firmware_check(store.project(pid), device_id, template_id)

    @app.get('/api/projects/{pid}/devices/{device_id}/firmware.zip')
    def download_firmware(pid: str, device_id: str, template_id: str):
        content, filename = firmware_package(store.project(pid), device_id, template_id)
        return Response(
            content,
            media_type='application/zip',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Cache-Control': 'no-store',
            },
        )

    @app.get('/api/projects/{pid}')
    def state(pid: str, session: str | None = None):
        return store.state(pid, session)

    @app.post('/api/projects/{pid}/sessions', status_code=201)
    def session(pid: str, body: SessionCreate):
        return store.create_session(pid, body.mode)

    @app.post('/api/projects/{pid}/sessions/{sid}/scenario')
    async def scenario(pid: str, sid: str, body: Scenario):
        await runtime.scenario(pid, sid, body.scenario)
        return {'scenario': body.scenario}

    @app.post('/api/projects/{pid}/sessions/{sid}/actions', status_code=202)
    def action(pid: str, sid: str, body: ComponentAction):
        return runtime.component_action(pid, sid, body.component_id, body.action, body.value)

    @app.get('/api/projects/{pid}/sessions/{sid}/actions')
    def actions(pid: str, sid: str):
        return store.actions(pid, sid)

    @app.post('/api/projects/{pid}/sessions/{sid}/actions/{aid}/confirm', status_code=202)
    def confirm_action(pid: str, sid: str, aid: str):
        return runtime.confirm_control_proposal(pid, sid, aid)

    @app.post('/api/projects/{pid}/sessions/{sid}/actions/{aid}/cancel')
    def cancel_action(pid: str, sid: str, aid: str):
        return runtime.cancel_control_proposal(pid, sid, aid)

    @app.post('/api/projects/{pid}/sessions/{sid}/events/{eid}/acknowledge')
    def acknowledge(pid: str, sid: str, eid: str):
        return store.acknowledge(pid, sid, eid)

    @app.post('/api/projects/{pid}/sessions/{sid}/agent')
    async def agent(pid: str, sid: str, body: Question):
        control_request = body.control_request.model_dump() if body.control_request else None
        return await answer(
            store, pid, sid, body.question,
            component_id=body.component_id,
            control_request=control_request,
            control_dispatch=runtime.confirm_control_proposal,
        )

    @app.put('/api/projects/{pid}/settings')
    def settings(pid: str, body: Settings):
        return store.update_settings(pid, body)

    @app.websocket('/api/ws')
    async def websocket(ws: WebSocket):
        await ws.accept()
        try:
            while True:
                pid = ws.query_params.get('project')
                if pid:
                    snapshot = {
                        'type': 'project_snapshot',
                        'state': store.state(pid, ws.query_params.get('session')),
                    }
                else:
                    snapshot = {'type': 'snapshot', 'projects': projects()}
                await ws.send_json(snapshot)
                await asyncio.sleep(1)
        except (WebSocketDisconnect, RuntimeError, ValueError):
            pass

    dist = Path('frontend/dist')
    if dist.exists():
        app.mount('/assets', StaticFiles(directory=dist / 'assets'), name='assets')

        @app.get('/{route:path}')
        def frontend(route: str):
            if route.startswith('api/'):
                return JSONResponse({'detail': 'Not found'}, status_code=404)
            return FileResponse(dist / 'index.html')

    return app


app = create_app()
