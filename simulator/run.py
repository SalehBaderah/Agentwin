"""Control a project's simulated session without touching live telemetry."""
import argparse
import httpx


def set_scenario(client, project_id, scenario):
    response = client.get(f'/projects/{project_id}')
    response.raise_for_status()
    # The default project view selects Live. Explicitly select the newest
    # simulated session so CLI commands cannot operate on that Live session.
    sessions = response.json()['sessions']
    simulated = [session for session in sessions if session['mode'] == 'simulated']
    if simulated:
        session = max(simulated, key=lambda item: item['created'])
    else:
        response = client.post(f'/projects/{project_id}/sessions', json={'mode': 'simulated'})
        response.raise_for_status()
        session = response.json()
    result = client.post(
        f'/projects/{project_id}/sessions/{session["id"]}/scenario',
        json={'scenario': scenario},
    )
    result.raise_for_status()
    return {'session_id': session['id'], **result.json()}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, help='Project ID shown in the project URL')
    parser.add_argument('--api', default='http://127.0.0.1:8000/api', help='Backend API base URL')
    parser.add_argument('--scenario', choices=['normal', 'level-change', 'pause', 'recovery', 'stop'], default='normal')
    args = parser.parse_args(argv)
    with httpx.Client(base_url=args.api) as client:
        print(set_scenario(client, args.project, args.scenario))


if __name__ == '__main__':
    main()
