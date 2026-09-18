# Frontend modernization

## Scope and architecture

Agentwin remains a React 19 / Vite application using React Router, plain CSS, Lucide, Recharts, and React Flow. The existing routes, component data flows, API client, subscriptions, freshness calculations, onboarding state, graph model, and command verification contracts remain in place. No backend, gateway, firmware, schema, or dependency versions changed.

The audit found presentation and operational logic together in `frontend/src/main.tsx`, with several historical CSS layers. Shared colors are now centralized rather than repeated across those layers. Existing layouts were incrementally restyled; the application was not rewritten.

## Implementation

| Files | Changes |
| --- | --- |
| `frontend/src/tokens.css` | Semantic dark/light colors, surfaces, status colors, typography aliases, radii, spacing, shadows, blur, motion, and chrome elevation. |
| `frontend/src/theme.tsx`, `frontend/index.html` | Dark / Light / System provider and switchers. Validated localStorage preference, pre-render theme initialization, system-change listener, cross-tab synchronization, blocked-storage fallback, native color scheme and theme-color metadata. One root crossfade on supported browsers, with reduced-motion fallback. |
| `frontend/src/ui.tsx` | Reusable native modal dialog with Escape, focus containment/restoration and backdrop dismissal; measured sliding tabs with roving focus, arrow/Home/End keys, and tab-panel associations. |
| `frontend/src/motion.css` | Installed transitions.dev modal, sliding-tab and panel-reveal CSS. Reference snippets remain intact; product-specific inspector timing is scoped in modern.css. |
| `frontend/src/styles.css`, `frontend/src/modern.css` | Shared native button/form/status/panel treatments; accessible focus and disabled/error states; page and workspace layouts; theme-aware charts, graph, minimap and inspector; restored project-card status and metadata. |
| `frontend/src/main.tsx` | Collapsible desktop navigation rail, mobile navigation dialog, skip link, Settings appearance controls, project-management confirmation, semantic tabs, theme-aware chart/graph styling and agent request-error display. |
| `frontend/tests/*`, `frontend/package.json` | Configurable smoke URL, responsive/theme review, isolated MQTT device fixture and operational browser checks; `test:ui` and `test:operations` scripts. |
| `.agents/skills/*`, `skills-lock.json` | Requested transitions.dev and transitions-polish installation. |

Glass is limited to navigation, overview summary, dialog and agent surfaces. Opaque surfaces provide the fallback when backdrop filtering is unavailable. Regular data panels remain opaque. The Pearl Slate light palette uses #E9EAF2 for the page, #E1E2EC for secondary areas and #F0F0F6 for normal panels. #D8D5E5 is reserved for raised controls and active states rather than progressively darkening every surface. Light text and accent treatments use #17151F, #4F5363, #737888, #2CA5E0 and #0878AD.

Desktop navigation floats beside a bounded content area and can collapse to labeled icon links. Mobile navigation uses a native modal sheet. Workspace panels stack at narrower widths; tabs scroll horizontally, the Twin inspector moves below the canvas, and forms collapse to one column. Technical IDs, timestamps, freshness, source/session information and statuses remain available.

Motion follows transitions.dev: sliding tab indicator, asymmetric dialog opening/closing, and a short inspector reveal on component selection. Rail and route transitions use shared durations/easing. Theme switching crossfades the root. Reduced motion disables these effects, and telemetry values/chart updates do not animate.

Functional changes are confined to UI state and interaction: theme preference, rail/dialog state, keyboard tabs, and a caught/displayed agent request error. The session badge now displays the actual session mode instead of a hardcoded green “live” label. The deletion API call remains behind explicit confirmation; command completion is still determined by backend evidence.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run lint` | Passed. |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd run build` | Passed. Existing-style large-chunk warning: application bundle approximately 851 kB / 256 kB gzip. |
| `npm.cmd run smoke` with isolated test URL | Passed: six-stage project creation, views, agent prompts, Twin component selection, mobile overflow and browser errors. |
| `npm.cmd run test:ui` | 160 combinations: 10 views, both themes, widths 360/390/430/768/1024/1280/1440/1920. No document overflow or browser errors. Also verifies persistence, live system preference, clipboard, keyboard tabs, dialog dismissal/focus, mobile navigation and reduced motion. |
| `npm.cmd run test:operations` | Passed against an isolated MQTT fixture: pending command retains old value; matching telemetry completes it via WebSocket; reading history; missing telemetry; acknowledgement without recovery; actual recovery; session restrictions; agent failure; confirmed deletion. |
| `.venv\Scripts\python.exe -m pytest -q` | 9 passed, 1 opt-in integration test skipped; one Starlette/AnyIO deprecation warning. |
| `RUN_MQTT_TESTS=1` with `tests/test_mqtt_integration.py` | The existing test failed at line 64: it expects the default project's latest reading to be None after successfully verifying live ingestion and WebSocket delivery. Backend and test are unchanged. |
| `git diff --check` | Passed. |

Screenshots and machine-readable results are in `artifacts/ui-review/`; these are intentionally ignored by Git. Responsive captures wait for the project tab content and backend connection before capture. Visual inspection includes overview, projects, workspace tabs, Twin, agent, onboarding and settings across both themes.

## Reproducing the isolated review

Build the frontend, then run these in separate PowerShell terminals from the repository root:

```powershell
node frontend/tests/mqtt-broker.mjs 18839
```

```powershell
$env:DATABASE_PATH = 'E:\SALEH\GITHUB\Agentwin\artifacts\ui-review.db'
$env:MQTT_PORT = '18839'
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8011
```

```powershell
node frontend/tests/review-proxy.mjs
```

The loopback proxy on 5173 preserves the application's existing allowed development origin while forwarding to the isolated backend. From `frontend`:

```powershell
$env:AGENTWIN_TEST_URL = 'http://127.0.0.1:5173'
npm.cmd run smoke
npm.cmd run test:ui
npm.cmd run test:operations
```

The tests create and delete only their own fixture projects. The operational fixture publishes synthetic MQTT telemetry and never controls physical hardware.

## Remaining limitations

- Review the existing opt-in integration test's default-session assertion separately; it was not changed to mask the failure.
- Splitting the large application bundle and further removing historical layout overrides are reasonable follow-ups, separate from this presentation change.
- Browser verification used Chromium/Edge. Physical devices and a configured AI provider were not exercised; the provider-failure test uses an explicit HTTP fixture.
- No commit or deployment was performed.
