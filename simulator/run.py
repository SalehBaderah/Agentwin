"""Drive backend synthetic sessions; simulator never publishes as live hardware."""
import argparse
import httpx

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', default='smart-connectivity')
    parser.add_argument('--scenario', choices=['normal','level-change','pause','recovery','stop'], default='normal')
    args = parser.parse_args()
    with httpx.Client(base_url='http://127.0.0.1:8000/api') as client:
        response = client.get(f'/projects/{args.project}')
        response.raise_for_status()
        state = response.json()
        result = client.post(f'/projects/{args.project}/sessions/{state["session"]["id"]}/scenario', json={'scenario':args.scenario})
        result.raise_for_status()
        print(result.json())

if __name__ == '__main__':
    main()
