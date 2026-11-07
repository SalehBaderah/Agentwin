# Configuration

Copy [`.env.example`](../.env.example) to ignored `.env` in the repository root
without overwriting an existing file. The backend loads it at startup; exported
process variables take precedence. Restart the backend after changes. Keep keys
and passwords server-side; do not place them in frontend variables or source files.

## Core settings

| Variable | Example/default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `data/agentwin.db` | SQLite database; relative paths resolve from the working directory. |
| `MQTT_HOST` | `127.0.0.1` | Broker address used by the backend and gateway. |
| `MQTT_PORT` | `1883` | Broker TCP port. |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | empty | Optional broker account; use the plain password, not its stored hash. |
| `LLM_PROVIDER` | `none` in the example | Disable AI, or select `lmstudio` / `openai`. |

The SQLite database is created automatically. No migrations command, API key,
broker, or external database is required for simulated-session development.
Monitoring rules continue to work when AI is disabled. Physical commands require
Live telemetry and a connected broker; USB devices also need an online gateway.

## Optional AI: LM Studio

1. Install LM Studio separately, load an appropriate chat model, and start its
   OpenAI-compatible local server.
2. Get the exact loaded model identifier from LM Studio or its `/v1/models` endpoint.
3. Edit `.env` and restart Agentwin:

```dotenv
LLM_PROVIDER=lmstudio
LLM_BASE_URL=http://127.0.0.1:1234/v1
LLM_MODEL=qwen/qwen3-4b-2507
LLM_API_KEY=lm-studio
LLM_REASONING_EFFORT=
```

The model name above is an example; it must match your loaded model. `lm-studio`
is a local example value, not a hosted API credential. If your local server
requires authentication, use its actual credential only in `.env`.
`LLM_REASONING_EFFORT=none` is available for thinking models that support it;
leave the value empty otherwise. The supplied local-agent evaluation describes
specific tested models, not compatibility with every model.

## Optional AI: OpenAI

Set `LLM_PROVIDER=openai`, `LLM_MODEL` to a model available to your account that
supports Responses tool calling and structured output, and `OPENAI_API_KEY` to
your key in the ignored `.env`. Remove or comment out `LLM_BASE_URL` and
`LLM_API_KEY` from the local-provider example to keep your configuration clear.
OpenAI requests can incur charges and send selected project evidence and prompts
to the provider. Review that data before enabling the integration.

`/api/health` distinguishes configured from available. A configured provider may
still fail individual model requests. The UI reports provider failures, and
scheduled summaries fall back to deterministic facts. No credentials are needed
for the default workflow.

## Optional MQTT

[Hardware setup](hardware-setup.md) covers a private-network broker, ACLs, gateway,
and firmware. For a loopback-only development broker with Docker Compose:

```bash
# macOS / Linux
MQTT_BROKER_CONFIG=mosquitto.conf docker compose up -d broker
```

```powershell
# Windows PowerShell
$env:MQTT_BROKER_CONFIG = 'mosquitto.conf'
docker compose up -d broker
```

This uses the checked-in anonymous development configuration, bound to
`127.0.0.1` by default. Keep `MQTT_BIND_IP=127.0.0.1` for this configuration.
Use an authenticated broker for physical devices on a private network; never
expose the anonymous development broker beyond loopback.

Optional Compose settings are `MQTT_BIND_IP` (published host interface),
`MQTT_BROKER_CONFIG` (configuration filename under `broker/`), and
`DOCKER_LLM_BASE_URL` (host model server address seen inside the app container).
Compose passes `MQTT_HOST=broker` to the app and defaults its model-server address
to `http://host.docker.internal:1234/v1`. Access to a host-local model server may
require additional host-side configuration; native Python is the primary quick start.

The virtual-MQTT demo (`python -m simulator.demo`) creates named Demo projects and
publishes synthetic device messages through a broker into their Live sessions.
It is different from `simulator.run`, which writes only to simulated sessions.
`simulator.demo` reads its process environment/CLI flags; unlike the backend it
does not load `.env` itself. Run `--help` for `--api`, `--mqtt-host`, `--mqtt-port`,
`--setup-only`, and `--reset`. `--reset` deletes its existing Demo projects.
Do not use a demo project as evidence of physical telemetry.

## Optional email

Enable delivery only after testing a reachable SMTP service:

| Variable | Meaning |
| --- | --- |
| `AGENTWIN_SMTP_HOST` | SMTP server hostname; empty disables email setup. |
| `AGENTWIN_SMTP_PORT` | `587` for typical STARTTLS or `465` for implicit TLS. |
| `AGENTWIN_SMTP_SECURITY` | `starttls` (default), `ssl`, or `none` for a trusted local relay. |
| `AGENTWIN_SMTP_USER`, `AGENTWIN_SMTP_PASSWORD` | Credentials required by your mail service. |
| `AGENTWIN_EMAIL_FROM` | Sender address accepted by the service. |
| `AGENTWIN_EMAIL_TO` | Default recipient; a project can override it in settings. |

Project monitoring settings control alert email and summaries independently.
Simulation events do not send email. Summaries include the last stored Live
telemetry age and timestamp; missing telemetry remains unknown. Queued deliveries
have bounded retries, and configuration status alone does not prove delivery.

## Local data and secrets

`.env*` variants, `data/`, SQLite copies, broker passwords/ACLs, firmware
`secrets.h`, and generated artifacts are ignored by Git. `.env.example` and
`secrets.example.h` contain placeholders only. Ignore rules do not remove files
already tracked or erase Git history. See [SECURITY.md](../SECURITY.md) for leak
handling and the [release checklist](open-source-readiness.md) before publication.
