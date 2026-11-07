# Contributing to Agentwin

Bug reports, documentation fixes, tests, and focused improvements are welcome.
Use the [README](README.md#quick-start) to install Python and frontend dependencies,
then read [local development](docs/local-development.md) for services and tests.

## Start with a small change

1. Search existing issues and pull requests to avoid duplicate work.
2. For a substantial feature or architecture change, open an issue describing the
   problem and proposed behavior first. Small bug fixes and documentation edits
   can go straight to a pull request.
3. Fork the repository and create a branch for one coherent change.
4. Implement the change with relevant tests or manual verification.
5. Open a pull request explaining the problem, resulting behavior, and validation.

Use respectful, constructive discussion. Report security concerns privately
through the [security policy](SECURITY.md), not public issues.

## Find the right module

| Change | Start here |
| --- | --- |
| Request validation or telemetry types | `backend/models.py`, `schemas/` |
| API route behavior | `backend/main.py` |
| Persistence, retention, or event rules | `backend/store.py` |
| MQTT, simulation, or background tasks | `backend/runtime.py` |
| Agent observation tools or provider behavior | `backend/agent.py` |
| Operator-command interpretation and validation | `backend/control_intent.py`, `backend/control_proposals.py` |
| React UI | The matching `frontend/src/features/` directory |
| New supported hardware | [Hardware Template guide](docs/hardware-templates.md) |

Prefer named functions and one operation per statement. Extract a helper when it
names a real responsibility or removes repeated behavior. Avoid general-purpose
frameworks for a single use case. Keep behavior changes separate from broad
formatting or moving files so reviewers can understand the change.

## Preserve operational boundaries

- Validate telemetry and hardware commands on the server. UI checks are additional
  feedback, not a replacement for validation.
- Keep project, device, and session scope explicit. Synthetic sessions cannot
  operate real hardware or confirm physical setup.
- A published command is only requested; matching device telemetry confirms it.
- Treat device text and model output as untrusted data. Never let a model choose
  a different project, bypass validation, or provide credentials.
- Keep portable firmware code independent of board networking, EEPROM, and GPIO;
  hardware-specific behavior belongs in a board library or project driver.

## Validate your change

From the repository root:

```bash
# macOS / Linux; use .\.venv\Scripts\python.exe on Windows.
.venv/bin/python -m pytest -q
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
```

Enable `RUN_MQTT_TESTS=1` for gateway/ingestion changes. Run the browser smoke test
for onboarding and workspace changes using a disposable database. See
[optional test setup](docs/local-development.md#tests). Model and physical-device
checks require their respective services; explicitly report when they were not run.
Do not replace meaningful tests with disabled assertions or empty test runs.

Keep dependency updates intentional. Use `npm ci` and `requirements.lock` for
normal development. When changing dependencies, update both the declaration
(`frontend/package.json` or `requirements.in`) and its corresponding lockfile,
explain why, and review upstream license/security changes. Include third-party
copyright and license notices when importing code or assets.

## Before submitting

- Include only files relevant to the change; do not commit local databases,
  `.env` files, firmware secrets, broker password files, or generated artifacts.
- Sanitize logs and screenshots; review filenames and Git diffs for accidental data.
- Update documentation for changed setup, configuration, or behavior.
- State which checks passed, failed, or were not run and why.
- Confirm you have permission to contribute the code or assets. Contributions are
  provided under the repository's [MIT License](LICENSE).
