# Public-release review

This document records the repository preparation and the remaining release
checks. It is not a claim that a public release or fresh-machine deployment has
already been tested.

## Changes prepared

- A hardware-free quick start, separate configuration and hardware guides, and
  contributor documentation replace the hardware-specific README entry point.
- The original code has an MIT license. Dependencies and third-party materials
  retain their own licenses.
- API routes use named steps instead of compressed multi-operation statements;
  shutdown cleans up background tasks and the database even after an exception.
- Browser scripts share one launcher, defaulting to Playwright Chromium with
  optional executable/channel overrides instead of Windows installation paths.
- The simulator CLI requires an actual project ID and explicitly selects a
  simulated session instead of sending scenario commands to the default Live view.
- Git and Docker ignore rules cover local environment variants, credential files,
  database copies, and generated artifacts.
- A GitHub Actions workflow runs backend tests, the MQTT fixture, frontend checks,
  evaluation-case validation, and the browser smoke test. Actual GitHub-hosted
  execution still needs to be observed after the workflow is pushed.

## Local validation

Validated on Linux with Python 3.12 and Node.js 24:

| Check | Result |
| --- | --- |
| Backend suite with `RUN_MQTT_TESTS=1` | 157 passed; 2 optional LM Studio integration tests skipped. |
| Frontend unit/model checks | 33 passed, plus Twin state checks. |
| ESLint, TypeScript, production build | Passed; the existing large-chunk warning remains. |
| Browser smoke | Passed in system Chromium using `AGENTWIN_BROWSER_PATH`; onboarding, project views, keyboard component selection, and mobile layout. |
| Simulator CLI | Normal, pause, recovery, and stop succeeded; simulated readings were stored while Live remained empty. |
| Evaluation harness | 30 frozen cases validated; model inference was not run. |

Windows instructions, physical hardware, SMTP delivery, external AI services, and
the Docker application image were not exercised in this validation.

## Credential and privacy review

Gitleaks 8.24.3 reported no findings for the working tree or all locally available
Git refs during preparation on 2026-11-07. The release binary's SHA-256 was checked
against the upstream checksum list before use. No `.env`, firmware `secrets.h`,
broker password file, or database was tracked; the corresponding examples contain
placeholders. Re-run scans immediately before release:

```bash
gitleaks git --redact --log-opts="--all" .
gitleaks dir --redact .
git status --short
```

Automated credential scans cannot establish that every document, screenshot, PDF,
or device identifier is suitable for publication. Review these existing materials
with the people who own them:

| Material | Review needed |
| --- | --- |
| `IDRAK_Project_Brief.md`, `IDRAK_Team_Overview_EN.md` | Team plans, authorship/consent, and whether historical product proposals belong in the release. |
| `output/mvp-screenshots/`, `output/pdf/` | Visible project/device/network details, personal information, and image/PDF metadata. |
| `firmware/projects/R4_jamming_detector/RF_jamming.ino` | Permission and attribution for the supplied model weights and original inference code. |
| `frontend/public/assets/`, `backend/assets/` | Ownership and redistribution rights for branding and artwork. |
| Dependencies and bundled fonts | Upstream licenses and required notices; include notices for copied third-party source/assets. |

Retain original license/copyright notices. Adding MIT at the root does not grant
rights to materials owned by someone else. If a secret is later found, revoke or
rotate it and handle historical exposure before making the repository public.

## Further simplification recommendations

Keep follow-up changes small and preserve the existing contract tests:

| Area | Complexity observed | Suggested next step |
| --- | --- | --- |
| `backend/store.py` | Schema initialization, migrations, ingestion, alert evaluation, retention, and summaries share one class. | Extract ordered migrations first, then separate read queries and monitoring rules while preserving transactions and locking. |
| `backend/runtime.py` | Nested MQTT callbacks combine decoding, topic checks, status updates, and persistence. | Extract a scoped message handler and test retained, oversized, mismatched, and malformed packets before moving callbacks. |
| `backend/agent.py` | Provider calls, evidence selection, sanitization, and fallback logic are mixed. | Introduce a small provider adapter while retaining the deterministic controller and evidence validation. |
| `frontend/src/features/projects/AddProject.tsx` | Two setup workflows and many coupled state updates share one component. | Extract typed draft state and step validation, then presentation components for device/field editors. |
| `frontend/src/features/workspace/Workspace.tsx` | HTTP/WebSocket lifecycle, selection guards, layout, and resizing share one component. | Extract the scoped data hook first; preserve stale-response guards when switching projects/sessions. |
| Browser review scripts | A shared launcher fixes browser portability, but some specialized scripts still reference Windows Python paths and historical UI selectors. | Migrate the remaining fixture processes and outdated flows individually; treat the core smoke as the supported entry point. |
| Production frontend build | The main JS chunk remains approximately 1 MB before compression. | Measure route loading before splitting heavy chart/editor imports; do not raise the warning threshold to hide it. |
| Docker application image | The current Dockerfile omits `firmware/`, although template/package APIs depend on those files. | Include required template/sketch resources with secret exclusions and validate template listing and firmware export inside the image before recommending it as a complete app distribution. |

These broader refactors are deliberately left as follow-ups; the current tests
protect device-command confirmation, session isolation, and evidence boundaries.
Do not remove those checks to reduce the apparent size of the codebase.

## Maintainer checklist before publishing

- [ ] Confirm ownership and notices for the materials listed above.
- [ ] Re-run credential scans over the final files and complete Git history.
- [ ] Run the checks in `CONTRIBUTING.md` and the browser smoke on an empty database.
- [ ] Observe a successful GitHub Actions run; enable branch protection and required checks.
- [ ] Enable GitHub private vulnerability reporting, secret scanning, and push protection where available.
- [ ] Review release contents; exclude local databases, credentials, raw logs, and private screenshots.
- [ ] Tag a version and describe supported local workflows and known hardware/AI limitations.

`LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `.gitignore`, and a pull-request
template are included. Consider issue forms, a project-specific code of conduct
with a real enforcement contact, a changelog, dependency-update automation, and
third-party notices as the project grows. Choose contacts and support commitments
that maintainers can actually provide.
