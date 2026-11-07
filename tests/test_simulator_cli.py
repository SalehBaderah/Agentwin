"""CLI commands must select synthetic sessions even when Live is the default view."""
import json

import httpx
import pytest

from simulator.run import main, set_scenario


@pytest.mark.parametrize('scenario', ['normal', 'pause', 'recovery', 'stop'])
def test_cli_selects_newest_simulated_session(scenario):
    requests = []

    def respond(request):
        requests.append(request)
        if request.method == 'GET':
            return httpx.Response(200, json={
                'session': {'id': 'live', 'mode': 'live'},
                'sessions': [
                    {'id': 'older-simulation', 'mode': 'simulated', 'created': 1},
                    {'id': 'live', 'mode': 'live', 'created': 3},
                    {'id': 'latest-simulation', 'mode': 'simulated', 'created': 2},
                ],
            })
        return httpx.Response(200, json={'scenario': scenario})

    with httpx.Client(base_url='http://test/api', transport=httpx.MockTransport(respond)) as client:
        result = set_scenario(client, 'my-project', scenario)

    assert result['session_id'] == 'latest-simulation'
    assert len(requests) == 2
    assert requests[-1].url.path == '/api/projects/my-project/sessions/latest-simulation/scenario'
    assert json.loads(requests[-1].content) == {'scenario': scenario}


def test_cli_creates_simulation_if_only_live_session_exists():
    requests = []

    def respond(request):
        requests.append(request)
        if request.method == 'GET':
            return httpx.Response(200, json={'sessions': [{'id': 'live', 'mode': 'live'}]})
        if request.url.path.endswith('/sessions'):
            return httpx.Response(201, json={'id': 'new-simulation', 'mode': 'simulated'})
        return httpx.Response(200, json={'scenario': 'normal'})

    with httpx.Client(base_url='http://test/api', transport=httpx.MockTransport(respond)) as client:
        result = set_scenario(client, 'my-project', 'normal')

    assert result == {'session_id': 'new-simulation', 'scenario': 'normal'}
    assert json.loads(requests[1].content) == {'mode': 'simulated'}
    assert requests[2].url.path.endswith('/sessions/new-simulation/scenario')


def test_cli_does_not_create_sessions_for_unknown_project():
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(400, json={'detail': 'Project not found'})

    with httpx.Client(base_url='http://test/api', transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(httpx.HTTPStatusError):
            set_scenario(client, 'missing', 'normal')
    assert len(requests) == 1


def test_cli_requires_explicit_project():
    with pytest.raises(SystemExit) as error:
        main([])
    assert error.value.code == 2
