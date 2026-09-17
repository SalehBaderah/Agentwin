import asyncio, json, os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from .models import ComponentAction, DeviceCreate, ProjectCreate, Question, Scenario, SessionCreate, Settings
from .store import Store
from .runtime import Runtime
from .templates import definition
from .agent import answer

load_dotenv()
def create_app(path=None, background=True):
    store = Store(path or os.getenv('DATABASE_PATH', 'data/agentwin.db')); runtime = Runtime(store)
    @asynccontextmanager
    async def lifespan(app):
        if background: runtime.start_mqtt(); tick = asyncio.create_task(runtime.tick())
        yield
        if background: tick.cancel(); await asyncio.gather(tick, return_exceptions=True)
        await runtime.close(); store.db.close()
    app = FastAPI(title='Agentwin', lifespan=lifespan); app.state.store, app.state.runtime = store, runtime
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', 'testserver'])
    @app.middleware('http')
    async def origin(request: Request, call_next):
        if request.headers.get('origin') and request.headers['origin'] not in ('http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:8000', 'http://localhost:8000'): return JSONResponse({'detail': 'Origin not allowed'}, 403)
        return await call_next(request)
    @app.exception_handler(ValueError)
    async def invalid(request, error): return JSONResponse({'detail': str(error)}, 400)
    @app.get('/api/health')
    def health(): return {'status': 'ready', 'mqtt': runtime.mqtt_connected, 'mqtt_rejections': runtime.rejections, 'agent_configured': bool(os.getenv('OPENAI_API_KEY'))}
    @app.get('/api/projects')
    def projects(): return [store.state(project['id']) for project in store.projects()]
    @app.post('/api/projects', status_code=201)
    def create(body: ProjectCreate): return store.create_project(body)
    @app.delete('/api/projects/{pid}', status_code=204)
    def delete_project(pid: str): store.delete_project(pid)
    @app.post('/api/projects/{pid}/devices', status_code=201)
    def register_device(pid: str, body: DeviceCreate): return store.register_device(pid, body)
    @app.get('/api/projects/{pid}')
    def state(pid: str, session: str | None = None): return store.state(pid, session)
    @app.post('/api/projects/{pid}/sessions', status_code=201)
    def session(pid: str, body: SessionCreate): return store.create_session(pid, body.mode)
    @app.post('/api/projects/{pid}/sessions/{sid}/scenario')
    async def scenario(pid: str, sid: str, body: Scenario): await runtime.scenario(pid, sid, body.scenario); return {'scenario': body.scenario}
    @app.post('/api/projects/{pid}/sessions/{sid}/actions', status_code=202)
    def action(pid: str, sid: str, body: ComponentAction): return runtime.component_action(pid, sid, body.component_id, body.action, body.value)
    @app.get('/api/projects/{pid}/sessions/{sid}/actions')
    def actions(pid: str, sid: str): store.session(pid, sid); return store.rows('SELECT * FROM actions WHERE project=? AND session=? ORDER BY created DESC LIMIT 100', (pid, sid))
    @app.post('/api/projects/{pid}/sessions/{sid}/events/{eid}/acknowledge')
    def acknowledge(pid: str, sid: str, eid: str): return store.acknowledge(pid, sid, eid)
    @app.post('/api/projects/{pid}/sessions/{sid}/agent')
    async def agent(pid: str, sid: str, body: Question): return await answer(store, pid, sid, body.question, component_id=body.component_id)
    @app.put('/api/projects/{pid}/settings')
    def settings(pid: str, body: Settings):
        project = store.project(pid); project.update(body.model_dump()); project['graph'] = definition(project['template'], project['mapping'], cable=project['cable_description'], device_id=project['device_id'], connector=project['connector']); store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), pid)); return project
    @app.websocket('/api/ws')
    async def websocket(ws: WebSocket):
        await ws.accept()
        try:
            while True:
                pid = ws.query_params.get('project'); await ws.send_json({'type': 'project_snapshot', 'state': store.state(pid, ws.query_params.get('session'))} if pid else {'type': 'snapshot', 'projects': projects()}); await asyncio.sleep(1)
        except (WebSocketDisconnect, RuntimeError, ValueError): pass
    dist = Path('frontend/dist')
    if dist.exists():
        app.mount('/assets', StaticFiles(directory=dist/'assets'), name='assets')
        @app.get('/{route:path}')
        def frontend(route: str): return JSONResponse({'detail': 'Not found'}, 404) if route.startswith('api/') else FileResponse(dist/'index.html')
    return app
app = create_app()
