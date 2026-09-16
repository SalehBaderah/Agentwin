import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from .models import ProjectCreate, SessionCreate, Scenario, Question, Settings, ComponentAction
from .store import Store
from .runtime import Runtime
from .templates import definition
from .agent import answer

load_dotenv()

def create_app(path=None, background=True):
    store = Store(path or os.getenv('DATABASE_PATH', 'data/agentwin.db'))
    store.seed()
    runtime = Runtime(store)

    @asynccontextmanager
    async def lifespan(app):
        if background:
            runtime.start_mqtt()
            tick = asyncio.create_task(runtime.tick())
        yield
        if background:
            tick.cancel()
            await asyncio.gather(tick, return_exceptions=True)
        await runtime.close()
        store.db.close()

    app = FastAPI(title='Agentwin', lifespan=lifespan)
    app.state.store = store
    app.state.runtime = runtime
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', 'testserver'])

    @app.middleware('http')
    async def local_origin(request: Request, call_next):
        origin = request.headers.get('origin')
        if origin and origin not in ('http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:8000', 'http://localhost:8000'):
            return JSONResponse({'detail': 'Origin not allowed'}, status_code=403)
        return await call_next(request)

    @app.exception_handler(ValueError)
    async def invalid(request, error):
        return JSONResponse({'detail': str(error)}, status_code=400)

    @app.get('/api/health')
    def health():
        store.rows('SELECT 1')
        return {'status': 'ready', 'mqtt': runtime.mqtt_connected, 'mqtt_rejections': runtime.rejections, 'agent_configured': bool(os.getenv('OPENAI_API_KEY')) and os.getenv('LLM_PROVIDER', 'openai') == 'openai'}

    @app.get('/api/projects')
    def projects():
        return [store.state(p['id']) for p in store.projects()]

    @app.post('/api/projects', status_code=201)
    def create(request: ProjectCreate):
        return store.create_project(request)

    @app.get('/api/projects/{pid}')
    def state(pid: str, session: str | None = None):
        return store.state(pid, session)

    @app.post('/api/projects/{pid}/sessions', status_code=201)
    async def session(pid: str, body: SessionCreate):
        if body.mode == 'replay' and not body.recording_id:
            raise ValueError('Select an original recording')
        if body.mode == 'replay' and not store.history(pid, body.recording_id):
            raise ValueError('Selected recording has no samples')
        s = store.create_session(pid, body.mode, body.recording_id)
        if body.mode == 'replay':
            runtime.tasks[s['id']] = asyncio.create_task(runtime.replay(pid, s['id'], body.recording_id))
        return s

    @app.post('/api/projects/{pid}/sessions/{sid}/scenario')
    async def scenario(pid: str, sid: str, body: Scenario):
        await runtime.scenario(pid, sid, body.scenario)
        return {'scenario': body.scenario}

    @app.post('/api/projects/{pid}/sessions/{sid}/events/{eid}/acknowledge')
    def acknowledge(pid: str, sid: str, eid: str):
        return store.acknowledge(pid, sid, eid)

    @app.get('/api/projects/{pid}/sessions/{sid}/conversations')
    def conversations(pid: str, sid: str):
        store.session(pid, sid)
        return [{**r, 'answer': json.loads(r['answer'])} for r in store.rows('SELECT * FROM conversations WHERE project=? AND session=? ORDER BY created DESC LIMIT 20', (pid, sid))]

    @app.post('/api/projects/{pid}/sessions/{sid}/agent')
    async def agent(pid: str, sid: str, body: Question):
        return await answer(store, pid, sid, body.question, component_id=body.component_id)

    @app.get('/api/projects/{pid}/sessions/{sid}/actions')
    def actions(pid: str, sid: str):
        store.session(pid, sid)
        return store.rows('SELECT * FROM actions WHERE project=? AND session=? ORDER BY created DESC LIMIT 50', (pid, sid))

    @app.post('/api/projects/{pid}/sessions/{sid}/actions', status_code=202)
    def component_action(pid: str, sid: str, body: ComponentAction):
        return runtime.component_action(pid, sid, body.component_id, body.action, body.value)

    @app.put('/api/projects/{pid}/settings')
    def settings(pid: str, body: Settings):
        p = store.project(pid)
        if body.freshness_seconds < p['interval_seconds'] * 2:
            raise ValueError('Freshness must be at least twice the sample interval')
        p.update(body.model_dump())
        p['graph'] = definition(p['template'], p['mapping'], p['attenuator_inserted'], p['cable_description'])
        store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(p), pid))
        return p

    @app.websocket('/api/ws')
    async def websocket(ws: WebSocket):
        if ws.headers.get('origin') not in ('http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:8000', 'http://localhost:8000', None):
            await ws.close(code=1008)
            return
        await ws.accept()
        try:
            while True:
                pid = ws.query_params.get('project')
                if pid:
                    await ws.send_json({'type': 'project_snapshot', 'state': store.state(pid, ws.query_params.get('session'))})
                else:
                    await ws.send_json({'type': 'snapshot', 'projects': projects()})
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
