# shadcn/ui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Agentwin frontend's hand-rolled components and ~5,200 lines of legacy CSS with shadcn/ui (Radix) on Tailwind CSS v4, while keeping the current look (dark/light/system themes, purple accent, DM Sans/Manrope).

**Architecture:** Tailwind v4 and shadcn are added next to the existing CSS. shadcn tokens are bridged onto the existing `tokens.css` variables. Legacy CSS lives in a `legacy` cascade layer, which sits above Tailwind's preflight and below its utilities. A guard rule inside that layer makes every shadcn element (`[data-slot]`) ignore legacy styles. `main.tsx` is first split into feature files with no behavior change, then migrated area by area. Each commit leaves the app working. Legacy CSS is pruned as areas migrate and deleted at the end.

**Tech Stack:** React 19, Vite 8, TypeScript 6, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (`radix-nova` style, Radix primitives), `tw-animate-css`, lucide-react, Recharts 3 via the shadcn `chart` component, React Router 7, and Playwright (node scripts in `frontend/tests`).

**Spec:** `docs/superpowers/specs/2026-09-25-shadcn-ui-migration-design.md`

---

## Ground rules for every task

- All paths are relative to the `frontend/` folder unless they start with `docs/` or `tests/` at the repo root. Run npm commands from `frontend/`.
- **Checks after every task** (all three must pass before committing):
  ```bash
  npm run lint
  npm run typecheck
  npm run build
  ```
  `npm run build` prints a large-chunk warning. That warning existed before this work and is expected.
- **Hook classes.** The Playwright tests find elements by these classes, so they must stay on the migrated elements. Their legacy styling is pruned. The list: `page` (on `<main>`), `sidebar`, `app-shell`, `topbar-search-trigger`, `tab-content`, `workspace-grid`, `workspace-main`, `workspace-agent`, `agent-mini`, `source-note`, `source-picker`, `control-card`, `control-state`, `badge`, `event-item`, `transition-list`, `monitoring-heading`, `monitoring-actions`, `live-twin-workspace`, `live-twin-canvas`, `session-kicker` (+ `live`/`simulation`/`replay`), plus the twin SVG/React Flow internals (`physical-svg`, `flow-svg`, `flow-node`, `twin-node`, `twin2d-caption`, `board-logo`, `is-active`, `is-selected`, `react-flow__node`). Twin internals are not touched by this plan.
- **Accessible names are part of the contract.** Before changing a label, button text or `aria-label`, grep `tests/*.mjs` for it. Keep every name the tests use unless a task explicitly updates the test.
- **Legacy CSS pruning.** Task 1 adds `scripts/legacy-css.mjs`:
  - `node scripts/legacy-css.mjs unused` lists legacy classes that no longer appear in `src/` or `tests/`.
  - `node scripts/legacy-css.mjs prune-unused` deletes their selectors.
  - `node scripts/legacy-css.mjs prune <class...>` deletes selectors for specific classes, such as hook classes whose legacy styling would fight the new utilities.

  Run `prune-unused` at the end of every migration task.
- **Visual parity.** Each area task ends with a screenshot comparison against the Task 0 baselines. Tailwind values in this plan are the intended defaults. If a screenshot shows a clear deviation from the baseline (spacing, color or size), adjust utilities in that component to match. Don't reintroduce legacy CSS.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

## File structure (end state)

```
frontend/
  components.json                    shadcn config (radix-nova, aliases)
  scripts/legacy-css.mjs             legacy CSS audit/prune helper (deleted in final task)
  src/
    main.tsx                         root: CSS imports, providers, router
    index.css                        Tailwind, token bridge, base layer, legacy layer (legacy removed at end)
    tokens.css                       unchanged palette (source of truth)
    theme.tsx                        ThemeProvider (unchanged logic) + ThemeSwitcher (shadcn Toggle)
    types.ts                         unchanged API/types
    lib/utils.ts                     cn()
    lib/format.ts                    shared formatters (summaryTime, emailStatus, sessionLabel, metricValue, …)
    hooks/use-mobile.ts              added by shadcn sidebar
    components/ui/*                  shadcn components (generated)
    components/Mark.tsx              brand mark SVG
    components/StatusBadge.tsx       status badge with dot (wraps ui/badge)
    components/Stat.tsx              stat tile (Card)
    components/CopyId.tsx            CompactId, ProjectId
    components/FormField.tsx         Label + control + hint
    components/OptionSelect.tsx      Select wrapper with data-value hooks for tests
    components/Page.tsx              <main className="page"> layout
    components/PageHeading.tsx       page title block
    components/SectionHeading.tsx    section title row
    components/EmptyState.tsx        icon + title + text
    components/SlidingTabs.tsx       TabsList with sliding indicator
    components/useTabIndicator.ts    indicator measurement hook
    app/App.tsx                      routes + shell composition
    app/AppSidebar.tsx               shadcn Sidebar navigation
    app/Topbar.tsx                   top bar
    app/SystemSwitcher.tsx           project switcher (DropdownMenu)
    app/CommandLauncher.tsx          Ctrl+K search (CommandDialog)
    app/SystemStatus.tsx             HealthRows + status Popover
    app/useWorkspaceData.ts          projects/health/websocket state
    app/types.ts                     ServiceHealth, ProjectContext, CommandItem
    features/overview/Overview.tsx
    features/overview/PlatformAnalytics.tsx
    features/projects/AddProject.tsx
    features/workspace/Workspace.tsx
    features/workspace/ProjectOverview.tsx
    features/workspace/Readings.tsx
    features/workspace/ControlsPanel.tsx
    features/workspace/Events.tsx
    features/agent/AgentPanel.tsx
    features/events/GlobalEvents.tsx
    features/settings/GlobalSettings.tsx
    features/settings/MonitoringSettings.tsx   (moved from src/MonitoringSettings.tsx)
    features/digital-twin/*          existing; chrome migrated, SVG/canvas untouched
    features/digital-twin/live-twin.css        canvas/SVG rules only, in @layer components
  tests/helpers.mjs                  chooseValue() for Radix Select
Deleted by the end: src/ui.tsx, src/styles.css, src/modern.css, src/motion.css
```

---

### Task 0: Baseline test run and screenshots

This task records how the suites behave before any change, so later failures can be told apart from pre-existing ones.

**Files:**
- Modify (only if needed): `frontend/tests/*.mjs`, limited to selector/text drift

- [ ] **Step 1: Start the isolated review environment** (four PowerShell terminals from the repo root; see `docs/frontend-modernization.md` → "Reproducing the isolated review")

Terminal A:
```powershell
node frontend/tests/mqtt-broker.mjs 18839
```
Terminal B:
```powershell
$env:DATABASE_PATH = "$PWD\artifacts\ui-review.db"; $env:MQTT_PORT = '18839'
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8011
```
Terminal C:
```powershell
node frontend/tests/review-proxy.mjs
```
Terminal D (the frontend build served by the backend is not used; the proxy on 5173 forwards to 8011):
```powershell
cd frontend; $env:AGENTWIN_TEST_URL = 'http://127.0.0.1:5173'
```
If `review-proxy.mjs` expects a built `dist/`, run `npm run build` in `frontend/` first. Read the top of `tests/review-proxy.mjs` to confirm what it serves.

- [ ] **Step 2: Run every suite and record the results**

From Terminal D (`frontend/`):
```powershell
npm run smoke; npm run test:ui; npm run test:operations; node tests/project-actions-layout.mjs; node tests/twin-state.mjs
```
Record pass/fail and the first error line for each suite in `..\artifacts\baseline.txt`. The file is git-ignored under `artifacts/`.

`tests/monitoring-ui.mjs` needs `AGENTWIN_BASE`, `AGENTWIN_PROJECT_ID` and optionally `AGENTWIN_OTHER_PROJECT_ID`. Create a disposable project with:
```powershell
$p = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:5173/api/projects -ContentType 'application/json' -Body '{"name":"Monitoring review","template":"temperature","device_id":"mon-01","connector":"mqtt"}'
$env:AGENTWIN_BASE='http://127.0.0.1:5173'; $env:AGENTWIN_PROJECT_ID=$p.id; node tests/monitoring-ui.mjs
```
`tests/twin-2d-review.mjs` uses a fixed base of `http://127.0.0.1:5173`, and it also runs against the proxy.

- [ ] **Step 3: Fix only selector/text drift in tests**

These are known suspects from reading the code:
- `smoke.mjs` expects placeholder `"Ask about a reading, change, event, or allowed action"`; the app uses `"Ask Win about this system..."`.
- `operations-review.mjs` clicks `"Ask project agent"`; the app's send button is labelled `"Send question to Win"`.
- `ui-review.mjs` waits for the text `"Backend connected"`, which is not currently rendered.

For each failure where the test looks for text or labels the app no longer has, update the test to the app's current text. Do not change app code in this task. If a failure looks like a real app bug rather than drift, stop and report it to the user.

- [ ] **Step 4: Save baseline screenshots**

```powershell
Copy-Item -Recurse ..\artifacts\ui-review ..\artifacts\ui-review-before
```

- [ ] **Step 5: Commit (only if tests changed)**

```bash
git add frontend/tests
git commit -m "test: align stale selectors with current UI text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Tailwind v4 + shadcn foundation (no visual change)

**Files:**
- Modify: `package.json` (deps), `vite.config.ts`, `tests/twin-vite.config.ts`, `tsconfig.json`, `src/main.tsx:54-59`, `src/features/digital-twin/live-twin.css`
- Create: `components.json`, `src/lib/utils.ts`, `src/index.css`, `scripts/legacy-css.mjs`

- [ ] **Step 1: Install dependencies**

```bash
npm install tailwindcss @tailwindcss/vite tw-animate-css shadcn class-variance-authority clsx tailwind-merge
npm install -D @types/node postcss
```

- [ ] **Step 2: Add the `@/` alias and Tailwind plugin to `vite.config.ts`**

Replace the whole file:
```ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
const backend = process.env.AGENTWIN_BACKEND_URL || "http://127.0.0.1:8000";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: { proxy: { "/api": { target: backend, ws: true } } },
});
```

- [ ] **Step 3: Same for `tests/twin-vite.config.ts`**

Replace the whole file:
```ts
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../src") } },
  server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy: { "/api": { target: "http://127.0.0.1:8001", ws: true } } },
});
```

- [ ] **Step 4: Add `paths` to `tsconfig.json`**

Add inside `compilerOptions` (after `"noUnusedParameters": true`, adding a comma):
```json
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
```
If TypeScript 6 reports `baseUrl` as deprecated, drop `baseUrl` and keep `"paths": { "@/*": ["./src/*"] }`. TS resolves `paths` relative to the tsconfig.

- [ ] **Step 5: Create `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 6: Create `src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Create `src/index.css`**

The legacy variable names `--background`, `--primary`, `--secondary`, `--muted`, `--accent` and `--border` already exist in `tokens.css`, and `--secondary`, `--muted` and `--accent` carry different meanings there. The Tailwind `--color-*` tokens therefore map directly to legacy semantic variables. Only non-colliding shadcn variable names are defined as raw vars.

```css
/* Layer order: legacy CSS beats Tailwind preflight but loses to shadcn components and utilities. */
@layer theme, base, legacy, components, utilities;

@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./tokens.css";
@import "./motion.css" layer(legacy);
@import "./styles.css" layer(legacy);
@import "./modern.css" layer(legacy);

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* shadcn variable names that do not collide with tokens.css. */
:root {
  --foreground: var(--text-primary);
  --card: var(--surface);
  --card-foreground: var(--text-primary);
  --popover: var(--surface);
  --popover-foreground: var(--text-primary);
  --destructive: var(--danger);
  --input: var(--border-strong);
  --ring: var(--accent-text);
  --radius: var(--radius-control);
  --chart-1: var(--operational-cyan);
  --chart-2: var(--accent-text);
  --chart-3: var(--success);
  --chart-4: var(--warning);
  --chart-5: var(--info);
  --sidebar: var(--sidebar-glass);
  --sidebar-foreground: var(--text-secondary);
  --sidebar-primary: var(--accent);
  --sidebar-primary-foreground: var(--accent-foreground);
  --sidebar-accent: var(--accent-subtle);
  --sidebar-accent-foreground: var(--text-primary);
  --sidebar-border: var(--border);
  --sidebar-ring: var(--accent-text);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--accent);
  --color-primary-foreground: var(--accent-foreground);
  --color-secondary: var(--surface-elevated);
  --color-secondary-foreground: var(--text-primary);
  --color-muted: var(--surface-elevated);
  --color-muted-foreground: var(--text-muted);
  --color-accent: var(--surface-hover);
  --color-accent-foreground: var(--text-primary);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  /* Agentwin semantic extras. */
  --color-subtle-foreground: var(--text-secondary);
  --color-brand: var(--accent-text);
  --color-brand-subtle: var(--accent-subtle);
  --color-brand-border: var(--accent-border);
  --color-operational: var(--operational-cyan);
  --color-success: var(--success);
  --color-success-subtle: var(--success-subtle);
  --color-warning: var(--warning);
  --color-warning-subtle: var(--warning-subtle);
  --color-warning-border: var(--warning-border);
  --color-danger: var(--danger);
  --color-danger-subtle: var(--danger-subtle);
  --color-danger-border: var(--danger-border);
  --color-info: var(--info);
  --color-glass: var(--glass);
  --color-backdrop: var(--backdrop);
  --radius-sm: calc(var(--radius-control) - 4px);
  --radius-md: calc(var(--radius-control) - 2px);
  --radius-lg: var(--radius-control);
  --radius-xl: var(--radius-panel);
  --radius-2xl: var(--radius-dialog);
  --font-sans: "DM Sans Variable", "Segoe UI", sans-serif;
  --font-heading: "Manrope Variable", "DM Sans Variable", "Segoe UI", sans-serif;
  --shadow-elevated: var(--shadow-panel);
  --shadow-overlay: var(--shadow-dialog);
  --ease-smooth: var(--ease-smooth-out);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background font-sans text-foreground antialiased;
  }
  h1, h2, h3, h4 {
    font-family: var(--font-heading);
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation: none !important;
      transition-duration: 0s !important;
      scroll-behavior: auto !important;
    }
  }
}

/* shadcn elements carry data-slot; roll back every legacy declaration on them to Tailwind's base layer. */
@layer legacy {
  [data-slot][data-slot][data-slot] {
    all: revert-layer;
  }
}
```

- [ ] **Step 8: Point `src/main.tsx` at `index.css`**

Replace `src/main.tsx` lines 56-59:
```ts
import "./tokens.css";
import "./motion.css";
import "./styles.css";
import "./modern.css";
```
with:
```ts
import "./index.css";
```

- [ ] **Step 9: Put `live-twin.css` into the legacy layer**

It is imported unlayered by the lazy `DigitalTwin.tsx` chunk, and unlayered CSS would beat Tailwind utilities. Wrap the entire file:
- Add `@layer legacy {` as the new first line of `src/features/digital-twin/live-twin.css`.
- Add `}` as the new last line.

- [ ] **Step 10: Create `scripts/legacy-css.mjs`**

```js
// Legacy CSS audit/prune helper for the shadcn migration.
//   node scripts/legacy-css.mjs unused              list legacy classes no longer referenced in src/ or tests/
//   node scripts/legacy-css.mjs prune-unused        remove selectors that use those classes
//   node scripts/legacy-css.mjs prune a b c         remove selectors that use any of the given classes
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const stylesheets = ["src/styles.css", "src/modern.css", "src/motion.css", "src/features/digital-twin/live-twin.css"].filter((file) => fs.existsSync(file));
const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === "ui" && dir.endsWith("components") ? [] : sourceFiles(full);
  return /\.(tsx?|mjs)$/.test(entry.name) ? [full] : [];
});
const source = [...sourceFiles("src"), ...sourceFiles("tests")].map((file) => fs.readFileSync(file, "utf8")).join("\n");
const classesIn = (selector) => [...selector.replace(/\[[^\]]*\]/g, "").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]);

function legacyClasses() {
  const found = new Set();
  for (const file of stylesheets) postcss.parse(fs.readFileSync(file, "utf8")).walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    rule.selectors.forEach((selector) => classesIn(selector).forEach((name) => found.add(name)));
  });
  return [...found].sort();
}
const referenced = (name) => new RegExp(`(^|[^\\w-])${name.replace(/[-]/g, "\\-")}(?![\\w-])`).test(source);

function prune(classes) {
  const targets = new Set(classes);
  for (const file of stylesheets) {
    const root = postcss.parse(fs.readFileSync(file, "utf8"));
    let removed = 0;
    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
      const keep = rule.selectors.filter((selector) => !classesIn(selector).some((name) => targets.has(name)));
      if (keep.length === rule.selectors.length) return;
      removed += rule.selectors.length - keep.length;
      if (keep.length) rule.selectors = keep;
      else rule.remove();
    });
    let changed = true;
    while (changed) {
      changed = false;
      root.walkAtRules((atRule) => { if (atRule.nodes && atRule.nodes.length === 0) { atRule.remove(); changed = true; } });
    }
    if (removed) {
      fs.writeFileSync(file, root.toString());
      console.log(`${file}: removed ${removed} selector(s)`);
    }
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "unused") console.log(legacyClasses().filter((name) => !referenced(name)).join("\n") || "(none)");
else if (command === "prune-unused") prune(legacyClasses().filter((name) => !referenced(name)));
else if (command === "prune" && args.length) prune(args);
else { console.error("usage: legacy-css.mjs unused | prune-unused | prune <class...>"); process.exit(1); }
```
Add `"scripts"` to the `ignores` array in `eslint.config.js` (`{ ignores: ["dist", "tests", "scripts"] }`). The existing `scripts/render-email-logo.mjs` is unaffected.

- [ ] **Step 11: Verify the build and the layer order**

```bash
npm run lint && npm run typecheck && npm run build
node -e "const fs=require('fs');const f=fs.readdirSync('dist/assets').filter(n=>n.endsWith('.css'));const css=f.map(n=>fs.readFileSync('dist/assets/'+n,'utf8')).join('');console.log(/@layer theme,\s*base,\s*legacy,\s*components,\s*utilities/.test(css)?'layer order OK':'LAYER ORDER MISSING');console.log(css.includes('revert-layer')?'guard OK':'GUARD MISSING')"
node scripts/legacy-css.mjs unused
```
Expected: `layer order OK`, `guard OK`, and a list of unused legacy classes. That list shows the historical dead CSS. Don't prune it yet.

If the bundler rewrites `@layer` statements (for example by merging them), also confirm in DevTools that `button` elements in the running app still get the legacy padding. Run `npm run dev`, open http://127.0.0.1:5173 and inspect the "Add project" link/button.

- [ ] **Step 12: Visual smoke check**

Run `npm run test:ui` against the review environment (Task 0 Step 1). Compare `artifacts/ui-review/*.png` against `artifacts/ui-review-before/`. Expect no visible difference. Preflight is overridden by legacy CSS for every legacy-styled element. If headings or lists changed, add the missing legacy property to the `@layer base` block in `index.css` and note it there with a comment.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json components.json eslint.config.js tests/twin-vite.config.ts src/index.css src/lib/utils.ts src/main.tsx src/features/digital-twin/live-twin.css scripts/legacy-css.mjs
git commit -m "build: add Tailwind v4 and shadcn foundation with legacy CSS layer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Add shadcn components

**Files:**
- Create: `src/components/ui/*.tsx`, `src/hooks/use-mobile.ts` (generated)
- Modify: `src/components/ui/badge.tsx` (variants)

- [ ] **Step 1: Generate components**

```bash
npx shadcn@latest add button input textarea label select dialog alert-dialog sheet tabs card badge table tooltip switch checkbox separator scroll-area sidebar chart command popover dropdown-menu toggle skeleton alert collapsible --yes
```

- [ ] **Step 2: Revert CLI edits to `src/index.css`**

The CLI may inject its own theme variables. The token bridge from Task 1 is authoritative:
```bash
git diff --stat src/index.css
git checkout -- src/index.css
```

- [ ] **Step 3: Add Agentwin badge variants**

In `src/components/ui/badge.tsx`, add these two entries to the `variant` object inside `badgeVariants` (next to `destructive`):
```ts
        success: "border-transparent bg-success-subtle text-success",
        warning: "border-transparent bg-warning-subtle text-warning",
```

- [ ] **Step 4: Fix generated-code type errors, if any**

```bash
npm run typecheck
```
`chart.tsx` must compile against Recharts 3.10. If it reports errors, re-run `npx shadcn@latest add chart --overwrite --yes` (the registry version targets Recharts 3). If errors persist, fix the reported lines in `chart.tsx` only, keeping its public API (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartConfig`).

- [ ] **Step 5: Lint**

```bash
npm run lint
```
If ESLint flags generated files for rules this repo doesn't otherwise break (for example `react-refresh/only-export-components`, which this config doesn't enable), fix them in place. Don't disable rules globally.

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/components/ui src/hooks package.json package-lock.json
git commit -m "feat(ui): add shadcn components and status badge variants

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Split `main.tsx` into feature files (pure move)

No behavior or markup changes. Move code verbatim, add imports, and delete the two unused `Legacy*` components. Line numbers refer to `src/main.tsx` as of commit `fe977fc`. Read the ranges before cutting.

**Files:**
- Create: `src/lib/format.ts`, `src/app/types.ts`, `src/app/useDropdownClass.ts`, `src/app/SystemSwitcher.tsx`, `src/app/CommandLauncher.tsx`, `src/app/SystemStatus.tsx`, `src/app/App.tsx`, `src/components/Mark.tsx`, `src/components/StatusBadge.tsx`, `src/components/Stat.tsx`, `src/components/CopyId.tsx`, `src/features/overview/Overview.tsx`, `src/features/overview/PlatformAnalytics.tsx`, `src/features/projects/AddProject.tsx`, `src/features/workspace/{Workspace,ProjectOverview,Readings,ControlsPanel,Events}.tsx`, `src/features/agent/AgentPanel.tsx`, `src/features/events/GlobalEvents.tsx`, `src/features/settings/GlobalSettings.tsx`
- Move: `src/MonitoringSettings.tsx` → `src/features/settings/MonitoringSettings.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Move `MonitoringSettings.tsx`**

```bash
git mv src/MonitoringSettings.tsx src/features/settings/MonitoringSettings.tsx
```
In the moved file, change `from "./types"` (both imports) to `from "@/types"`.

- [ ] **Step 2: Create `src/lib/format.ts`**

Move these from `main.tsx`: `summaryTime` and `emailStatus` (lines 63-64), `sessionLabel` (127-128), `humanAction` (1005-1010), `metricValue` (1163-1168), `isVisibleMetric` (1170-1172) and `controlReady` (1174-1179). Prefix each with `export`. Header:
```ts
import type { Project, State } from "@/types";
```
`sessionLabel` becomes `export const sessionLabel = …`, and the `function` declarations become `export function …`.

- [ ] **Step 3: Create `src/app/types.ts`**

Move `ServiceHealth` (108-115), `ProjectContext` (117) and `CommandItem` (119-125), each prefixed with `export`.

- [ ] **Step 4: Create shared components**

- `src/components/Mark.tsx`: move `Mark` (68-92) as `export function Mark`.
- `src/components/StatusBadge.tsx`: move `Badge` (93-106), renamed to `export function StatusBadge`.
- `src/components/Stat.tsx`: move `Stat` (758-779) as `export function Stat`.
- `src/components/CopyId.tsx`: move `CompactId` (1012-1016) and `ProjectId` (1018-1022) as exports. Header:
  ```ts
  import { useState } from "react";
  import { Copy } from "lucide-react";
  ```

- [ ] **Step 5: Create the `app/` files**

- `src/app/useDropdownClass.ts`: move `useDropdownClass` (130-148) as an export. Header: `import { useEffect, useRef, useState } from "react";`
- `src/app/SystemSwitcher.tsx`: move `SystemSwitcher` (150-242). Header:
  ```ts
  import { useEffect, useMemo, useRef, useState } from "react";
  import { Link, useNavigate } from "react-router-dom";
  import { Check, ChevronRight, LayoutDashboard, Plus, Search } from "lucide-react";
  import type { State } from "@/types";
  import { Mark } from "@/components/Mark";
  import { useDropdownClass } from "./useDropdownClass";
  ```
- `src/app/CommandLauncher.tsx`: move `CommandLauncher` (244-328). Header:
  ```ts
  import { useEffect, useMemo, useRef, useState } from "react";
  import { useNavigate } from "react-router-dom";
  import { Bell, ChevronRight, Layers, Radio, Search, Settings as SettingsIcon } from "lucide-react";
  import type { State } from "@/types";
  import type { CommandItem } from "./types";
  import { useDropdownClass } from "./useDropdownClass";
  ```
- `src/app/SystemStatus.tsx`: move `HealthRows` (330-337) and `SystemStatus` (339-354). Header:
  ```ts
  import { ChevronRight } from "lucide-react";
  import type { ServiceHealth } from "./types";
  import { useDropdownClass } from "./useDropdownClass";
  ```
- `src/app/App.tsx`: move `App` (355-552) as `export function App`. Header:
  ```ts
  import { useCallback, useEffect, useState } from "react";
  import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
  import { Bell, Info, Layers, LayoutDashboard, Menu, MoreHorizontal, Radio, Settings as SettingsIcon, X } from "lucide-react";
  import type { State } from "@/types";
  import { api, strings } from "@/types";
  import { Dialog } from "@/ui";
  import { ThemeSwitcher } from "@/theme";
  import { Mark } from "@/components/Mark";
  import { sessionLabel } from "@/lib/format";
  import type { ProjectContext, ServiceHealth } from "./types";
  import { useDropdownClass } from "./useDropdownClass";
  import { SystemSwitcher } from "./SystemSwitcher";
  import { CommandLauncher } from "./CommandLauncher";
  import { HealthRows, SystemStatus } from "./SystemStatus";
  import { Overview } from "@/features/overview/Overview";
  import { Workspace } from "@/features/workspace/Workspace";
  import { AddProject } from "@/features/projects/AddProject";
  import { GlobalEvents } from "@/features/events/GlobalEvents";
  import { GlobalSettings } from "@/features/settings/GlobalSettings";
  ```

- [ ] **Step 6: Create the feature files**

Each file gets `export` on the moved function(s). Headers:

`src/features/overview/Overview.tsx`: `Overview` (553-739)
```ts
import { Link } from "react-router-dom";
import { Activity, ArrowRight, ArrowUpRight, AudioLines, Bell, Cable, ChevronRight, FlaskConical, Layers, Plus, Radio, ShieldCheck } from "lucide-react";
import type { State } from "@/types";
import { display, time } from "@/types";
import { StatusBadge as Badge } from "@/components/StatusBadge";
import { Stat } from "@/components/Stat";
import { PlatformAnalytics } from "./PlatformAnalytics";
```
`src/features/overview/PlatformAnalytics.tsx`: `PlatformAnalytics` (740-757)
```ts
import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { State } from "@/types";
import { display, time } from "@/types";
import { isVisibleMetric, metricValue } from "@/lib/format";
```
`src/features/workspace/Workspace.tsx`: `Workspace` (780-988)
```ts
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowDownRight, Bell, Cable, Database } from "lucide-react";
import type { State } from "@/types";
import { api, display, time } from "@/types";
import { Dialog, Tabs } from "@/ui";
import { StatusBadge as Badge } from "@/components/StatusBadge";
import { Stat } from "@/components/Stat";
import { ProjectId } from "@/components/CopyId";
import type { ProjectContext } from "@/app/types";
import { AgentPanel } from "@/features/agent/AgentPanel";
import { ProjectOverview } from "./ProjectOverview";
import { Readings } from "./Readings";
import { ControlsPanel } from "./ControlsPanel";
import { Events } from "./Events";

const DigitalTwin = lazy(() => import("@/features/digital-twin/DigitalTwin").then((module) => ({ default: module.DigitalTwin })));
```
(Move the `DigitalTwin` lazy declaration from line 66 here.)

`src/features/workspace/ProjectOverview.tsx`: `ProjectOverview` (995-1003)
```ts
import { Activity, Power } from "lucide-react";
import type { State } from "@/types";
import { display, time } from "@/types";
import { Stat } from "@/components/Stat";
import { CompactId } from "@/components/CopyId";
import { humanAction } from "@/lib/format";
```
`src/features/workspace/Readings.tsx`: `Readings` (1024-1031)
```ts
import { useState } from "react";
import { Activity } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { State } from "@/types";
import { time } from "@/types";
import { metricValue } from "@/lib/format";
```
`src/features/workspace/ControlsPanel.tsx`: `ControlsPanel` (1033-1038)
```ts
import { useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import type { Component, State } from "@/types";
import { api } from "@/types";
import { StatusBadge as Badge } from "@/components/StatusBadge";
import { controlReady, metricValue } from "@/lib/format";
```
`src/features/workspace/Events.tsx`: `Events` (1181-1287)
```ts
import { useState } from "react";
import { Bell, Check, ShieldCheck, X } from "lucide-react";
import type { Event as ProjectEvent, State } from "@/types";
import { api, display, time } from "@/types";
import { StatusBadge as Badge } from "@/components/StatusBadge";
import { emailStatus, summaryTime } from "@/lib/format";
```
`src/features/agent/AgentPanel.tsx`: `WinAvatar` (1040-1042) and `AgentPanel` (1044-1108)
```ts
import { useState } from "react";
import { Link } from "react-router-dom";
import { PanelRightClose, Send } from "lucide-react";
import type { Answer, State } from "@/types";
import { api, time } from "@/types";
import { Mark } from "@/components/Mark";
import { emailStatus, sessionLabel, summaryTime } from "@/lib/format";
```
`src/features/projects/AddProject.tsx`: `DraftComponent`, `componentPreset` and `AddProject` (1133-1162)
```ts
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import type { Project } from "@/types";
import { api } from "@/types";
```
`src/features/events/GlobalEvents.tsx`: `GlobalEvents` (1288-1330)
```ts
import { Link } from "react-router-dom";
import { ArrowRight, Bell } from "lucide-react";
import type { State } from "@/types";
import { time } from "@/types";
import { StatusBadge as Badge } from "@/components/StatusBadge";
import { emailStatus, summaryTime } from "@/lib/format";
```
`src/features/settings/GlobalSettings.tsx`: `GlobalSettings` (1331-1385)
```ts
import { useEffect, useState } from "react";
import type { State } from "@/types";
import { api, strings } from "@/types";
import { ThemeSwitcher } from "@/theme";
import { StatusBadge as Badge } from "@/components/StatusBadge";
import type { ServiceHealth } from "@/app/types";
import { ProjectMonitoringSettings } from "./MonitoringSettings";
```
Delete `LegacyProjectOverview` (990-993) and `LegacyAddProject` (1110-1132). Nothing imports them.

- [ ] **Step 7: Reduce `src/main.tsx` to the root**

Replace the whole file:
```tsx
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@xyflow/react/dist/style.css";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./index.css";
import { ThemeProvider } from "./theme";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider><App /></ThemeProvider>
  </BrowserRouter>,
);
```

- [ ] **Step 8: Fix imports until checks pass**

```bash
npm run typecheck
npm run lint
```
`noUnusedLocals` flags any import in the headers above that a moved function doesn't use. Remove it. A missing name means an import is missing; add it from the source listed in Steps 2-6. Don't change function bodies.

- [ ] **Step 9: Verify there is no behavior change**

```bash
npm run build
```
Then run `npm run smoke` and `npm run test:ui` against the review environment. The results must match `artifacts/baseline.txt`.

- [ ] **Step 10: Commit**

```bash
git add -A src
git commit -m "refactor: split main.tsx into app, feature, and shared component files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Shared components on shadcn

**Files:**
- Modify: `src/components/Mark.tsx`, `src/components/StatusBadge.tsx`, `src/components/Stat.tsx`, `src/components/CopyId.tsx`, `src/main.tsx`
- Create: `src/components/FormField.tsx`, `src/components/OptionSelect.tsx`, `src/components/Page.tsx`, `src/components/PageHeading.tsx`, `src/components/SectionHeading.tsx`, `src/components/EmptyState.tsx`, `src/components/useTabIndicator.ts`, `src/components/SlidingTabs.tsx`, `tests/helpers.mjs`

- [ ] **Step 1: `src/components/Mark.tsx`**

The fills come from legacy `modern.css:149-150`.
```tsx
import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg className={cn("size-8 shrink-0", className)} viewBox="0 0 48 40" fill="none" aria-hidden="true">
      <path className="fill-current" d="M2.5 36 17.6 4.3A2 2 0 0 1 19.4 3H24l-4.2 9L8.9 36H2.5Z" />
      <path className="fill-[#7c3aed]" d="M24.1 3h4.5a2 2 0 0 1 1.8 1.2L45.5 36h-6.4L20.2 12l3.9-9Z" />
      <path className="fill-current" d="M9.8 24h10.7v3H8.4l1.4-3Z" />
      <path className="fill-[#7c3aed]" d="M27.5 24h10.7l1.4 3H27.5v-3Z" />
      <path className="fill-current" d="m17.5 25.5 5-5v10l-5-5Z" />
      <path className="fill-[#7c3aed]" d="m23.5 20.5 5 5-5 5v-10Z" />
    </svg>
  );
}
```

- [ ] **Step 2: `src/components/StatusBadge.tsx`**

The old `tone` values (`""`, `"success"`, `"warning"`) keep working, so call sites don't change.
```tsx
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "neutral" | "";

export function StatusBadge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  const variant = tone === "success" || tone === "warning" ? tone : "secondary";
  return (
    <Badge variant={variant} className={cn("badge gap-1.5", className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", variant === "success" ? "bg-success" : variant === "warning" ? "bg-warning" : "bg-muted-foreground")} />
      {children}
    </Badge>
  );
}
```

- [ ] **Step 3: `src/components/Stat.tsx`**

```tsx
import { Card } from "@/components/ui/card";

export function Stat({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint: string; icon: React.ReactNode }) {
  return (
    <Card className="gap-2 p-4 shadow-none">
      <div className="flex items-center justify-between text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:text-brand">
        {label}
        {icon}
      </div>
      <strong className="font-heading text-2xl font-semibold text-foreground [&_em]:ml-1 [&_em]:text-sm [&_em]:font-normal [&_em]:not-italic [&_em]:text-muted-foreground">{value}</strong>
      <small className="text-xs text-muted-foreground">{hint}</small>
    </Card>
  );
}
```

- [ ] **Step 4: `src/components/CopyId.tsx`**

```tsx
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function useCopy(value: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return { copied, copy };
}

export function CompactId({ value }: { value: string }) {
  const { copied, copy } = useCopy(value);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={value}>
      <code className="font-mono">{value.slice(0, 8)}…</code>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="size-6" onClick={copy} aria-label={`Copy ${value}`}>
            <Copy className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy full ID</TooltipContent>
      </Tooltip>
      {copied && <small>Copied</small>}
    </span>
  );
}

export function ProjectId({ value }: { value: string }) {
  const { copied, copy } = useCopy(value);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Project ID</span>
      <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-foreground">{value}</code>
      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={copy} aria-label="Copy project ID">
        <Copy className="size-3.5" />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: `src/components/FormField.tsx`**

```tsx
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({ id, label, hint, className, children }: { id: string; label: React.ReactNode; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id} className="text-sm font-normal text-subtle-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 6: `src/components/OptionSelect.tsx`**

`data-value` on the trigger and on each option is the test hook. It replaces native `<select>`/`<option value>` lookups.
```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: React.ReactNode };

export function OptionSelect({ id, value, onValueChange, options, className, disabled, "aria-label": ariaLabel }: { id?: string; value: string; onValueChange: (value: string) => void; options: Option[]; className?: string; disabled?: boolean; "aria-label"?: string }) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} data-value={value} className={cn("w-full", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.filter((option) => option.value !== "").map((option) => (
          <SelectItem key={option.value} value={option.value} data-value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 7: Layout helpers**

`src/components/Page.tsx`:
```tsx
import { cn } from "@/lib/utils";

export function Page({ className, children }: { className?: string; children: React.ReactNode }) {
  return <main className={cn("page mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-6 px-4 py-6 md:px-8", className)}>{children}</main>;
}
```
`src/components/PageHeading.tsx`:
```tsx
export function PageHeading({ eyebrow, title, description, actions, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        {eyebrow && <div className="text-xs font-semibold tracking-wider text-brand uppercase">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions}
    </div>
  );
}
```
`src/components/SectionHeading.tsx`:
```tsx
export function SectionHeading({ title, aside, level = 2 }: { title: React.ReactNode; aside?: React.ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Heading className={level === 2 ? "text-lg font-semibold" : "text-base font-semibold"}>{title}</Heading>
      {aside && <div className="text-sm text-muted-foreground [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-brand [&_a:hover]:underline">{aside}</div>}
    </div>
  );
}
```
`src/components/EmptyState.tsx`:
```tsx
import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, children, action, className }: { icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground [&>svg]:size-8 [&>svg]:text-brand", className)}>
      {icon}
      {title && <strong className="text-base font-semibold text-foreground">{title}</strong>}
      {children}
      {action}
    </div>
  );
}
```

- [ ] **Step 8: Sliding tabs**

`src/components/useTabIndicator.ts`:
```ts
import { useLayoutEffect, useRef } from "react";

/** Positions an indicator under the active Radix tab trigger; animates on change, snaps on resize or first paint. */
export function useTabIndicator(value: string) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const move = (animate: boolean) => {
      const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (!active) return;
      if (!animate) indicator.style.transition = "none";
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
      indicator.style.width = `${active.offsetWidth}px`;
      if (!animate) {
        void indicator.offsetWidth;
        indicator.style.transition = "";
      }
    };
    move(initialized.current);
    initialized.current = true;
    const observer = new ResizeObserver(() => move(false));
    observer.observe(list);
    return () => observer.disconnect();
  }, [value]);
  return { listRef, indicatorRef };
}
```
`src/components/SlidingTabs.tsx`:
```tsx
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTabIndicator } from "./useTabIndicator";

export function SlidingTabsList({ value, items, className, "aria-label": ariaLabel }: { value: string; items: [string, string][]; className?: string; "aria-label": string }) {
  const { listRef, indicatorRef } = useTabIndicator(value);
  return (
    <TabsList ref={listRef} aria-label={ariaLabel} className={cn("relative h-10 w-max justify-start p-1", className)}>
      <span ref={indicatorRef} aria-hidden="true" className="absolute top-1 bottom-1 left-0 rounded-md bg-background shadow-sm transition-[transform,width] duration-[var(--duration-fast)] ease-smooth motion-reduce:transition-none dark:bg-surface-elevated" />
      {items.map(([key, label]) => (
        <TabsTrigger key={key} value={key} className="relative z-10 px-3 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-transparent">
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
```
Note: `dark:bg-surface-elevated` needs a `--color-surface-elevated` token. Add `--color-surface-elevated: var(--surface-elevated);` to the `@theme inline` block in `src/index.css`.

- [ ] **Step 9: Tooltip provider at the root**

In `src/main.tsx`, import `import { TooltipProvider } from "@/components/ui/tooltip";` and wrap `<App />`:
```tsx
    <ThemeProvider><TooltipProvider delayDuration={300}><App /></TooltipProvider></ThemeProvider>
```

- [ ] **Step 10: `tests/helpers.mjs`**

```js
/** Opens a Radix Select trigger and picks the option whose data-value matches. */
export async function chooseValue(page, trigger, value) {
  await trigger.click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
}
```

- [ ] **Step 11: Check, prune, commit**

```bash
npm run lint && npm run typecheck && npm run build
node scripts/legacy-css.mjs prune brand-mark brand-mark-physical brand-mark-digital
npm run build
```
Screenshot-compare the overview, workspace and events pages (Stat/StatusBadge/Mark now use shadcn) with `npm run test:ui`.
```bash
git add -A src tests/helpers.mjs
git commit -m "feat(ui): rebuild shared components on shadcn primitives

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: App shell (Sidebar, Topbar, CommandDialog, status, theme)

**Files:**
- Create: `src/app/AppSidebar.tsx`, `src/app/Topbar.tsx`, `src/app/useWorkspaceData.ts`
- Rewrite: `src/app/App.tsx`, `src/app/SystemSwitcher.tsx`, `src/app/CommandLauncher.tsx`, `src/app/SystemStatus.tsx`, `ThemeSwitcher` in `src/theme.tsx`
- Delete: `src/app/useDropdownClass.ts`
- Modify: `tests/ui-review.mjs` (reduced-motion locator)

- [ ] **Step 1: `src/app/useWorkspaceData.ts`**

This is the data logic moved out of `App` unchanged (health polling, project fetch and the websocket).
```ts
import { useCallback, useEffect, useState } from "react";
import type { State } from "@/types";
import { api } from "@/types";
import type { ServiceHealth } from "./types";

export function useWorkspaceData() {
  const [states, setStates] = useState<State[]>([]);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  useEffect(() => {
    let stopped = false;
    const check = () => api<ServiceHealth>("/health").then((value) => { if (!stopped) setHealth(value); }).catch(() => { if (!stopped) setHealth(null); });
    check();
    const timer = window.setInterval(check, 10000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);
  const refresh = useCallback(() => {
    api<State[]>("/projects")
      .then((s) => { setStates(s); setLoaded(true); setError(""); })
      .catch((e) => { setError(e.message); setLoaded(true); });
  }, []);
  useEffect(() => {
    refresh();
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
      socket.onopen = () => { setConnected(true); refresh(); };
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "snapshot") { setStates(m.projects); setLoaded(true); setError(""); }
      };
      socket.onclose = () => { setConnected(false); if (!stopped) timer = setTimeout(connect, 2000); };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); socket?.close(); };
  }, [refresh]);
  return { states, connected, loaded, error, health, refresh };
}
```

- [ ] **Step 2: `ThemeSwitcher` in `src/theme.tsx`**

Toggles keep `role="button"` and `aria-pressed`, which `ui-review.mjs` relies on (`getByRole("button", { name: "Dark theme" })`). A ToggleGroup would expose radios instead, so it's deliberately not used. Replace the `ThemeSwitcher` function and add the imports at the top:
```tsx
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
```
```tsx
const themeOptions = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { preference, change } = useContext(ThemeContext);
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border bg-muted p-0.5" role="group" aria-label="Color theme">
      {themeOptions.map(({ value, label, Icon }) => (
        <Toggle
          key={value}
          size="sm"
          pressed={preference === value}
          onPressedChange={() => change(value)}
          aria-label={`${label} theme`}
          title={`${label} theme`}
          className={cn("h-7 gap-1.5 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm", compact ? "w-7 px-0" : "px-2.5")}
        >
          <Icon />
          {!compact && <span>{label}</span>}
        </Toggle>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `src/app/SystemStatus.tsx`**

```tsx
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ServiceHealth } from "./types";

type Tone = "healthy" | "warning" | "down";
const dot: Record<Tone, string> = { healthy: "bg-success", warning: "bg-warning", down: "bg-destructive" };

function Row({ tone, label, value }: { tone: Tone; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground"><i className={cn("size-2 rounded-full", dot[tone])} />{label}</span>
      <strong className="font-medium text-foreground">{value}</strong>
    </div>
  );
}

export function HealthRows({ connected, health, reporting, devices }: { connected: boolean; health: ServiceHealth | null; reporting: number; devices: number }) {
  return (
    <div className="grid gap-2">
      <Row tone={connected ? "healthy" : "down"} label="Backend" value={connected ? "Connected" : "Reconnecting"} />
      <Row tone={health?.mqtt ? "healthy" : "warning"} label="MQTT broker" value={health === null ? "Checking" : health.mqtt ? "Connected" : "Disconnected"} />
      <Row tone={devices > 0 && reporting < devices ? "warning" : "healthy"} label="Devices" value={devices ? `${reporting}/${devices} reporting` : "None configured"} />
      <Row tone={health?.agent_available ? "healthy" : health?.agent_configured ? "down" : "warning"} label="Agent" value={health === null ? "Checking" : health.agent_available ? "Available" : health.agent_configured ? "Unreachable" : "Not configured"} />
    </div>
  );
}

export function SystemStatus({ connected, health, reporting, devices }: { connected: boolean; health: ServiceHealth | null; reporting: number; devices: number }) {
  const healthy = connected && health?.mqtt === true && health.agent_available && (devices === 0 || reporting === devices);
  const tone: Tone = connected ? (healthy ? "healthy" : "warning") : "down";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className={cn("size-2 rounded-full", dot[tone])} />
          System status
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3" aria-label="System status details">
        <div className="flex items-center justify-between">
          <strong className="text-sm">System status</strong>
          <span className="text-xs text-muted-foreground">{healthy ? "Operational" : "Attention needed"}</span>
        </div>
        <HealthRows connected={connected} health={health} reporting={reporting} devices={devices} />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: `src/app/SystemSwitcher.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronsUpDown, LayoutDashboard, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Mark } from "@/components/Mark";
import { cn } from "@/lib/utils";
import type { State } from "@/types";

const projectState = (state: State) =>
  state.devices.some((device) => device.reporting) ? { label: "Live", dot: "bg-success" } : state.latest ? { label: "Stale", dot: "bg-warning" } : { label: "Unavailable", dot: "bg-muted-foreground" };

export function SystemSwitcher({ states, selectedProjectId }: { states: State[]; selectedProjectId: string | null }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const selected = states.find((state) => state.project.id === selectedProjectId);
  const searchable = states.length > 7;
  const projects = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value ? states.filter((state) => `${state.project.name} ${state.project.id} ${state.devices.map((device) => device.id).join(" ")}`.toLowerCase().includes(value)) : states;
  }, [query, states]);
  return (
    <DropdownMenu onOpenChange={(open) => { if (open) setQuery(""); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 min-w-0 gap-2 px-2 font-semibold">
          <Mark className="size-6" />
          <span className="max-w-48 truncate">{selected?.project.name || "All Systems"}</span>
          <ChevronsUpDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72" aria-label="System and project navigation">
        {searchable && (
          <div className="relative p-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.stopPropagation()} placeholder="Find a project" aria-label="Find a project" className="h-8 pl-8" />
          </div>
        )}
        <DropdownMenuRadioGroup value={selectedProjectId ?? "all"} onValueChange={(next) => navigate(next === "all" ? "/" : `/projects/${next}`)}>
          <DropdownMenuLabel className="text-xs text-muted-foreground">All systems</DropdownMenuLabel>
          <DropdownMenuRadioItem value="all" className="gap-2">
            <LayoutDashboard />
            <span className="flex flex-col"><strong className="font-medium">All Systems</strong><small className="text-muted-foreground">{states.length} configured {states.length === 1 ? "project" : "projects"}</small></span>
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
          <div className="max-h-72 overflow-y-auto">
            {projects.length ? projects.map((state) => {
              const status = projectState(state);
              return (
                <DropdownMenuRadioItem key={state.project.id} value={state.project.id} className="gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", status.dot)} />
                  <span className="flex min-w-0 flex-col"><strong className="truncate font-medium">{state.project.name}</strong><small className="text-muted-foreground">{status.label} · {state.devices.length} {state.devices.length === 1 ? "device" : "devices"}</small></span>
                </DropdownMenuRadioItem>
              );
            }) : <p className="px-2 py-3 text-sm text-muted-foreground">No projects match “{query}”.</p>}
          </div>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/projects/new"><Plus />Add project</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 5: `src/app/CommandLauncher.tsx`**

The title `"Search Agentwin"` is asserted by `monitoring-ui.mjs` as the dialog's accessible name.
```tsx
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Layers, Radio, Search, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { State } from "@/types";
import type { CommandItem as LauncherItem } from "./types";

const groups = [
  { kind: "project", heading: "Projects", Icon: Layers },
  { kind: "device", heading: "Devices", Icon: Radio },
  { kind: "event", heading: "Events", Icon: Bell },
  { kind: "settings", heading: "Settings", Icon: SettingsIcon },
] as const;

export function CommandLauncher({ open, onOpenChange, states }: { open: boolean; onOpenChange: (open: boolean) => void; states: State[] }) {
  const navigate = useNavigate();
  const items = useMemo<LauncherItem[]>(() => [
    ...states.map((state) => ({ id: `project-${state.project.id}`, label: state.project.name, meta: "Project", path: `/projects/${state.project.id}`, kind: "project" as const })),
    ...states.flatMap((state) => state.devices.map((device) => ({ id: `device-${state.project.id}-${device.id}`, label: device.id, meta: `Device in ${state.project.name}`, path: `/projects/${state.project.id}`, kind: "device" as const }))),
    ...states.flatMap((state) => state.events.map((event) => ({ id: `event-${state.project.id}-${event.id}`, label: event.kind.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()), meta: `${event.recovered ? "Recovered" : "Open"} event in ${state.project.name}`, path: "/events", kind: "event" as const }))),
    { id: "settings", label: "Settings", meta: "Appearance and service availability", path: "/settings", kind: "settings" },
  ], [states]);
  const choose = (path: string) => { navigate(path); onOpenChange(false); };
  return (
    <>
      <Button type="button" variant="outline" className="topbar-search-trigger h-9 gap-2 px-2.5 text-muted-foreground sm:w-56 sm:justify-start" onClick={() => onOpenChange(true)} aria-haspopup="dialog" aria-expanded={open}>
        <Search />
        <span className="sr-only sm:not-sr-only">Search</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={onOpenChange} title="Search Agentwin" description="Search projects, devices, events, and settings">
        <CommandInput placeholder="Search projects, devices, events, settings" aria-label="Search projects, devices, events, and settings" />
        <CommandList>
          <CommandEmpty>No matching projects, devices, events, or settings.</CommandEmpty>
          {groups.map(({ kind, heading, Icon }) => {
            const matches = items.filter((item) => item.kind === kind);
            return matches.length ? (
              <CommandGroup key={kind} heading={heading}>
                {matches.map((item) => (
                  <CommandItem key={item.id} value={`${item.label} ${item.meta} ${item.id}`} onSelect={() => choose(item.path)}>
                    <Icon />
                    <span className="flex min-w-0 flex-col"><span className="truncate">{item.label}</span><span className="truncate text-xs text-muted-foreground">{item.meta}</span></span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null;
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
```

- [ ] **Step 6: `src/app/AppSidebar.tsx`**

On mobile, the shadcn `Sidebar` renders inside a `Sheet` (role `dialog`), so the nav is labelled `"Mobile navigation"` there. That label is asserted by `ui-review.mjs`.
```tsx
import { Link, NavLink, useLocation } from "react-router-dom";
import { Bell, Info, Layers, LayoutDashboard, PanelLeft, Settings as SettingsIcon } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Mark } from "@/components/Mark";
import { ThemeSwitcher } from "@/theme";
import { strings } from "@/types";

const items = [
  { to: "/", label: strings.overview, Icon: LayoutDashboard, end: true },
  { to: "/projects", label: strings.projects, Icon: Layers, end: false },
  { to: "/events", label: strings.events, Icon: Bell, end: false },
  { to: "/settings", label: strings.settings, Icon: SettingsIcon, end: false },
];

export function AppSidebar({ projectCount, openEvents }: { projectCount: number; openEvents: number }) {
  const { isMobile, open, setOpenMobile, toggleSidebar } = useSidebar();
  const { pathname } = useLocation();
  const counts: Record<string, number | undefined> = { "/projects": projectCount, "/events": openEvents || undefined };
  const close = () => setOpenMobile(false);
  return (
    <Sidebar collapsible="icon" className="sidebar">
      <SidebarHeader>
        <Link to="/" onClick={close} className="flex h-10 items-center gap-2 px-1 text-base font-semibold text-foreground">
          <Mark />
          <span className="font-heading group-data-[collapsible=icon]:hidden">{strings.brand}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label={isMobile ? "Mobile navigation" : "Main navigation"}>
              <SidebarMenu>
                {items.map(({ to, label, Icon, end }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild tooltip={label} isActive={end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)}>
                      <NavLink to={to} end={end} aria-label={label} onClick={close}><Icon /><span>{label}</span></NavLink>
                    </SidebarMenuButton>
                    {counts[to] !== undefined && <SidebarMenuBadge>{counts[to]}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3">
        {isMobile && <ThemeSwitcher />}
        <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden"><Info className="size-4" />About Agentwin</div>
        <div className="flex items-center gap-2 rounded-lg border p-2 group-data-[collapsible=icon]:hidden">
          <Mark className="size-6" />
          <div className="text-xs leading-tight"><strong className="block text-foreground">Agentwin MVP</strong><span className="text-muted-foreground">Every system.<br />Its own agent.</span></div>
        </div>
        {!isMobile && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleSidebar} tooltip={open ? "Collapse navigation" : "Expand navigation"} aria-label={open ? "Collapse navigation" : "Expand navigation"} aria-expanded={open}>
                <PanelLeft /><span>Collapse navigation</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
```

- [ ] **Step 7: `src/app/Topbar.tsx`**

```tsx
import { Link } from "react-router-dom";
import { Bell, Menu, MoreHorizontal, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSidebar } from "@/components/ui/sidebar";
import { ThemeSwitcher } from "@/theme";
import { sessionLabel } from "@/lib/format";
import type { State } from "@/types";
import { CommandLauncher } from "./CommandLauncher";
import { HealthRows, SystemStatus } from "./SystemStatus";
import { SystemSwitcher } from "./SystemSwitcher";
import type { ProjectContext, ServiceHealth } from "./types";

export function Topbar({ states, connected, health, projectContext, selectedProjectId, searchOpen, onSearchOpenChange }: { states: State[]; connected: boolean; health: ServiceHealth | null; projectContext: ProjectContext | null; selectedProjectId: string | null; searchOpen: boolean; onSearchOpenChange: (open: boolean) => void }) {
  const { toggleSidebar } = useSidebar();
  const openEvents = states.flatMap((state) => state.events).filter((event) => !event.recovered).length;
  const devices = states.reduce((total, state) => total + state.devices.length, 0);
  const reporting = states.reduce((total, state) => total + state.devices.filter((device) => device.reporting).length, 0);
  const contextMode = projectContext ? sessionLabel(projectContext.mode) : null;
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur md:px-8">
      <Button variant="ghost" size="icon" className="md:hidden" aria-label="Toggle navigation" onClick={toggleSidebar}><Menu /></Button>
      <SystemSwitcher states={states} selectedProjectId={selectedProjectId} />
      <div className="ml-auto flex items-center gap-2">
        <CommandLauncher open={searchOpen} onOpenChange={onSearchOpenChange} states={states} />
        <div className="hidden items-center gap-2 md:flex">
          {contextMode && <Badge variant="outline" className="h-8 gap-1.5 px-2.5"><Radio className="size-3.5" />{contextMode}</Badge>}
          {openEvents > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link to="/events" aria-label={`${openEvents} open events`}><Bell />Events<Badge className="ml-1 h-5 px-1.5">{openEvents}</Badge></Link>
            </Button>
          )}
          <SystemStatus connected={connected} health={health} reporting={reporting} devices={devices} />
          <ThemeSwitcher compact />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative md:hidden" aria-label="More workspace status">
              <MoreHorizontal />
              {openEvents > 0 && <span className="absolute -top-0.5 -right-0.5 rounded-full bg-warning px-1 text-[10px] font-semibold text-white">{openEvents}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3" aria-label="Workspace status and preferences">
            {contextMode && <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Current source</span><strong className="flex items-center gap-1.5"><Radio className="size-3.5" />{contextMode}</strong></div>}
            {openEvents > 0 && <Link className="flex items-center justify-between text-sm" to="/events"><span className="flex items-center gap-1.5"><Bell className="size-4" />Open events</span><strong>{openEvents}</strong></Link>}
            <p className="text-sm font-semibold">System status</p>
            <HealthRows connected={connected} health={health} reporting={reporting} devices={devices} />
            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Appearance</span><ThemeSwitcher compact /></div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
```

- [ ] **Step 8: `src/app/App.tsx`**

Replace the whole file. The page-enter animation effect and the routes are unchanged.
```tsx
import { useCallback, useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AddProject } from "@/features/projects/AddProject";
import { GlobalEvents } from "@/features/events/GlobalEvents";
import { Overview } from "@/features/overview/Overview";
import { GlobalSettings } from "@/features/settings/GlobalSettings";
import { Workspace } from "@/features/workspace/Workspace";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import type { ProjectContext } from "./types";
import { useWorkspaceData } from "./useWorkspaceData";

export function App() {
  const { states, connected, loaded, error, health, refresh } = useWorkspaceData();
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const route = useLocation();
  const updateProjectContext = useCallback((context: ProjectContext) => setProjectContext(context), []);
  useEffect(() => {
    if (!/^\/projects\/[^/]+$/.test(route.pathname)) setProjectContext(null);
    setSearchOpen(false);
  }, [route.pathname]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const page = document.querySelector("main.page");
    const motion = getComputedStyle(document.documentElement);
    const animation = page?.animate([{ opacity: 0.5, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: parseFloat(motion.getPropertyValue("--duration-fast")), easing: motion.getPropertyValue("--ease-smooth-out").trim() });
    return () => animation?.cancel();
  }, [route.pathname]);
  const openEvents = states.flatMap((state) => state.events).filter((event) => !event.recovered).length;
  const selectedProjectId = route.pathname.match(/^\/projects\/([^/]+)$/)?.[1] || null;
  return (
    <SidebarProvider open={railOpen} onOpenChange={setRailOpen} className="app-shell">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Skip to content</a>
      <AppSidebar projectCount={states.length} openEvents={openEvents} />
      <SidebarInset id="main-content" tabIndex={-1} className="min-w-0 bg-background">
        <Topbar states={states} connected={connected} health={health} projectContext={projectContext} selectedProjectId={selectedProjectId} searchOpen={searchOpen} onSearchOpenChange={setSearchOpen} />
        {error && (
          <Alert variant="destructive" className="mx-4 mt-4 w-auto md:mx-8">
            <AlertDescription className="flex items-center justify-between gap-3">{error}<Button size="sm" variant="outline" onClick={refresh}>Retry</Button></AlertDescription>
          </Alert>
        )}
        {!loaded ? (
          <div className="p-8 text-sm text-muted-foreground">Loading your workspace…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Overview states={states} />} />
            <Route path="/projects" element={<Overview states={states} projectOnly />} />
            <Route path="/projects/:id" element={<Workspace connected={connected} onContextChange={updateProjectContext} />} />
            <Route path="/projects/new" element={<AddProject />} />
            <Route path="/events" element={<GlobalEvents states={states} />} />
            <Route path="/settings" element={<GlobalSettings states={states} />} />
            <Route path="*" element={<div className="p-8 text-sm text-muted-foreground">Page not found. <Link className="text-brand underline" to="/">Return to overview</Link></div>} />
          </Routes>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
```
Delete `src/app/useDropdownClass.ts`.

- [ ] **Step 9: Update the reduced-motion check in `tests/ui-review.mjs`**

The shadcn sidebar is not rendered at mobile width (it lives in the Sheet), so `.sidebar` no longer exists there. The global reduced-motion rule applies to every element. In the reduced-motion block (around line 158), change `.locator(".sidebar")` to `.locator(".app-shell")`.

- [ ] **Step 10: Checks and prune**

```bash
npm run lint && npm run typecheck && npm run build
node scripts/legacy-css.mjs prune-unused
node scripts/legacy-css.mjs prune app main topbar skip-link sidebar
npm run build
```
Pruning `sidebar` removes legacy selectors like `.sidebar nav a`. The hook class stays on the shadcn container, where the guard already neutralizes legacy styling.

- [ ] **Step 11: Browser verification**

Run `npm run smoke`, `npm run test:ui` and `tests/monitoring-ui.mjs`. Expected: results match the baseline. Screenshot-compare the shell at 390, 768 and 1440 widths in both themes. Check manually in `npm run dev`:
- Ctrl+K opens the search.
- The rail collapses to icons.
- The mobile Sheet opens from the topbar button and closes on navigation.

- [ ] **Step 12: Commit**

```bash
git add -A src tests/ui-review.mjs
git commit -m "feat(ui): migrate app shell to shadcn Sidebar, Command, Popover, and Toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Overview and platform analytics

**Files:**
- Rewrite: `src/features/overview/Overview.tsx`, `src/features/overview/PlatformAnalytics.tsx`

- [ ] **Step 1: `src/features/overview/Overview.tsx`**

```tsx
import { Link } from "react-router-dom";
import { Activity, ArrowRight, ArrowUpRight, AudioLines, Bell, Cable, ChevronRight, FlaskConical, Layers, Plus, Radio, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { SectionHeading } from "@/components/SectionHeading";
import { Stat } from "@/components/Stat";
import { StatusBadge } from "@/components/StatusBadge";
import type { State } from "@/types";
import { display, time } from "@/types";
import { PlatformAnalytics } from "./PlatformAnalytics";

export function Overview({ states, projectOnly = false }: { states: State[]; projectOnly?: boolean }) {
  const events = states.flatMap((s) => s.events.filter((e) => !e.recovered).map((e) => ({ ...e, project: s.project })));
  const reportingCount = states.filter((s) => s.status === "reporting").length;
  const addProject = <Button asChild><Link to="/projects/new"><Plus />Add project</Link></Button>;
  return (
    <Page>
      <PageHeading title={projectOnly ? "Projects" : "Systems at a glance"} description="Current state, recent evidence, and anything that needs attention." actions={addProject} />
      {!projectOnly && (
        <>
          <Card className="flex-row flex-wrap items-center gap-4 border-brand-border bg-glass p-5 shadow-elevated backdrop-blur">
            <div className="grid size-12 place-items-center rounded-xl bg-brand-subtle text-brand"><Activity className="size-6" /></div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">{!states.length ? "Create your first project" : events.length ? `${events.length} event${events.length === 1 ? "" : "s"} need attention` : "No open events"}</h2>
              <p className="text-sm text-muted-foreground">{states.length ? `${reportingCount} of ${states.length} projects are reporting from their current data source.` : "Start with a template, then connect one or more real devices."}</p>
            </div>
            <Button asChild variant="outline">
              <Link to={events.length ? "/events" : states.length ? `/projects/${states[0].project.id}` : "/projects/new"}>
                {events.length ? "Review events" : states.length ? "Open project" : "Add project"}<ArrowRight />
              </Link>
            </Button>
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Total projects" value={states.length} hint="Configured workspaces" icon={<Layers />} />
            <Stat label="Reporting now" value={reportingCount} hint="Current selected sources" icon={<Activity />} />
            <Stat label="Open events" value={events.length} hint="Across current sessions" icon={<Bell />} />
          </div>
          {states.length > 0 && <PlatformAnalytics states={states} />}
        </>
      )}
      <SectionHeading title={<>Your projects <span className="ml-1 text-sm font-normal text-muted-foreground">{states.length}</span></>} aside="Independent live and test sessions" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {!states.length && (
          <EmptyState className="sm:col-span-2 xl:col-span-3" icon={<Layers />} title="No projects yet" action={<Button asChild><Link to="/projects/new"><Plus />Add your first project</Link></Button>}>
            <p>Create a project to define its devices, telemetry, Twin, and controls.</p>
          </EmptyState>
        )}
        {states.map((s) => {
          const primary = s.project.graph.fields[s.project.graph.primary_field];
          return (
            <Link key={s.project.id} to={"/projects/" + s.project.id} className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Card className="h-full gap-3 p-5 transition-colors group-hover:border-brand-border group-hover:bg-accent">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-brand-subtle text-brand [&_svg]:size-5">{s.project.template === "connectivity" ? <Radio /> : <AudioLines />}</span>
                  <StatusBadge tone={s.status === "reporting" ? "success" : "neutral"}>{s.status}</StatusBadge>
                </div>
                <div className="text-xs tracking-wide text-muted-foreground uppercase">{s.project.template.replaceAll("_", " ")} template</div>
                <h3 className="text-lg font-semibold">{s.project.name}</h3>
                {s.project.arabic_title && <div className="text-sm text-subtle-foreground" dir="rtl" lang="ar">{s.project.arabic_title}</div>}
                <p className="line-clamp-2 text-sm text-muted-foreground">{s.project.description}</p>
                <div className="flex items-baseline justify-between rounded-lg bg-muted px-3 py-2">
                  <span className="text-xs text-muted-foreground">{primary.label}</span>
                  <strong className="text-lg font-semibold">{display(s.latest?.readings[s.project.graph.primary_field])}<small className="ml-1 text-xs font-normal text-muted-foreground">{primary.unit}</small></strong>
                </div>
                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">{s.session.mode === "live" ? <Cable className="size-3.5" /> : <FlaskConical className="size-3.5" />}{s.devices.filter((device) => device.reporting).length}/{s.devices.length} reporting</span>
                  <span className="flex items-center gap-1">{time(s.latest?.received)}<ArrowUpRight className="size-4" /></span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <SectionHeading title={events.length ? "Needs attention" : "All systems clear"} aside={<Link to="/events">{events.length ? "View all events" : "View event history"}<ArrowRight className="size-3.5" /></Link>} />
      <Card className="gap-0 p-0">
        {events.length ? events.slice(0, 4).map((e) => (
          <Link key={e.id} to={"/projects/" + e.project.id + "?tab=events"} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-accent">
            <span className="grid size-8 place-items-center rounded-lg bg-warning-subtle text-warning"><Bell className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <strong className="block text-sm font-medium">{e.kind === "missing_telemetry" ? "Device telemetry is missing" : "Configured limit breached"}</strong>
              <small className="text-xs text-muted-foreground">{e.project.name} · {e.evidence.rule}</small>
            </div>
            <StatusBadge tone="warning">Open</StatusBadge>
            <time className="hidden text-xs text-muted-foreground sm:block">{time(e.created)}</time>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        )) : (
          <div className="flex items-center gap-4 p-5">
            <ShieldCheck className="size-6 text-success" />
            <div>
              <strong className="text-sm font-medium">No open events in these sessions</strong>
              <p className="text-sm text-muted-foreground">{states.some((state) => state.devices.some((device) => device.reporting)) ? "Connected devices are reporting and no active rule currently requires attention." : states.length ? "No active event is open. Connect a registered device to begin live monitoring." : "Add a project and connect a device to begin live monitoring."}</p>
            </div>
          </div>
        )}
      </Card>
      <footer className="flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-success" />Local-first monitoring</span>
        <span>Evidence-backed monitoring</span>
      </footer>
    </Page>
  );
}
```

- [ ] **Step 2: `src/features/overview/PlatformAnalytics.tsx`**

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight } from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { isVisibleMetric, metricValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { State } from "@/types";
import { display, time } from "@/types";

export function PlatformAnalytics({ states }: { states: State[] }) {
  const [projectId, setProjectId] = useState(states[0]?.project.id || "");
  const [metricKey, setMetricKey] = useState("");
  const [windowSize, setWindowSize] = useState("30");
  const selected = states.find((state) => state.project.id === projectId) || states[0];
  if (!selected) return null;
  const visibleFields = Object.entries(selected.project.graph.fields).filter(([key]) => isVisibleMetric(key));
  const field = selected.project.graph.fields[metricKey] && isVisibleMetric(metricKey) ? metricKey : visibleFields[0]?.[0] || selected.project.graph.primary_field;
  const metric = selected.project.graph.fields[field];
  const numeric = metric.data_type === "number";
  const limit = windowSize === "all" ? selected.readings.length : Number(windowSize);
  const rows = selected.readings.slice(-limit).map((reading) => ({ received: reading.received, value: reading.readings[field] }));
  const transitions = rows.filter((row, index, all) => index === 0 || row.value !== all[index - 1].value);
  const allDevices = states.flatMap((state) => state.devices);
  const reporting = allDevices.filter((device) => device.reporting).length;
  const pending = states.flatMap((state) => state.actions).filter((action) => action.status === "requested").length;
  const chartConfig = { value: { label: metric.label, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="min-w-0 gap-4">
        <CardHeader className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <CardTitle>Telemetry history</CardTitle>
            <CardDescription>Stored observations only; missing samples remain gaps.</CardDescription>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
            <FormField id="analytics-project" label="Project"><OptionSelect id="analytics-project" value={selected.project.id} onValueChange={(value) => { setProjectId(value); setMetricKey(""); }} options={states.map((state) => ({ value: state.project.id, label: state.project.name }))} className="sm:w-44" /></FormField>
            <FormField id="analytics-metric" label="Metric"><OptionSelect id="analytics-metric" value={field} onValueChange={setMetricKey} options={visibleFields.map(([key, item]) => ({ value: key, label: item.label }))} className="sm:w-40" /></FormField>
            <FormField id="analytics-window" label="Window"><OptionSelect id="analytics-window" value={windowSize} onValueChange={setWindowSize} options={[{ value: "30", label: "Latest 30" }, { value: "90", label: "Latest 90" }, { value: "all", label: "All stored" }]} className="sm:w-32" /></FormField>
          </div>
        </CardHeader>
        <div className="px-6">
          {numeric && rows.length ? (
            <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
              <LineChart data={rows} margin={{ left: 4, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="received" tickFormatter={(value) => time(Number(value))} minTickGap={40} tickLine={false} axisLine={false} />
                <YAxis width={48} unit={metric.unit} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => time(Number(payload?.[0]?.payload?.received))} formatter={(value) => <><span className="text-muted-foreground">{metric.label}</span><span className="ml-auto font-mono font-medium text-foreground tabular-nums">{display(value)} {metric.unit}</span></>} />} />
                <Line dataKey="value" stroke="var(--color-value)" isAnimationActive={false} strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
            </ChartContainer>
          ) : rows.length ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[["Current state", metricValue(rows.at(-1)?.value, metric.precision)], ["State changes", Math.max(0, transitions.length - 1)], ["Samples in view", rows.length]].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-muted p-3"><span className="block text-xs text-muted-foreground">{label}</span><strong className="text-lg font-semibold">{value}</strong></div>
                ))}
              </div>
              <div className="flex h-6 gap-px overflow-hidden rounded-md" aria-label={`${metric.label} state history`}>
                {rows.map((row, index) => <i key={`${row.received}-${index}`} className={cn("flex-1", row.value === true ? "bg-success" : row.value === false ? "bg-muted" : "bg-info")} title={`${time(row.received)} · ${metricValue(row.value, metric.precision)}`} />)}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>{time(rows[0].received)}</span><span>{time(rows.at(-1)?.received)}</span></div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Recent changes</h3>
                {transitions.slice().reverse().slice(0, 5).map((row, index) => <div key={`${row.received}-${index}`} className="flex justify-between border-b py-1.5 text-sm last:border-b-0"><span className="text-muted-foreground">{time(row.received)}</span><strong className="font-medium">{metricValue(row.value, metric.precision)}</strong></div>)}
              </div>
            </div>
          ) : (
            <EmptyState icon={<Activity />} title="No readings yet"><p>The visualization appears after the selected project reports telemetry.</p></EmptyState>
          )}
        </div>
      </Card>
      <Card className="gap-4">
        <CardHeader><CardTitle>Operational status</CardTitle><CardDescription>Across configured projects.</CardDescription></CardHeader>
        <div className="space-y-4 px-6">
          <div><strong className="text-3xl font-semibold">{reporting}/{allDevices.length}</strong><span className="ml-2 text-sm text-muted-foreground">devices reporting</span></div>
          <div className="grid gap-2 text-sm">
            {[["Reporting", reporting, "bg-success"], ["Unavailable", allDevices.length - reporting, "bg-muted-foreground"], ["Pending actions", pending, "bg-warning"]].map(([label, value, dot]) => (
              <div key={String(label)} className="flex items-center justify-between"><span className="flex items-center gap-2 text-muted-foreground"><i className={cn("size-2 rounded-full", String(dot))} />{label}</span><b className="font-semibold">{value}</b></div>
            ))}
          </div>
          <Button asChild variant="outline" className="w-full"><Link to="/events">Review operational events<ArrowRight /></Link></Button>
        </div>
      </Card>
    </section>
  );
}
```
If the `ChartTooltipContent` `labelFormatter`/`formatter` parameter types from the generated `chart.tsx` differ, keep the same output and adjust only the parameter annotations.

- [ ] **Step 3: Checks, prune, verify, commit**

```bash
npm run lint && npm run typecheck && npm run build
node scripts/legacy-css.mjs prune-unused
npm run build
```
Run `npm run smoke` and `npm run test:ui`. Compare the overview and projects screenshots in both themes and at all widths against the baseline, then commit:
```bash
git add -A src
git commit -m "feat(ui): migrate overview and analytics to shadcn Card, Select, and Chart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Add-project onboarding

**Files:**
- Rewrite: `src/features/projects/AddProject.tsx`
- Modify: `tests/smoke.mjs` (two `selectOption` calls)

- [ ] **Step 1: Update the smoke test first (it will fail until Step 2)**

In `tests/smoke.mjs` add `import { chooseValue } from "./helpers.mjs";` after the existing imports, then replace:
```js
  await page.getByLabel("Starting template").selectOption("temperature");
```
with:
```js
  await chooseValue(page, page.getByLabel("Starting template"), "temperature");
```
and:
```js
  await page.getByLabel("Transport").selectOption("mqtt");
```
with:
```js
  await chooseValue(page, page.getByLabel("Transport"), "mqtt");
```

- [ ] **Step 2: Rewrite `src/features/projects/AddProject.tsx`**

The state, payload and `componentPreset` are unchanged. Only the markup changes.
```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import { api } from "@/types";

type DraftComponent = { component_id: string; component_type: "led" | "temperature" | "humidity" | "analog" | "readonly"; label: string; device_id: string; pin: string; field_key: string; field_type: "number" | "boolean" | "categorical"; unit: string; precision: number; freshness_seconds: number };
type DraftDevice = { device_id: string; connector: "usb" | "mqtt"; serial_port: string; baud_rate: number };

const componentPreset = (template: string, device: string, freshness: number): DraftComponent[] => {
  const presets: Record<string, Omit<DraftComponent, "device_id" | "freshness_seconds">[]> = {
    led: [{ component_id: "led", component_type: "led", label: "External LED", pin: "D7", field_key: "led_on", field_type: "boolean", unit: "", precision: 0 }],
    temperature: [{ component_id: "temperature", component_type: "temperature", label: "Temperature", pin: "A5", field_key: "temperature_c", field_type: "number", unit: "°C", precision: 2 }],
    water: [{ component_id: "water-level", component_type: "analog", label: "Water level", pin: "A5", field_key: "water_level_raw", field_type: "number", unit: "count", precision: 0 }],
    connectivity: [{ component_id: "rf-detector", component_type: "analog", label: "Detector output", pin: "A5", field_key: "rf_detector_raw", field_type: "number", unit: "count", precision: 0 }],
    generic: [{ component_id: "sensor", component_type: "readonly", label: "Sensor reading", pin: "A5", field_key: "sensor_value", field_type: "number", unit: "value", precision: 2 }],
  };
  return (presets[template] || presets.generic).map((item) => ({ ...item, device_id: device, freshness_seconds: freshness }));
};

const templates = [{ value: "generic", label: "Generic sensor" }, { value: "led", label: "LED output" }, { value: "temperature", label: "Temperature" }, { value: "water", label: "Water level" }, { value: "connectivity", label: "Connectivity / RF" }];
const transports = [{ value: "usb", label: "USB gateway" }, { value: "mqtt", label: "Wi-Fi MQTT" }];
const componentTypes = [{ value: "led", label: "LED" }, { value: "analog", label: "Analog sensor" }, { value: "temperature", label: "Temperature" }, { value: "humidity", label: "Humidity" }, { value: "readonly", label: "Read only" }];
const fieldTypes = [{ value: "number", label: "Number" }, { value: "boolean", label: "Boolean" }, { value: "categorical", label: "Text" }];
const steps = ["Name & template", "Devices", "Components", "Fields", "Freshness", "Review"];

function StepHeading({ title, description }: { title: string; description: string }) {
  return <div className="space-y-1"><h2 className="text-xl font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">{children}</div>;
}

export function AddProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", template: "generic", freshness_seconds: 8, interval_seconds: 1, retention_days: 30 });
  const [devices, setDevices] = useState<DraftDevice[]>([{ device_id: "device-01", connector: "usb", serial_port: "", baud_rate: 115200 }]);
  const [components, setComponents] = useState<DraftComponent[]>(componentPreset("generic", "device-01", 8));
  const patchDevice = (i: number, p: Partial<DraftDevice>) => setDevices(devices.map((v, n) => (n === i ? { ...v, ...p } : v)));
  const patchComponent = (i: number, p: Partial<DraftComponent>) => setComponents(components.map((v, n) => (n === i ? { ...v, ...p } : v)));
  const chooseTemplate = (template: string) => { setForm({ ...form, template }); setComponents(componentPreset(template, devices[0].device_id, form.freshness_seconds)); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < steps.length - 1) { setStep(step + 1); return; }
    setSaving(true); setMessage("");
    try {
      const [primary, ...extra] = devices;
      const project = await api<Project>("/projects", { ...form, device_id: primary.device_id, connector: primary.connector, serial_port: primary.serial_port || null, mapping: { field: components[0]?.field_key || "sensor_value", unit: components[0]?.unit || "value" }, devices: extra.map((d) => ({ ...d, serial_port: d.serial_port || null })), components: components.map((c) => ({ ...c, pin: c.pin || null })), cable_description: "Configured during project onboarding" });
      navigate(`/projects/${project.id}`);
    } catch (error) { setMessage((error as Error).message); setSaving(false); }
  };
  const summary: [string, string][] = [
    ["Project", form.name], ["Template", form.template],
    ["Devices", devices.map((d) => `${d.device_id} · ${d.connector}`).join(", ")],
    ["Components", components.map((c) => `${c.label} · ${c.pin || "no pin"}`).join(", ")],
    ["Fields", components.map((c) => c.field_key || "missing mapping").join(", ")],
    ["Controls", components.some((c) => c.component_type === "led") ? "LED reported-state control" : "Read only"],
    ["Firmware", components.map((c) => `${c.component_id}: ${c.component_type === "led" ? "set_led handler" : c.component_type === "analog" ? "analogRead publisher" : "field publisher"}`).join("; ")],
    ["Freshness", `${form.freshness_seconds}s · retain ${form.retention_days} days`],
  ];
  return (
    <Page className="max-w-4xl">
      <PageHeading title="Add a project" description="Build one scoped hardware system from registered devices, components, fields, and controls." />
      <ol className="flex flex-wrap gap-2" aria-label="Project setup progress">
        {steps.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs", i === step ? "border-brand-border bg-brand-subtle text-foreground" : i < step ? "text-foreground" : "text-muted-foreground")}>
            <span className={cn("grid size-5 place-items-center rounded-full text-[10px] font-semibold", i <= step ? "bg-primary text-primary-foreground" : "bg-muted")}>{i < step ? <Check className="size-3" /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <Card className="p-6">
        <form className="grid gap-6" onSubmit={save}>
          {step === 0 && <div className="grid gap-5">
            <StepHeading title="Project identity" description="The template is an editable starting point, not a fixed project." />
            <FormField id="project-name" label="Project name"><Input id="project-name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Greenhouse bench" /></FormField>
            <FormField id="project-template" label="Starting template"><OptionSelect id="project-template" value={form.template} onValueChange={chooseTemplate} options={templates} /></FormField>
          </div>}
          {step === 1 && <div className="grid gap-4">
            <StepHeading title="Registered devices" description="Each identity owns a transport and a set of fields." />
            {devices.map((d, i) => (
              <Row key={i}>
                <FormField id={`device-${i}-id`} label="Device ID"><Input id={`device-${i}-id`} required value={d.device_id} onChange={(e) => { patchDevice(i, { device_id: e.target.value }); setComponents(components.map((c) => (c.device_id === d.device_id ? { ...c, device_id: e.target.value } : c))); }} /></FormField>
                <FormField id={`device-${i}-transport`} label="Transport"><OptionSelect id={`device-${i}-transport`} value={d.connector} onValueChange={(value) => patchDevice(i, { connector: value as DraftDevice["connector"] })} options={transports} /></FormField>
                <FormField id={`device-${i}-port`} label={d.connector === "usb" ? "Serial port" : "Broker route"}><Input id={`device-${i}-port`} value={d.serial_port} disabled={d.connector === "mqtt"} placeholder="COM5" onChange={(e) => patchDevice(i, { serial_port: e.target.value })} /></FormField>
                {i > 0 && <Button type="button" variant="ghost" onClick={() => setDevices(devices.filter((_, n) => n !== i))}>Remove</Button>}
              </Row>
            ))}
            <Button type="button" variant="secondary" className="justify-self-start" onClick={() => setDevices([...devices, { device_id: `device-${devices.length + 1}`, connector: "usb", serial_port: "", baud_rate: 115200 }])}><Plus />Add device</Button>
          </div>}
          {step === 2 && <div className="grid gap-4">
            <StepHeading title="Components" description="Add only hardware or logical sources the firmware will report." />
            {components.map((c, i) => (
              <Row key={i}>
                <FormField id={`component-${i}-label`} label="Label"><Input id={`component-${i}-label`} value={c.label} onChange={(e) => patchComponent(i, { label: e.target.value })} /></FormField>
                <FormField id={`component-${i}-type`} label="Type"><OptionSelect id={`component-${i}-type`} value={c.component_type} onValueChange={(value) => patchComponent(i, { component_type: value as DraftComponent["component_type"] })} options={componentTypes} /></FormField>
                <FormField id={`component-${i}-device`} label="Device"><OptionSelect id={`component-${i}-device`} value={c.device_id} onValueChange={(value) => patchComponent(i, { device_id: value })} options={devices.map((d) => ({ value: d.device_id, label: d.device_id }))} /></FormField>
                <FormField id={`component-${i}-pin`} label="Pin"><Input id={`component-${i}-pin`} value={c.pin} placeholder="D7 or A5" onChange={(e) => patchComponent(i, { pin: e.target.value })} /></FormField>
                <Button type="button" variant="ghost" onClick={() => setComponents(components.filter((_, n) => n !== i))}>Remove</Button>
              </Row>
            ))}
            <Button type="button" variant="secondary" className="justify-self-start" onClick={() => setComponents([...components, { component_id: `component-${components.length + 1}`, component_type: "analog", label: "Analog input", device_id: devices[0].device_id, pin: "A5", field_key: `analog_${components.length + 1}`, field_type: "number", unit: "count", precision: 0, freshness_seconds: form.freshness_seconds }])}><Plus />Add component</Button>
          </div>}
          {step === 3 && <div className="grid gap-4">
            <StepHeading title="Telemetry fields" description="These keys must match the JSON emitted by firmware." />
            {components.map((c, i) => (
              <Row key={i}>
                <FormField id={`field-${i}-component`} label="Component ID"><Input id={`field-${i}-component`} required value={c.component_id} onChange={(e) => patchComponent(i, { component_id: e.target.value })} /></FormField>
                <FormField id={`field-${i}-key`} label="JSON field"><Input id={`field-${i}-key`} required value={c.field_key} onChange={(e) => patchComponent(i, { field_key: e.target.value })} /></FormField>
                <FormField id={`field-${i}-type`} label="Type"><OptionSelect id={`field-${i}-type`} value={c.field_type} onValueChange={(value) => patchComponent(i, { field_type: value as DraftComponent["field_type"] })} options={fieldTypes} /></FormField>
                <FormField id={`field-${i}-unit`} label="Unit"><Input id={`field-${i}-unit`} value={c.unit} onChange={(e) => patchComponent(i, { unit: e.target.value })} /></FormField>
              </Row>
            ))}
          </div>}
          {step === 4 && <div className="grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-3"><StepHeading title="Timing and retention" description="Freshness is the maximum silence before a field becomes stale." /></div>
            <FormField id="interval" label="Sample interval (seconds)"><Input id="interval" type="number" min="1" value={form.interval_seconds} onChange={(e) => setForm({ ...form, interval_seconds: Number(e.target.value) })} /></FormField>
            <FormField id="freshness" label="Default freshness (seconds)"><Input id="freshness" type="number" min="3" value={form.freshness_seconds} onChange={(e) => setForm({ ...form, freshness_seconds: Number(e.target.value) })} /></FormField>
            <FormField id="retention" label="Reading retention (days)"><Input id="retention" type="number" min="1" max="3650" value={form.retention_days} onChange={(e) => setForm({ ...form, retention_days: Number(e.target.value) })} /></FormField>
          </div>}
          {step === 5 && <div className="grid gap-4">
            <StepHeading title="Review configuration" description="Creation is atomic and persists all identities and field contracts." />
            <dl className="divide-y rounded-lg border">
              {summary.map(([term, value]) => <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[160px_1fr]"><dt className="text-sm text-muted-foreground">{term}</dt><dd className="text-sm break-words">{value}</dd></div>)}
            </dl>
          </div>}
          <div className="flex justify-end gap-2 border-t pt-4">
            {step > 0 && <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
            <Button type="submit" disabled={saving}>{step === steps.length - 1 ? (saving ? "Creating project…" : "Create project") : "Continue"}</Button>
          </div>
          <p role="status" className="text-sm text-destructive empty:hidden">{message}</p>
        </form>
      </Card>
    </Page>
  );
}
```

- [ ] **Step 3: Checks, prune, verify, commit**

```bash
npm run lint && npm run typecheck && npm run build
node scripts/legacy-css.mjs prune-unused
npm run build
```
Run `npm run smoke`. Expected: the onboarding flow passes and a project is created. Compare the onboarding screenshots, then commit:
```bash
git add -A src tests/smoke.mjs
git commit -m "feat(ui): migrate project onboarding to shadcn form controls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Project workspace shell (tabs, session picker, delete dialog, agent drawer)

**Files:**
- Rewrite: `src/features/workspace/Workspace.tsx`
- Rewrite: `tests/project-actions-layout.mjs`
- Modify: `tests/ui-review.mjs` (delete dialog role), `tests/operations-review.mjs` (session picker), `tests/twin-2d-review.mjs` (session picker)

- [ ] **Step 1: Update tests first**

`tests/ui-review.mjs`, delete-dialog block (around lines 78-80): change both `page.getByRole("dialog")` to `page.getByRole("alertdialog")`. Leave the mobile navigation block (around lines 149-154) as `dialog`.

`tests/operations-review.mjs`: add `import { chooseValue } from "./helpers.mjs";`. Replace:
```js
  await page.locator(".source-picker select").selectOption(live.id);
```
with:
```js
  await chooseValue(page, page.locator(".source-picker [role=combobox]"), live.id);
```
Replace the block:
```js
  await expect(
    page
      .locator(".source-picker select")
      .locator(`option[value="${simulated.id}"]`),
  ).toBeAttached({ timeout: 5000 });
  await page.locator(".source-picker select").selectOption(simulated.id);
```
with:
```js
  await page.locator(".source-picker [role=combobox]").click();
  await page.locator(`[role="option"][data-value="${simulated.id}"]`).click({ timeout: 5000 });
```

`tests/twin-2d-review.mjs`: replace:
```js
  const simulated = await page.locator('.source-picker option').filter({ hasText: 'simulated' }).getAttribute('value');
  await page.locator('.source-picker select').selectOption(simulated);
```
with:
```js
  await page.locator('.source-picker [role=combobox]').click();
  await page.locator('[role="option"]').filter({ hasText: 'simulated' }).first().click();
```

`tests/project-actions-layout.mjs`: replace the whole file. The old version styled static HTML with the legacy stylesheets, which are going away. The new version checks the real page.
```js
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const base = process.env.AGENTWIN_TEST_URL || "http://127.0.0.1:5173";
if (new URL(base).port === "8000") throw Error("Use an isolated backend/database for this review.");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const controls = () => page.evaluate(() => [...document.querySelectorAll(".project-actions [role=combobox], .project-actions a, .project-actions button:not([role=combobox])")]
  .map((element) => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, width: rect.width }; }));
let id;
try {
  const response = await page.request.post(`${base}/api/projects`, { data: { name: "Layout review", template: "generic", device_id: "layout-01", connector: "mqtt" } });
  assert.ok(response.ok());
  id = (await response.json()).id;
  await page.goto(`${base}/projects/${id}`);
  await page.locator(".project-actions [role=combobox]").waitFor();
  const edges = await controls();
  assert.equal(edges.length, 3);
  assert.ok(edges.every((edge) => Math.abs(edge.top - edges[0].top) <= 1), JSON.stringify(edges));
  assert.ok(edges.every((edge) => Math.abs(edge.bottom - edges[0].bottom) <= 1), JSON.stringify(edges));
  await page.setViewportSize({ width: 600, height: 800 });
  const mobile = await controls();
  assert.ok(mobile[0].bottom < mobile[1].top && mobile[1].bottom < mobile[2].top, JSON.stringify(mobile));
  assert.ok(mobile.every((edge) => Math.abs(edge.width - mobile[0].width) <= 1), JSON.stringify(mobile));
  console.log("Project controls align on desktop and stack evenly on narrow screens.");
} finally {
  if (id) await page.request.delete(`${base}/api/projects/${id}`);
  await browser.close();
}
```

- [ ] **Step 2: Run the layout test to confirm it fails on the old markup**

```bash
node tests/project-actions-layout.mjs
```
Expected: FAIL, because `.project-actions [role=combobox]` doesn't exist yet (timeout).

- [ ] **Step 3: Rewrite `src/features/workspace/Workspace.tsx`**

State, websocket, resize and localStorage logic are unchanged.
```tsx
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowLeft, Bell, Cable, Database } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ProjectId } from "@/components/CopyId";
import { EmptyState } from "@/components/EmptyState";
import { OptionSelect } from "@/components/OptionSelect";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { SlidingTabsList } from "@/components/SlidingTabs";
import { Stat } from "@/components/Stat";
import { StatusBadge } from "@/components/StatusBadge";
import type { ProjectContext } from "@/app/types";
import { AgentPanel } from "@/features/agent/AgentPanel";
import { cn } from "@/lib/utils";
import type { State } from "@/types";
import { api, display, time } from "@/types";
import { ControlsPanel } from "./ControlsPanel";
import { Events } from "./Events";
import { ProjectOverview } from "./ProjectOverview";
import { Readings } from "./Readings";

const DigitalTwin = lazy(() => import("@/features/digital-twin/DigitalTwin").then((module) => ({ default: module.DigitalTwin })));
const tabs: [string, string][] = [["overview", "Overview"], ["readings", "Live readings"], ["twin", "Digital twin"], ["events", "Events & history"], ["controls", "Controls"]];
const mobileQuery = "(max-width: 760px)";

export function Workspace({ connected, onContextChange }: { connected: boolean; onContextChange: (context: ProjectContext) => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [agentWidth, setAgentWidth] = useState(() => Number(localStorage.getItem("agentwin-agent-width")) || 380);
  const [agentCollapsed, setAgentCollapsed] = useState(() => window.matchMedia(mobileQuery).matches || localStorage.getItem("agentwin-collapsed") === "true");
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(""), [sid, setSid] = useState(""), [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [tab, setTab] = useState(new URLSearchParams(location.search).get("tab") || "twin");
  const refresh = useCallback(() => {
    api<State>("/projects/" + id + (sid ? "?session=" + sid : "")).then((s) => { setState(s); setError(""); }).catch((e) => setError(e.message));
  }, [id, sid]);
  useEffect(() => { setState(null); setSelectedComponentId(null); }, [id]);
  useEffect(() => {
    refresh();
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws?project=${id}${sid ? `&session=${sid}` : ""}`);
      socket.onopen = refresh;
      socket.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "project_snapshot") { setState(m.state); setError(""); } };
      socket.onclose = () => { if (!stopped) timer = setTimeout(connect, 2000); };
      socket.onerror = () => socket.close();
    };
    connect();
    return () => { stopped = true; clearTimeout(timer); socket?.close(); };
  }, [refresh, id, sid]);
  useEffect(() => { if (state) onContextChange({ projectId: state.project.id, mode: state.session.mode }); }, [state?.project.id, state?.session.mode, onContextChange]);
  useEffect(() => {
    const mobile = window.matchMedia(mobileQuery);
    const adapt = () => setAgentCollapsed(mobile.matches || localStorage.getItem("agentwin-collapsed") === "true");
    mobile.addEventListener("change", adapt);
    return () => mobile.removeEventListener("change", adapt);
  }, []);
  useEffect(() => {
    if (agentCollapsed) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && window.matchMedia(mobileQuery).matches) setAgentCollapsed(true); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [agentCollapsed]);
  if (!state) return <Page><EmptyState>{error || "Loading project…"}</EmptyState></Page>;
  const p = state.project;
  const removeProject = async () => {
    setDeleting(true);
    try { await api(`/projects/${p.id}`, {}, "DELETE"); navigate("/projects"); }
    catch (failure) { setError((failure as Error).message); setDeleteOpen(false); }
    finally { setDeleting(false); }
  };
  const startAgentResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX, startWidth = agentWidth;
    let currentWidth = agentWidth;
    document.body.classList.add("select-none", "cursor-col-resize");
    const move = (moveEvent: PointerEvent) => { currentWidth = Math.max(320, Math.min(640, startWidth + startX - moveEvent.clientX)); setAgentWidth(currentWidth); };
    const stop = () => {
      document.body.classList.remove("select-none", "cursor-col-resize");
      localStorage.setItem("agentwin-agent-width", String(currentWidth));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const nudgeAgentWidth = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextWidth = Math.max(320, Math.min(640, agentWidth + (event.key === "ArrowLeft" ? 20 : -20)));
    setAgentWidth(nextWidth);
    localStorage.setItem("agentwin-agent-width", String(nextWidth));
  };
  const toggleAgent = () => {
    const next = !agentCollapsed;
    setAgentCollapsed(next);
    if (!window.matchMedia(mobileQuery).matches) localStorage.setItem("agentwin-collapsed", String(next));
  };
  const primary = p.graph.fields[p.graph.primary_field];
  return (
    <Page className="max-w-none">
      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>Delete {p.name} and all of its stored sessions, readings, events, and actions?</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm font-medium text-destructive">This cannot be undone.</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={removeProject}>{deleting ? "Deleting…" : "Delete project"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Link to="/projects" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />All projects</Link>
      <PageHeading
        eyebrow={`${p.template.replaceAll("_", " ")} project`}
        title={p.name}
        actions={
          <div className="project-actions flex items-end gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch">
            <div className="source-picker grid gap-1.5">
              <Label htmlFor="session-picker" className="text-xs font-normal text-muted-foreground">Session</Label>
              <OptionSelect id="session-picker" value={state.session.id} onValueChange={setSid} className="w-[215px] max-sm:w-full" options={state.sessions.map((session) => ({ value: session.id, label: `${session.mode} · ${time(session.created)}` }))} />
            </div>
            <Button asChild variant="outline"><Link to={`/settings?project=${p.id}`}>Monitoring settings</Link></Button>
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>Manage project</Button>
          </div>
        }
      >
        <ProjectId value={p.id} />
        {p.arabic_title && <p className="text-sm text-subtle-foreground" dir="rtl" lang="ar">{p.arabic_title}</p>}
      </PageHeading>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <StatusBadge>{state.session.mode} session</StatusBadge>
        <StatusBadge tone={connected && state.status === "reporting" ? "success" : "warning"}>{connected ? state.status : "Backend disconnected · snapshot only"}</StatusBadge>
        <span>{p.devices.map((device) => device.id).join(", ")}</span>
        <span>Freshness: {p.freshness_seconds}s</span>
        <span>Connector status: {state.gateway_status}</span>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={primary.label} value={<>{display(state.latest?.readings[p.graph.primary_field])}<em>{primary.unit}</em></>} hint={state.status === "reporting" ? "Latest received sample" : "Last stored value · check freshness"} icon={<Activity />} />
        <Stat label="Devices reporting" value={`${state.devices.filter((device) => device.reporting).length}/${state.devices.length}`} hint="Configured devices" icon={<Cable />} />
        <Stat label="Last telemetry" value={time(state.latest?.received)} hint="Server receipt time · local timezone" icon={<Database />} />
        <Stat label="Open events" value={state.events.filter((e) => !e.recovered).length} hint="Acknowledgement does not mean recovery" icon={<Bell />} />
      </div>
      <p className="source-note rounded-lg border border-dashed px-4 py-2 text-sm text-muted-foreground">{state.session.mode === "live" ? "Live data is scoped to this project and its registered devices." : "Test data is isolated from live device state and never routes physical commands."}</p>
      <div className={cn("workspace-grid relative grid min-w-0 gap-4", agentCollapsed ? "md:grid-cols-[minmax(0,1fr)_auto]" : "md:grid-cols-[minmax(0,1fr)_8px_var(--agent-width)]")} style={{ "--agent-width": `${agentWidth}px` } as React.CSSProperties}>
        <section className="workspace-main min-w-0">
          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <ScrollArea className="w-full"><SlidingTabsList value={tab} items={tabs} aria-label="Project views" /><ScrollBar orientation="horizontal" /></ScrollArea>
            <TabsContent value="overview" className="tab-content"><ProjectOverview state={state} /></TabsContent>
            <TabsContent value="readings" className="tab-content"><Readings state={state} /></TabsContent>
            <TabsContent value="twin" className="tab-content">
              <Suspense fallback={<EmptyState icon={<Activity />} title="Loading Live Twin"><p>Preparing the operational scene.</p></EmptyState>}>
                <DigitalTwin state={state} selectedId={selectedComponentId} onSelect={setSelectedComponentId} refresh={refresh} />
              </Suspense>
            </TabsContent>
            <TabsContent value="events" className="tab-content"><Events state={state} refresh={refresh} /></TabsContent>
            <TabsContent value="controls" className="tab-content"><ControlsPanel state={state} refresh={refresh} /></TabsContent>
          </Tabs>
        </section>
        {!agentCollapsed && <button type="button" className="hidden cursor-col-resize rounded-full bg-border transition-colors hover:bg-brand focus-visible:bg-brand focus-visible:outline-none md:block" aria-label="Resize agent panel" title="Drag to resize; use arrow keys; double-click to reset" onPointerDown={startAgentResize} onKeyDown={nudgeAgentWidth} onDoubleClick={() => { setAgentWidth(380); localStorage.setItem("agentwin-agent-width", "380"); }} />}
        <aside className={cn("workspace-agent min-w-0", !agentCollapsed && "max-md:fixed max-md:inset-0 max-md:z-40 max-md:flex max-md:justify-end")} aria-label="Win project assistant" onKeyDown={(event) => { if (event.key === "Escape" && !agentCollapsed) toggleAgent(); }}>
          {!agentCollapsed && <button type="button" className="absolute inset-0 bg-backdrop md:hidden" aria-label="Close Win" onClick={toggleAgent} />}
          {agentCollapsed && (
            <Button variant="outline" className="h-auto flex-col gap-2 px-2 py-3 max-md:fixed max-md:right-4 max-md:bottom-4 max-md:z-30 max-md:flex-row max-md:rounded-full" aria-label="Open Win assistant" aria-expanded="false" onClick={toggleAgent}>
              <img src="/assets/win.webp" alt="" className="size-8 rounded-full" /><strong className="text-xs">Win</strong>
            </Button>
          )}
          <div hidden={agentCollapsed} className="relative h-full max-md:w-[min(420px,100%)] md:sticky md:top-20 md:max-h-[calc(100svh-6rem)]">
            <AgentPanel key={`${state.project.id}:${state.session.id}`} state={state} onCollapse={toggleAgent} />
          </div>
        </aside>
      </div>
    </Page>
  );
}
```

- [ ] **Step 4: Checks and prune**

```bash
npm run lint && npm run typecheck && npm run build
node scripts/legacy-css.mjs prune-unused
node scripts/legacy-css.mjs prune project-page project-actions project-manage source-picker source-note workspace-grid workspace-main workspace-agent workspace-resizer win-rail win-drawer-backdrop win-panel-wrap win-collapsed tab-content status-line back eyebrow
npm run build
```

- [ ] **Step 5: Verify**

```bash
node tests/project-actions-layout.mjs
```
Expected: PASS, printing "Project controls align on desktop and stack evenly on narrow screens."

Then run `npm run smoke`, `npm run test:ui`, `npm run test:operations` and `node tests/twin-2d-review.mjs`. Expected: results match the baseline. Check keyboard tab navigation (Arrow keys), dialog Escape and focus restore to "Manage project", and the agent resize and collapse at 1440 and 390 widths.

- [ ] **Step 6: Commit**

```bash
git add -A src tests
git commit -m "feat(ui): migrate project workspace to shadcn Tabs, Select, and AlertDialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Workspace tab panels (overview, readings, controls, events)

**Files:**
- Rewrite: `src/features/workspace/ProjectOverview.tsx`, `Readings.tsx`, `ControlsPanel.tsx`, `Events.tsx`

- [ ] **Step 1: `src/features/workspace/ProjectOverview.tsx`**

```tsx
import { Activity, Power } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { CompactId } from "@/components/CopyId";
import { Stat } from "@/components/Stat";
import { StatusBadge } from "@/components/StatusBadge";
import { humanAction } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { State } from "@/types";
import { display, time } from "@/types";

function presentMetric(key: string, value: unknown, unit: string) {
  if (typeof value === "boolean") return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm", value ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground")}><Power className="size-3.5" />{value ? "On" : "Off"}</span>;
  if (key.includes("command_id") && typeof value === "string") return <CompactId value={value} />;
  return <>{display(value)}<em>{unit}</em></>;
}

export function ProjectOverview({ state }: { state: State }) {
  const p = state.project;
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(p.graph.fields).map(([key, field]) => <Stat key={key} label={field.label} value={presentMetric(key, state.latest?.readings[key], field.unit)} hint={state.field_status[key]?.received ? `Received ${time(state.field_status[key].received)}` : "No reported value"} icon={<Activity />} />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-0 py-0">
          <CardHeader className="flex items-center justify-between border-b py-4"><CardTitle><h3>Devices</h3></CardTitle><span className="text-xs text-muted-foreground">{state.devices.filter((device) => device.reporting).length}/{state.devices.length} reporting</span></CardHeader>
          {state.devices.map((device) => (
            <div key={device.id} className="flex items-center justify-between gap-3 border-b px-6 py-3 last:border-b-0">
              <div><strong className="block text-sm font-medium">{device.id}</strong><small className="text-xs text-muted-foreground">{device.connector.toUpperCase()} connector</small></div>
              <StatusBadge tone={device.reporting ? "success" : device.online ? "warning" : "neutral"}>{device.reporting ? "Reporting" : device.online ? "Connected" : "Unavailable"}</StatusBadge>
            </div>
          ))}
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="flex items-center justify-between border-b py-4"><CardTitle><h3>Recent actions</h3></CardTitle><span className="text-xs text-muted-foreground">Latest {Math.min(state.actions.length, 5)}</span></CardHeader>
          {state.actions.length ? state.actions.slice(0, 5).map((action) => (
            <div key={action.id} className="flex items-center justify-between gap-3 border-b px-6 py-3 last:border-b-0">
              <div><strong className="block text-sm font-medium">{humanAction(action.action)}</strong><CompactId value={action.id} /></div>
              <StatusBadge tone={action.status === "completed" ? "success" : action.status === "requested" ? "warning" : "neutral"}>{action.status.replaceAll("_", " ")}</StatusBadge>
            </div>
          )) : <p className="px-6 py-4 text-sm text-muted-foreground">No commands have been requested.</p>}
        </Card>
      </div>
    </div>
  );
}
```
The smoke test waits for `getByRole("heading", { name: "Devices", exact: true })`. The `<h3>` inside `CardTitle` guarantees a heading role, because `CardTitle` renders a `div`.

- [ ] **Step 2: `src/features/workspace/Readings.tsx`**

```tsx
import { useState } from "react";
import { Activity } from "lucide-react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { EmptyState } from "@/components/EmptyState";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { metricValue } from "@/lib/format";
import type { State } from "@/types";
import { time } from "@/types";

export function Readings({ state }: { state: State }) {
  const [field, setField] = useState(state.project.graph.primary_field);
  const [transitionLimit, setTransitionLimit] = useState(5);
  const metric = state.project.graph.fields[field];
  const rows = state.readings.map((reading) => ({ received: reading.received, value: reading.readings[field] }));
  const transitions = state.readings.filter((reading, index, all) => index === 0 || reading.readings[field] !== all[index - 1].readings[field]).reverse();
  const chartConfig = { value: { label: metric.label, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h3 className="text-base font-semibold">Readings</h3><p className="text-sm text-muted-foreground">{metric.data_type === "number" ? "Stored observations for this project and selected session." : "State changes only; repeated samples with the same value are collapsed."}</p></div>
        <FormField id="readings-metric" label="Metric"><OptionSelect id="readings-metric" value={field} onValueChange={(value) => { setField(value); setTransitionLimit(5); }} className="sm:w-56" options={Object.entries(state.project.graph.fields).map(([key, item]) => ({ value: key, label: `${item.label} ${item.unit}` }))} /></FormField>
      </div>
      {!rows.length ? (
        <EmptyState icon={<Activity />} title="No readings in this session"><p>Readings appear here when the selected source reports telemetry. Stored values from other sessions remain separate.</p></EmptyState>
      ) : metric.data_type === "number" ? (
        <ChartContainer config={chartConfig} className="aspect-auto h-80 w-full">
          <LineChart data={rows}>
            <XAxis dataKey="received" tickFormatter={(value) => time(Number(value))} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis tickLine={false} axisLine={false} width={48} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => time(Number(payload?.[0]?.payload?.received))} />} />
            <Line dataKey="value" stroke="var(--color-value)" isAnimationActive={false} dot={false} connectNulls={false} strokeWidth={2} />
          </LineChart>
        </ChartContainer>
      ) : (
        <>
          <div className="transition-list divide-y rounded-lg border">
            {transitions.slice(0, transitionLimit).map((reading) => <div key={reading.id} className="flex justify-between px-4 py-2.5 text-sm"><span className="text-muted-foreground">{time(reading.received)}</span><strong className="font-medium">{metricValue(reading.readings[field], metric.precision)}</strong></div>)}
          </div>
          {transitions.length > 5 && <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setTransitionLimit(transitionLimit >= transitions.length ? 5 : Math.min(transitionLimit + 10, transitions.length))}>{transitionLimit >= transitions.length ? "Show less" : `Show more (${transitions.length - transitionLimit})`}</Button>}
        </>
      )}
    </div>
  );
}
```
The smoke test waits for `getByRole("heading", { name: "Readings" })`, and the `<h3>` provides it.

- [ ] **Step 3: `src/features/workspace/ControlsPanel.tsx`**

```tsx
import { useState } from "react";
import { Activity, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { controlReady, metricValue } from "@/lib/format";
import type { Component, State } from "@/types";
import { api } from "@/types";

export function ControlsPanel({ state, refresh }: { state: State; refresh: () => void }) {
  const [message, setMessage] = useState("");
  const controls = state.project.graph.components.flatMap((component) => (component.controls || []).map((control) => ({ component, control })));
  const run = async (component: Component, action: string, value: boolean) => {
    try {
      const result = await api<{ id: string; status: string }>(`/projects/${state.project.id}/sessions/${state.session.id}/actions`, { component_id: component.id, action, value });
      setMessage(`Action ${result.id.slice(0, 8)} is ${result.status}. It completes only after matching telemetry.`);
      refresh();
    } catch (error) { setMessage((error as Error).message); }
  };
  return (
    <div className="grid gap-4">
      <div><h3 className="text-base font-semibold">Hardware controls</h3><p className="text-sm text-muted-foreground">Commands remain pending until the target device reports the expected state.</p></div>
      {controls.length ? controls.map(({ component, control }) => {
        const latestAction = state.actions.find((action) => action.target === component.id);
        const ready = controlReady(state, state.project, control);
        const pending = latestAction?.status === "requested";
        return (
          <Card key={`${component.id}-${control.action}`} className="control-card gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h4 className="font-semibold">{component.name}</h4><p className="text-sm text-muted-foreground">{control.label}</p></div>
              <StatusBadge tone={latestAction?.status === "completed" ? "success" : pending ? "warning" : "neutral"}>{latestAction?.status?.replace("_", " ") || "ready"}</StatusBadge>
            </div>
            <div className="control-state grid gap-3 sm:grid-cols-3">
              {[["Reported state", metricValue(state.latest?.readings[control.expected.field], 0)], ["Verification field", control.expected.field], ["Last request", latestAction ? latestAction.action.replace(":", " ") : "None"]].map(([label, value]) => (
                <span key={label} className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{label}<strong className="mt-0.5 block text-sm font-medium text-foreground">{value}</strong></span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button disabled={!ready || pending} onClick={() => run(component, control.action, true)}>Turn on</Button>
              <Button variant="secondary" disabled={!ready || pending} onClick={() => run(component, control.action, false)}>Turn off</Button>
            </div>
            {pending && <p className="flex items-center gap-2 text-sm text-warning"><Activity className="size-3.5" />Waiting for matching device telemetry. The reported state has not been confirmed yet.</p>}
            {!ready && <p className="text-sm text-muted-foreground">Connect the configured live transport before controlling this component.</p>}
          </Card>
        );
      }) : <EmptyState icon={<ShieldCheck />} title="No hardware controls configured"><p>This project is read-only until a device capability and verification contract are registered.</p></EmptyState>}
      <p role="status" className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
```
`operations-review.mjs` reads `.control-state` text "Off"/"On" with `exact: true`. The value sits in its own `<strong>`, so the exact-text match still works.

- [ ] **Step 4: `src/features/workspace/Events.tsx`**

```tsx
import { useState } from "react";
import { Bell, Check, ShieldCheck, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { SectionHeading } from "@/components/SectionHeading";
import { StatusBadge } from "@/components/StatusBadge";
import { emailStatus, summaryTime } from "@/lib/format";
import type { Event as ProjectEvent, State } from "@/types";
import { api, display, time } from "@/types";

const statusLabel = (event: ProjectEvent) => (event.recovered ? (event.evidence.close_reason ? "Closed" : "Recovered") : "Open");

export function Events({ state, refresh }: { state: State; refresh: () => void }) {
  const [selected, setSelected] = useState<ProjectEvent | null>(null), [error, setError] = useState("");
  const acknowledge = async (e: ProjectEvent) => {
    try {
      await api(`/projects/${state.project.id}/sessions/${state.session.id}/events/${e.id}/acknowledge`, {});
      refresh();
      setSelected({ ...e, acknowledged: Date.now() / 1000 });
    } catch (err) { setError((err as Error).message); }
  };
  return (
    <div className="grid gap-4">
      <div><h3 className="text-base font-semibold">Events & history</h3><p className="text-sm text-muted-foreground">Actual triggers, supporting readings, and recovery.</p></div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {state.events.length ? state.events.map((e) => (
        <Card key={e.id} className="event-item gap-0 py-0">
          <button type="button" onClick={() => setSelected(e)} className="flex w-full items-center gap-3 rounded-t-xl px-4 py-3 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Bell className="size-4 text-warning" />
            <span className="min-w-0 flex-1"><strong className="block text-sm font-medium">{e.kind === "missing_telemetry" ? "Device silent" : "Threshold breached"}</strong><small className="text-xs text-muted-foreground">{e.evidence.rule} · {time(e.created)}</small></span>
            <StatusBadge tone={e.recovered ? "success" : "warning"}>{statusLabel(e)}</StatusBadge>
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
            <span>{e.recovered ? (e.evidence.close_reason ? "Closed " : "Recovery ") + time(e.recovered) : "Cause unknown"} · Email {emailStatus(e.email_status, state.project.monitoring.alert_email_enabled)}</span>
            <Button size="sm" variant="outline" disabled={!!e.acknowledged} onClick={() => acknowledge(e)}>{e.acknowledged ? <><Check />Acknowledged</> : "Acknowledge event"}</Button>
          </div>
        </Card>
      )) : <EmptyState icon={<ShieldCheck />} title="No events in this session"><p>Configured rules will record missing telemetry and sustained high readings.</p></EmptyState>}
      <section className="grid gap-3" aria-label="Scheduled live summaries">
        <SectionHeading level={3} title="Scheduled live summaries" aside="Informational, not open alerts" />
        {state.summaries?.length ? state.summaries.map((summary) => (
          <Card key={summary.id} className="gap-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-sm font-medium">{summaryTime(summary.period_end)}</strong><small className="text-xs text-muted-foreground">{Math.round((summary.period_end - summary.period_start) / 60)}-minute live window · {summary.source === "local_model" ? "AI-assisted" : "Evidence summary"}</small></div>
            <p className="text-sm">{summary.body}</p>
            <small className="text-xs text-muted-foreground">Email {emailStatus(summary.email_status, state.project.monitoring.summary_email_enabled)}</small>
          </Card>
        )) : <p className="text-sm text-muted-foreground">No scheduled live summaries yet.</p>}
      </section>
      {selected && (
        <Card className="gap-4 border-brand-border p-5 animate-in fade-in slide-in-from-bottom-2 duration-[var(--duration-fast)]">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Event evidence</h3><Button variant="ghost" size="icon" aria-label="Close evidence" onClick={() => setSelected(null)}><X /></Button></div>
          <div className="flex items-center gap-2 text-sm"><StatusBadge tone={selected.recovered ? "success" : "warning"}>{statusLabel(selected)}</StatusBadge><span className="text-muted-foreground">{selected.acknowledged ? "Acknowledged" : "Not acknowledged"}</span></div>
          <h4 className="font-medium">{selected.evidence.rule}</h4>
          <p className="text-sm text-muted-foreground">{selected.evidence.close_reason || (selected.kind === "missing_telemetry" ? "Telemetry stopped after this device had reported. The physical or network cause is not established." : "Two recent readings crossed the configured limit. The physical cause is not established.")}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            {[["Detected", time(selected.created)], ["Recovered", selected.recovered ? time(selected.recovered) : "Not yet"], ["Duration", selected.recovered ? `${Math.max(1, Math.round(selected.recovered - selected.created))} seconds` : "Ongoing"], ["Source", selected.evidence.source_mode]].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted px-3 py-2"><span className="block text-xs text-muted-foreground">{label}</span><strong className="text-sm font-medium">{value}</strong></div>
            ))}
          </div>
          <small className="text-xs text-muted-foreground">Event {selected.id} · {selected.evidence.source_mode}</small>
          {selected.evidence.readings.map((r) => (
            <div key={r.id} className="rounded-lg border px-3 py-2 text-sm"><strong className="block font-medium">Reading #{r.id} · {time(r.received)}</strong><span className="text-muted-foreground">{Object.entries(r.readings).map(([k, v]) => `${k}: ${display(v)}`).join(" · ")}</span></div>
          ))}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Checks, prune, verify, commit**

```bash
npm run lint && npm run typecheck && npm run build
node scripts/legacy-css.mjs prune-unused
node scripts/legacy-css.mjs prune event-item control-card control-state transition-list
npm run build
```
Run `npm run smoke`, `npm run test:operations` and `npm run test:ui`. Expected: results match the baseline. Compare the screenshots of each workspace tab, then commit:
```bash
git add -A src
git commit -m "feat(ui): migrate workspace tab panels to shadcn Card, Chart, and Button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Win agent panel

**Files:**
- Rewrite: `src/features/agent/AgentPanel.tsx`

- [ ] **Step 1: Rewrite `src/features/agent/AgentPanel.tsx`**

The accessible names must match Task 0's result: the textarea is labelled "Ask Win about this system" and the send button "Send question to Win" (or whatever Task 0 aligned the tests to). The summary region is "Latest scheduled summary" and the container is "Win project assistant".
```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { PanelRightClose, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Mark } from "@/components/Mark";
import { emailStatus, sessionLabel, summaryTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Answer, State } from "@/types";
import { api, time } from "@/types";

function WinAvatar({ className }: { className?: string }) {
  return <img className={cn("size-11 shrink-0 rounded-full", className)} src="/assets/win.webp" alt="" width="44" height="44" decoding="async" />;
}

const prompts = ["What is the current state?", "What changed recently?", "Explain active events", "Which actions are permitted?"];

export function AgentPanel({ state, onCollapse }: { state: State; onCollapse?: () => void }) {
  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentError, setAgentError] = useState("");
  const ask = async (value = question) => {
    if (!value.trim() || busy) return;
    setBusy(true); setAgentError(""); setAnswer(null); setSubmittedQuestion(value);
    try { setAnswer(await api<Answer>(`/projects/${state.project.id}/sessions/${state.session.id}/agent`, { question: value })); }
    catch (error) { setAgentError((error as Error).message); }
    finally { setBusy(false); }
  };
  const latestSummary = state.summaries?.[0];
  const reference = (item: Answer["evidence"][number]) => <small key={item.id} className="block text-xs text-muted-foreground">{item.id} · {time(item.timestamp)}</small>;
  return (
    <Card className="agent-mini flex h-full max-h-[inherit] flex-col gap-0 overflow-hidden border-brand-border bg-glass py-0 shadow-elevated backdrop-blur" aria-label="Win project assistant" role="region">
      <div className="flex items-center gap-3 border-b p-4">
        <WinAvatar />
        <div className="min-w-0 flex-1"><h3 className="font-semibold">Win</h3><p className="text-xs text-muted-foreground">Project AI Assistant</p></div>
        {onCollapse && <Button variant="ghost" size="icon" aria-label="Collapse Win assistant" title="Collapse Win" onClick={onCollapse}><PanelRightClose /></Button>}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          <div className="rounded-lg bg-muted p-3 text-sm">
            <span className="block text-xs text-muted-foreground">Project context</span>
            <strong className="block truncate" title={state.project.name}>{state.project.name}</strong>
            <small className="flex items-center gap-1.5 text-xs text-muted-foreground"><i className={cn("size-2 rounded-full", state.status === "reporting" ? "bg-success" : "bg-muted-foreground")} />{sessionLabel(state.session.mode)} session <span aria-hidden="true">·</span> {state.status}</small>
          </div>
          <section className="grid gap-2 rounded-lg border p-3" aria-label="Latest scheduled summary">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Mark className="size-5" /><strong className="text-xs">Agentwin summary</strong></div><span className="text-xs text-muted-foreground">{state.project.monitoring.summary_interval_minutes} min</span></div>
            {latestSummary ? (
              <>
                <time className="text-xs text-muted-foreground" dateTime={new Date(latestSummary.period_end * 1000).toISOString()}>{summaryTime(latestSummary.period_end)}</time>
                <p className="text-sm">{latestSummary.body}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{latestSummary.source === "local_model" ? "AI-assisted" : "Evidence summary"} · Email {emailStatus(latestSummary.email_status, state.project.monitoring.summary_email_enabled)}</span><Link className="text-brand hover:underline" to="/events">View in Events</Link></div>
              </>
            ) : <p className="text-sm text-muted-foreground">{state.project.monitoring.summary_enabled ? "The first live summary will appear after the next interval." : "Summaries are off for this project."}</p>}
          </section>
          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">Suggested questions</span>
            <div className="flex flex-wrap gap-2">{prompts.map((prompt) => <Button key={prompt} type="button" variant="outline" size="sm" className="h-auto rounded-full py-1 text-xs" onClick={() => setQuestion(prompt)}>{prompt}</Button>)}</div>
          </div>
          {!submittedQuestion && !busy && !agentError && !answer && (
            <div className="flex flex-col items-center gap-2 py-4 text-center"><WinAvatar /><strong className="text-sm">Ask Win about this project</strong><p className="text-xs text-muted-foreground">Explore readings, events, and permitted actions in this session.</p></div>
          )}
          {(submittedQuestion || busy || agentError || answer) && (
            <div className="grid gap-3" role="log" aria-label="Win conversation" aria-live="polite">
              {submittedQuestion && <div className="ml-8 rounded-lg bg-brand-subtle p-3"><span className="block text-xs text-muted-foreground">Operator</span><p className="text-sm">{submittedQuestion}</p></div>}
              {busy && <div className="flex gap-2"><WinAvatar className="size-7" /><div className="rounded-lg bg-muted p-3"><span className="block text-xs text-muted-foreground">Win</span><p className="animate-pulse text-sm">Checking project evidence…</p></div></div>}
              {agentError && <div className="grid gap-2"><Alert variant="destructive"><AlertDescription>{agentError}</AlertDescription></Alert><Button size="sm" variant="outline" className="justify-self-start" onClick={() => void ask(submittedQuestion)}>Retry</Button></div>}
              {answer && (
                <div className="flex gap-2">
                  <WinAvatar className="size-7" />
                  <div className={cn("grid flex-1 gap-2 rounded-lg bg-muted p-3 text-sm", !answer.available && "border border-warning-border")}>
                    <span className="text-xs text-muted-foreground">Win</span>
                    <div><span className="block text-xs text-muted-foreground">Finding</span><strong className="font-medium">{answer.finding}</strong></div>
                    {answer.evidence.length > 0 && (
                      <div>
                        <span className="block text-xs text-muted-foreground">Evidence</span>
                        {answer.evidence.slice(0, 3).map(reference)}
                        {answer.evidence.length > 3 && (
                          <Collapsible>
                            <CollapsibleTrigger asChild><Button variant="link" size="sm" className="h-auto p-0 text-xs">Show {answer.evidence.length - 3} more references</Button></CollapsibleTrigger>
                            <CollapsibleContent>{answer.evidence.slice(3).map(reference)}</CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    )}
                    <div><span className="block text-xs text-muted-foreground">Uncertainty</span><p>{answer.uncertainty}</p></div>
                    <div><span className="block text-xs text-muted-foreground">Next step</span><p>{answer.next_step}</p></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="grid gap-2 border-t p-4">
        <div className="flex items-end gap-2">
          <Textarea aria-label="Ask Win about this system" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} placeholder="Ask Win about this system..." disabled={busy} className="min-h-0 resize-none" />
          <Button type="button" size="icon" onClick={() => void ask()} disabled={busy || !question.trim()} aria-label="Send question to Win" title="Send question"><Send /></Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Actions require backend permission and operator confirmation. Device telemetry verifies completion.</p>
      </div>
    </Card>
  );
}
```
The Retry button sits outside the `Alert` on purpose. `operations-review.mjs` asserts that `getByRole("alert")` has exactly the text "Review fixture: provider unavailable". shadcn `Alert` already has `role="alert"`.

- [ ] **Step 2: Checks, prune, verify, commit**

```bash
npm run lint && npm run typecheck && npm run build
node scripts/legacy-css.mjs prune-unused
node scripts/legacy-css.mjs prune agent-mini
npm run build
```
Run `npm run smoke`, `npm run test:operations` and `node tests/monitoring-ui.mjs` (with its env vars from Task 0). Expected: results match the baseline. Compare the agent panel screenshots at 1440 (docked) and 390 (drawer), then commit:
```bash
git add -A src
git commit -m "feat(ui): migrate Win agent panel to shadcn Card, Textarea, and ScrollArea

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Settings and monitoring settings

**Files:**
- Rewrite: `src/features/settings/GlobalSettings.tsx`, `src/features/settings/MonitoringSettings.tsx`
- Modify: `tests/monitoring-ui.mjs`

- [ ] **Step 1: Update `tests/monitoring-ui.mjs` first**

Add after the imports:
```js
import { chooseValue } from "./helpers.mjs";
```
Replace lines 18-25 (from `const projectSelector` to the closing `}` of the `if (otherProjectId)` block):
```js
  const projectSelector = page.locator(".monitoring-heading [role=combobox]");
  await expect(projectSelector).toHaveAttribute("data-value", projectId);
  if (otherProjectId) {
    await chooseValue(page, projectSelector, otherProjectId);
    await page.waitForTimeout(1500);
    await expect(projectSelector).toHaveAttribute("data-value", otherProjectId);
    await chooseValue(page, projectSelector, projectId);
  }
```
Replace line 36:
```js
  await expect(page.locator(".monitoring-heading select")).toHaveValue(projectId);
```
with:
```js
  await expect(page.locator(".monitoring-heading [role=combobox]")).toHaveAttribute("data-value", projectId);
```

- [ ] **Step 2: Rewrite `src/features/settings/MonitoringSettings.tsx`**

The logic (state, effects, validation and save payload) is unchanged. Labels "Alert after device silence", "Every", "Limit" and "Add limit", the "Save monitoring settings" button and the `.monitoring-actions [role='status']` hook are all kept.
```tsx
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell, Clock3, Mail, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/FormField";
import { OptionSelect } from "@/components/OptionSelect";
import { cn } from "@/lib/utils";
import type { MonitoringSettings as Monitoring, Project, State, ThresholdRule } from "@/types";
import { api } from "@/types";

const copy = (settings: Monitoring): Monitoring => ({ ...settings, threshold_rules: settings.threshold_rules.map((rule) => ({ ...rule })) });

function Block({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4">
      <div className="flex gap-3"><span className="mt-0.5 text-brand [&_svg]:size-4">{icon}</span><div><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div></div>
      <div className="grid gap-4 pl-7">{children}</div>
    </div>
  );
}

function SwitchRow({ id, checked, onCheckedChange, children }: { id: string; checked: boolean; onCheckedChange: (checked: boolean) => void; children: React.ReactNode }) {
  return <div className="flex items-center gap-3"><Switch id={id} checked={checked} onCheckedChange={onCheckedChange} /><Label htmlFor={id} className="font-normal">{children}</Label></div>;
}

export function ProjectMonitoringSettings({ states, emailConfigured, defaultRecipientConfigured }: { states: State[]; emailConfigured: boolean; defaultRecipientConfigured: boolean }) {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("project");
  const initial = states.find((state) => state.project.id === requested) ?? states[0];
  const [selectedId, setSelectedId] = useState(initial?.project.id ?? "");
  const [draft, setDraft] = useState<Monitoring | null>(initial ? copy(initial.project.monitoring) : null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const lastRequested = useRef(requested);
  const selected = states.find((state) => state.project.id === selectedId);
  useEffect(() => {
    const routeChanged = lastRequested.current !== requested;
    if (!routeChanged && selected) return;
    const target = states.find((state) => state.project.id === requested) ?? selected ?? states[0];
    if (!target) return;
    lastRequested.current = requested;
    setSelectedId(target.project.id);
    setDraft(copy(target.project.monitoring));
    setMessage("");
  }, [requested, selected, states]);
  if (!selected || !draft) return <Card className="p-6"><h2 className="text-lg font-semibold">Project monitoring</h2><p className="text-sm text-muted-foreground">Add a project to configure alerts and summaries.</p></Card>;
  const project = selected.project;
  const numericFields = Object.entries(project.graph.fields).filter(([, field]) => field.data_type === "number");
  const change = (patch: Partial<Monitoring>) => { setDraft({ ...draft, ...patch }); setMessage(""); };
  const editRule = (index: number, patch: Partial<ThresholdRule>) => change({ threshold_rules: draft.threshold_rules.map((rule, current) => (current === index ? { ...rule, ...patch } : rule)) });
  const addRule = () => {
    const unused = numericFields.flatMap(([field_key]) => (["above", "below"] as const).map((direction) => ({ field_key, direction }))).find((candidate) => !draft.threshold_rules.some((rule) => rule.field_key === candidate.field_key && rule.direction === candidate.direction));
    if (unused) change({ threshold_rules: [...draft.threshold_rules, { ...unused, limit: Number.NaN }] });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.threshold_rules.some((rule) => !Number.isFinite(rule.limit))) { setFailed(true); setMessage("Enter a number for every limit."); return; }
    const keys = draft.threshold_rules.map((rule) => `${rule.field_key}:${rule.direction}`);
    if (keys.length !== new Set(keys).size) { setFailed(true); setMessage("Each field can have only one above and one below limit."); return; }
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const saved = await api<Project>(`/projects/${project.id}/settings`, { freshness_seconds: project.freshness_seconds, high_limit: project.high_limit, cable_description: project.cable_description, monitoring: { ...draft, email_to: draft.email_to?.trim() || null } }, "PUT");
      setDraft(copy(saved.monitoring));
      setMessage("Monitoring settings saved.");
    } catch (error) { setFailed(true); setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  const deliveryReady = emailConfigured && (draft.email_to || defaultRecipientConfigured);
  return (
    <Card className="gap-6" aria-label="Project monitoring settings" role="region">
      <CardHeader className="monitoring-heading flex flex-wrap items-end justify-between gap-4">
        <div><CardTitle><h2 className="text-lg">Project monitoring</h2></CardTitle><CardDescription>Rules apply to live device data. New projects start with silence monitoring and no threshold limits.</CardDescription></div>
        <FormField id="monitoring-project" label="Project"><OptionSelect id="monitoring-project" value={selectedId} className="sm:w-64" onValueChange={(value) => { const next = states.find((state) => state.project.id === value); if (next) { setSelectedId(next.project.id); setDraft(copy(next.project.monitoring)); setMessage(""); } }} options={states.map((state) => ({ value: state.project.id, label: state.project.name }))} /></FormField>
      </CardHeader>
      <form onSubmit={save} className="grid gap-6 px-6">
        <Block icon={<Bell />} title="Alerts" description="Silence is checked per device after its first valid reading.">
          <FormField id="silence" label="Alert after device silence" hint={`Seconds; at least the project's ${project.freshness_seconds}s freshness limit.`} className="max-w-xs"><Input id="silence" type="number" min={project.freshness_seconds} max="86400" required value={draft.silence_seconds} onChange={(event) => change({ silence_seconds: Number(event.target.value) })} /></FormField>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><strong className="block text-sm font-medium">Optional threshold rules</strong><small className="text-xs text-muted-foreground">Only numeric fields can use limits. No rule means no threshold alert.</small></div>
            <Button type="button" variant="outline" size="sm" onClick={addRule} disabled={!numericFields.length || draft.threshold_rules.length >= numericFields.length * 2}><Plus />Add limit</Button>
          </div>
          {draft.threshold_rules.map((rule, index) => (
            <div key={`${index}-${rule.field_key}-${rule.direction}`} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <FormField id={`rule-${index}-field`} label="Field"><OptionSelect id={`rule-${index}-field`} value={rule.field_key} onValueChange={(value) => editRule(index, { field_key: value })} options={numericFields.map(([key, field]) => ({ value: key, label: `${field.label} (${field.unit || key})` }))} /></FormField>
              <FormField id={`rule-${index}-direction`} label="When"><OptionSelect id={`rule-${index}-direction`} value={rule.direction} onValueChange={(value) => editRule(index, { direction: value as ThresholdRule["direction"] })} options={[{ value: "above", label: "Above" }, { value: "below", label: "Below" }]} /></FormField>
              <FormField id={`rule-${index}-limit`} label="Limit"><Input id={`rule-${index}-limit`} type="number" step="any" required value={Number.isNaN(rule.limit) ? "" : rule.limit} onChange={(event) => editRule(index, { limit: event.target.value === "" ? Number.NaN : Number(event.target.value) })} /></FormField>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove limit ${index + 1}`} onClick={() => change({ threshold_rules: draft.threshold_rules.filter((_, current) => current !== index) })}><Trash2 /></Button>
            </div>
          ))}
          {!draft.threshold_rules.length && <p className="text-sm text-muted-foreground">No threshold alerts for this project.</p>}
        </Block>
        <Separator />
        <Block icon={<Clock3 />} title="Scheduled summaries" description="One live-session summary is saved in Win and Events each interval.">
          <SwitchRow id="summary-enabled" checked={draft.summary_enabled} onCheckedChange={(checked) => change({ summary_enabled: checked })}>Create summaries automatically</SwitchRow>
          <FormField id="summary-interval" label="Every" hint="Any whole number from 1 to 1,440. Changing this starts a new interval." className="max-w-xs">
            <div className="flex items-center gap-2"><Input id="summary-interval" type="number" min="1" max="1440" step="1" required value={draft.summary_interval_minutes} onChange={(event) => change({ summary_interval_minutes: Number(event.target.value) })} /><span className="text-sm text-muted-foreground">minutes</span></div>
          </FormField>
        </Block>
        <Separator />
        <Block icon={<Mail />} title="Email delivery" description="Alerts and summaries use the same configured recipient.">
          <FormField id="email-to" label="Recipient email" hint="Leave empty to use the server default recipient, if configured." className="max-w-md"><Input id="email-to" type="email" value={draft.email_to ?? ""} onChange={(event) => change({ email_to: event.target.value || null })} placeholder={defaultRecipientConfigured ? "Using server default" : "operator@example.com"} /></FormField>
          <div className="grid gap-3">
            <SwitchRow id="alert-email" checked={draft.alert_email_enabled} onCheckedChange={(checked) => change({ alert_email_enabled: checked })}>Email new alerts</SwitchRow>
            <SwitchRow id="summary-email" checked={draft.summary_email_enabled} onCheckedChange={(checked) => change({ summary_email_enabled: checked })}>Email each summary</SwitchRow>
          </div>
          <p className={cn("rounded-lg px-3 py-2 text-sm", deliveryReady ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning")}>{!emailConfigured ? "Email is not ready: configure SMTP in the backend .env file." : draft.email_to || defaultRecipientConfigured ? "SMTP sender and recipient are configured." : "Add a recipient here or set a server default to send email."}</p>
        </Block>
        <div className="monitoring-actions flex flex-wrap items-center justify-end gap-3 border-t py-4">
          <p role="status" className={cn("mr-auto text-sm", failed ? "text-destructive" : "text-muted-foreground")}>{message}</p>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save monitoring settings"}</Button>
        </div>
      </form>
    </Card>
  );
}
```
Note: the test asserts `getByLabel("Every")` has value "10". "Every" is now the `<Label>` of the input, and "minutes" is outside it.

- [ ] **Step 3: Rewrite `src/features/settings/GlobalSettings.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { StatusBadge } from "@/components/StatusBadge";
import type { ServiceHealth } from "@/app/types";
import { ThemeSwitcher } from "@/theme";
import type { State } from "@/types";
import { api, strings } from "@/types";
import { ProjectMonitoringSettings } from "./MonitoringSettings";

export function GlobalSettings({ states }: { states: State[] }) {
  const [health, setHealth] = useState<ServiceHealth | null>(null);
  useEffect(() => { api<ServiceHealth>("/health").then(setHealth).catch(() => {}); }, []);
  const rows: [string, React.ReactNode][] = [
    ["MQTT broker", <StatusBadge tone={health?.mqtt ? "success" : "warning"}>{health?.mqtt ? "Connected" : "Disconnected"}</StatusBadge>],
    ["AI provider", health?.agent_configured ? "Configured · request needed to verify availability" : strings.unavailable],
    ["Rejected MQTT messages", health?.mqtt_rejections ?? "—"],
  ];
  return (
    <Page className="max-w-5xl">
      <PageHeading eyebrow="Workspace configuration" title="Settings" description="Configure live alerts, Win summaries, and email delivery for each project." />
      <ProjectMonitoringSettings states={states} emailConfigured={health?.email_configured ?? false} defaultRecipientConfigured={health?.email_default_recipient_configured ?? false} />
      <Card className="flex-row flex-wrap items-center justify-between gap-4 p-6">
        <div><h2 className="text-lg font-semibold">Appearance</h2><p className="text-sm text-muted-foreground">Choose a theme, or follow your device. Your preference is saved in this browser.</p></div>
        <ThemeSwitcher />
      </Card>
      <Card>
        <CardHeader><CardTitle><h2 className="text-lg">Service availability</h2></CardTitle><CardDescription>Current backend integrations.</CardDescription></CardHeader>
        <div className="grid gap-4 px-6">
          <div className="divide-y rounded-lg border">
            {rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>)}
          </div>
          <h3 className="font-semibold">Setup notes</h3>
          <div className="grid gap-2 text-sm text-muted-foreground">
            <p>Configure provider and SMTP credentials in the backend .env file. Device identity, field mapping, and inventory are defined when a project is created.</p>
            <p>The MVP binds to loopback. See docs/hardware.md before connecting a device or exposing the broker to a private network.</p>
            <p>RF calibration, trained anomaly models, and behavioral simulation are unavailable. Physical control is limited to declared capabilities.</p>
          </div>
        </div>
      </Card>
    </Page>
  );
}
```
The `ui-review.mjs` theme check waits for heading "Appearance" and clicks `getByRole("button", { name: "Dark theme" }).last()`. Both still resolve.

- [ ] **Step 4: Checks, prune, verify, commit**

```bash
npm run lint && npm run typecheck && npm run build
node scripts/legacy-css.mjs prune-unused
node scripts/legacy-css.mjs prune monitoring-heading monitoring-actions monitoring-settings appearance-settings settings-content measurement
npm run build
```
Run `node tests/monitoring-ui.mjs` (Task 0 env vars, plus `AGENTWIN_OTHER_PROJECT_ID` pointing at a second disposable project) and `npm run test:ui`. Expected: PASS. Compare the settings screenshots, including `monitoring-settings-mobile-review.png` for overflow, then commit:
```bash
git add -A src tests/monitoring-ui.mjs
git commit -m "feat(ui): migrate settings and monitoring forms to shadcn Select, Switch, and Input

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Global events page

**Files:**
- Rewrite: `src/features/events/GlobalEvents.tsx`

- [ ] **Step 1: Rewrite**

The heading "Events across your systems.", the heading "Recent summaries" and the text "No recorded alerts." are asserted by `monitoring-ui.mjs`.
```tsx
import { Link } from "react-router-dom";
import { ArrowRight, Bell } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Page } from "@/components/Page";
import { PageHeading } from "@/components/PageHeading";
import { StatusBadge } from "@/components/StatusBadge";
import { emailStatus, summaryTime } from "@/lib/format";
import type { State } from "@/types";
import { time } from "@/types";

export function GlobalEvents({ states }: { states: State[] }) {
  return (
    <Page className="max-w-5xl">
      <PageHeading eyebrow="Evidence and recovery" title="Events across your systems." description="Live-session alerts and scheduled project summaries." />
      {states.map((s) => (
        <Card key={s.project.id} className="gap-0 py-0">
          <CardHeader className="flex items-center justify-between border-b py-4">
            <CardTitle><h2 className="text-base">{s.project.name}</h2></CardTitle>
            <Link className="inline-flex items-center gap-1 text-sm text-brand hover:underline" to={"/projects/" + s.project.id + "?tab=events"}>Investigate<ArrowRight className="size-3.5" /></Link>
          </CardHeader>
          {s.events.length ? s.events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 border-b px-6 py-3 last:border-b-0">
              <Bell className="size-4 text-warning" />
              <div className="min-w-0 flex-1">
                <strong className="block text-sm font-medium">{e.evidence.rule}</strong>
                <small className="text-xs text-muted-foreground">{time(e.created)} · {e.acknowledged ? "Acknowledged" : "Not acknowledged"} · Email {emailStatus(e.email_status, s.project.monitoring.alert_email_enabled)}</small>
              </div>
              <StatusBadge tone={e.recovered ? "success" : "warning"}>{e.recovered ? "Recovered" : "Open"}</StatusBadge>
            </div>
          )) : <p className="px-6 py-4 text-sm text-muted-foreground">No recorded alerts.</p>}
          {s.summaries?.length > 0 && (
            <div className="grid gap-2 border-t bg-muted/40 px-6 py-4">
              <h3 className="text-sm font-semibold">Recent summaries</h3>
              {s.summaries.slice(0, 3).map((summary) => <div key={summary.id} className="grid gap-0.5 sm:grid-cols-[180px_1fr]"><span className="text-xs text-muted-foreground">{summaryTime(summary.period_end)}</span><p className="text-sm">{summary.body}</p></div>)}
            </div>
          )}
        </Card>
      ))}
    </Page>
  );
}
```

- [ ] **Step 2: Checks, prune, verify, commit**

```bash
npm run lint && npm run typecheck && npm run build
node scripts/legacy-css.mjs prune-unused
npm run build
```
Run `node tests/monitoring-ui.mjs` and `npm run test:ui`. Compare the events screenshots, then commit:
```bash
git add -A src
git commit -m "feat(ui): migrate global events page to shadcn Card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Digital Twin chrome

The SVG, canvas and React Flow internals are untouched. Only the header, view switch, status bar, zoom controls, inspector, activity and legend change.

**Files:**
- Modify: `src/features/digital-twin/DigitalTwin.tsx`, `src/features/digital-twin/TwinInspector.tsx`, `src/features/digital-twin/view2d/PhysicalTwin.tsx:72`, `src/features/digital-twin/view2d/DataFlowTwin.tsx:36`, `src/features/digital-twin/live-twin.css`

- [ ] **Step 1: Zoom controls in `PhysicalTwin.tsx` and `DataFlowTwin.tsx`**

Add `import { Button } from "@/components/ui/button";` to both files. Replace the `twin-zoom-controls` line in each; keep each file's existing `aria-label` for the group ("Physical view controls" or "Data Flow controls"):
```tsx
    <div className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-lg border bg-glass p-1 shadow-elevated backdrop-blur" role="group" aria-label="Physical view controls">
      <Button variant="ghost" size="icon" className="size-8" onClick={() => viewport.zoomAt(.82)} aria-label="Zoom in"><Plus /></Button>
      <Button variant="ghost" size="icon" className="size-8" onClick={() => viewport.zoomAt(1.22)} aria-label="Zoom out"><Minus /></Button>
      <Button variant="ghost" size="icon" className="size-8" onClick={viewport.fit} aria-label="Fit view"><Focus /></Button>
      <Button variant="ghost" size="icon" className="size-8" onClick={viewport.reset} aria-label="Reset view"><RotateCcw /></Button>
    </div>
```
Check that the parent of this group is positioned. Before this change, `.twin-zoom-controls` set `position: absolute`. Grep `live-twin.css` for the view container (`.physical-view, .flow-view`) and confirm it has `position: relative`. If not, add `relative` to that container's `className` in the TSX.

- [ ] **Step 2: `DigitalTwin.tsx` header, status bar, stage chrome, activity and legend**

Replace the manual pill/tab code: remove the `bar` and `pill` refs and the two `useEffect`s that move the pill (current lines 30-31 and 35-52). Add imports:
```tsx
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { SlidingTabsList } from "@/components/SlidingTabs";
import { cn } from "@/lib/utils";
```
Replace the `if (!selected) return …` line with:
```tsx
  if (!selected) return <EmptyState icon={<Cable />} title="No configured Twin"><p>Add a device or component to create the operational representation.</p></EmptyState>;
```
Replace the returned JSX with the following. The stage, frame and canvas classes (`twin-view-frame`, `live-twin-stage`, `inspector-open`) stay, because `live-twin.css` lays out the canvas and inspector.
```tsx
  const freshnessLabel = twin.freshness === "fresh" || twin.freshness === "aging" ? "Reporting" : twin.freshness === "stale" ? "Stale" : "Data unavailable";
  const freshnessDot = twin.freshness === "fresh" || twin.freshness === "aging" ? "bg-success" : twin.freshness === "stale" ? "bg-warning" : "bg-muted-foreground";
  return <section className="live-twin-workspace grid gap-4">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <Badge variant="outline" className={cn("session-kicker", twin.sessionLabel.toLowerCase(), twin.sessionLabel === "Live" ? "border-success/40 text-success" : "border-warning-border text-warning")}>{twin.sessionLabel}</Badge>
        <h3 className="text-lg font-semibold">Digital Twin</h3>
        <p className="text-sm text-muted-foreground">Configured structure enriched with session-scoped observations.</p>
      </div>
      <Tabs value={view} onValueChange={(value) => setView(value as View)}>
        <SlidingTabsList value={view} aria-label="Digital Twin view" items={[["physical", "Physical 2D"], ["topology", "Topology"], ["flow", "Data Flow"]]} />
      </Tabs>
    </header>
    <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border bg-muted/40 px-4 py-2 text-xs text-muted-foreground [&_svg]:size-3.5" role="status" aria-live="polite">
      <span className="flex items-center gap-1.5 font-medium text-foreground"><i className={cn("size-2 rounded-full", freshnessDot)} />{freshnessLabel}</span>
      <span className="flex items-center gap-1.5"><Radio />{twin.reportingDevices}/{state.devices.length} devices reporting</span>
      <span className="flex items-center gap-1.5"><Activity />Last telemetry <time dateTime={twin.lastReceivedAt ? new Date(twin.lastReceivedAt * 1000).toISOString() : undefined} title={twin.lastReceivedAt ? new Date(twin.lastReceivedAt * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "long" }) : "No telemetry received"}>{age(twin.lastReceivedAt)}</time></span>
      <span className="flex items-center gap-1.5"><Cable />{state.session.mode} session · {time(state.session.created)}</span>
      <span className="flex items-center gap-1.5"><CircleAlert />{twin.openEvents} open events</span>
    </div>
    <div className={`twin-view-frame is-${view}`}>
      <div className={`live-twin-stage ${inspectorOpen ? "inspector-open" : ""}`}>
        <Suspense fallback={<EmptyState icon={<Activity />} title={`Loading ${view === "physical" ? "hardware" : view === "flow" ? "data paths" : "topology"}`}><p>Preparing the view.</p></EmptyState>}>
          {view === "physical" ? <PhysicalTwin twin={twin} selectedId={selected.id} onSelect={choose}/> : view === "flow" ? <DataFlowTwin twin={twin} selectedId={selected.id} onSelect={choose}/> : <TopologyTwin key={state.project.id} twin={twin} selectedId={selected.id} onSelect={choose}/>}
        </Suspense>
        <TwinInspector component={selected} state={state} refresh={refresh} open={inspectorOpen} onClose={() => setInspectorOpen(false)}/>
        {inspectorOpen && <button type="button" className="absolute inset-0 z-10 bg-backdrop lg:hidden" aria-label="Close component inspector" onClick={() => setInspectorOpen(false)}/>}
      </div>
    </div>
    <Card className="gap-3 p-4">
      <div className="flex items-center justify-between"><strong className="text-sm">Recent activity</strong><span className="text-xs text-muted-foreground">Selected session only</span></div>
      {activity.length ? <ol className="grid gap-1.5">{activity.map((item) => <li key={item.id} className="flex items-center gap-3 text-sm"><i className={cn("size-2 rounded-full", item.type === "Telemetry" ? "bg-operational" : item.type === "Command" ? "bg-brand" : "bg-warning")} /><span className="flex-1">{item.type}<small className="ml-2 text-xs text-muted-foreground">{item.label}</small></span><time className="text-xs text-muted-foreground">{time(item.at)}</time></li>)}</ol> : <p className="text-sm text-muted-foreground">No observations, commands, or events in this session.</p>}
    </Card>
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Relationship legend">{relationshipKinds.map((kind) => <span key={kind} className="flex items-center gap-1.5"><i className={cn("h-0.5 w-4 rounded-full", kind === "data" ? "bg-operational" : kind === "control" ? "bg-[var(--relationship-control)]" : kind === "power" ? "bg-[var(--relationship-power)]" : "bg-[var(--relationship-physical)]")} />{kind === "data" ? "Observed data" : kind === "control" ? "Command" : kind}</span>)}</div>
  </section>;
```
`useRef` may no longer be used in this file. Remove it from the `react` import if lint says so.

The "Close component inspector" backdrop is hidden at `lg` and up, which avoids a duplicate accessible name with the inspector's close button on desktop (see `twin-2d-review.mjs:44`). If the test runs at a width below `lg` with the inspector open, scope the test click to `getByRole('complementary', { name: 'Selected component details' }).getByRole('button', { name: 'Close component inspector' })`.

- [ ] **Step 3: `TwinInspector.tsx` internals**

Add imports:
```tsx
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
```
Add this helper above `TwinInspector`:
```tsx
function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-t py-2">
      <CollapsibleTrigger className="group flex w-full items-center justify-between py-1.5 text-sm font-semibold">{title}<ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" /></CollapsibleTrigger>
      <CollapsibleContent className="grid gap-2 pt-1 text-sm">{children}</CollapsibleContent>
    </Collapsible>
  );
}
```
Then make these changes in the returned JSX:
- `<details open><summary>State</summary><div className="inspector-content">…</div></details>` becomes `<Section title="State" defaultOpen>…</Section>`. Do the same for "Evidence" (`defaultOpen`), "Relationships", "Configuration" and "Events & actions" (`defaultOpen`). Keep the inner children, and drop the wrapping `inspector-content` divs. For the Evidence section, keep `evidence-list` semantics as `<div className="grid gap-2">`.
- The close button becomes:
  ```tsx
  <Button type="button" variant="ghost" size="icon" className="absolute top-3 right-3" onClick={onClose} aria-label="Close component inspector"><X /></Button>
  ```
- The header becomes:
  ```tsx
  <header className="space-y-1 pr-10"><span className="text-xs tracking-wide text-brand uppercase">{component.type}</span><h3 className="text-lg font-semibold">{component.label}</h3><p className="text-sm text-muted-foreground">{component.source.description || "Configured component."}</p></header>
  ```
- The control buttons become:
  ```tsx
  <div className="flex gap-2"><Button size="sm" disabled={busy || !controlReady(state, state.project, control.expected.field)} onClick={() => run(control.action, true)}>Turn on</Button><Button size="sm" variant="secondary" disabled={busy || !controlReady(state, state.project, control.expected.field)} onClick={() => run(control.action, false)}>Turn off</Button></div>
  ```
- Every `<div className="detail-relation" …><span>{a}</span><strong>{b}</strong></div>` becomes `<div className="flex items-start justify-between gap-3" …><span className="text-muted-foreground">{a}</span><strong className="text-right font-medium">{b}</strong></div>`. Keep the `key` props.
- `<p className="detail-empty">` becomes `<p className="text-muted-foreground">`. `<p className="error" role="alert">` becomes `<p className="text-destructive" role="alert">`. `<p className="inspector-footnote">` becomes `<p className="border-t pt-3 text-xs text-muted-foreground">`.
- The root `<aside>` becomes:
  ```tsx
  <aside className="live-twin-inspector relative flex flex-col gap-2 overflow-y-auto rounded-xl border bg-card p-4 shadow-elevated data-[open=true]:animate-in data-[open=true]:fade-in data-[open=true]:slide-in-from-right-4 data-[open=true]:duration-[var(--duration-fast)]" data-open={open ? "true" : "false"} aria-label="Selected component details">
  ```
  `t-panel-slide` is dropped. `live-twin-inspector` is kept because `live-twin.css` positions it inside the stage.

- [ ] **Step 4: Prune twin chrome CSS and re-layer `live-twin.css`**

```bash
node scripts/legacy-css.mjs prune t-tabs t-tab t-tabs-pill t-panel-slide live-twin-header session-kicker twin-view-switch twin-status-bar twin-health twin-zoom-controls inspector-close inspector-heading inspector-footnote inspector-content inspector-metric inspector-backdrop twin-activity twin-legend detail-relation detail-empty evidence-list operational-callout
node scripts/legacy-css.mjs prune-unused
```
Then open `src/features/digital-twin/live-twin.css`:
- Change the first line `@layer legacy {` to `@layer components {`. Only canvas/SVG/stage layout rules remain, and they must beat preflight without the legacy guard.
- Delete any remaining rules on `.live-twin-inspector details` or `summary` (grep for them).

- [ ] **Step 5: Checks, verify, commit**

```bash
npm run lint && npm run typecheck && npm run build
```
Run `node tests/twin-2d-review.mjs`, `npm run smoke` (Twin component selection and topology) and `npm run test:ui`. Expected: results match the baseline. Compare `twin-flow-review.png` and the Twin screenshots at 390, 1024 and 1440 in both themes, then commit:
```bash
git add -A src
git commit -m "feat(ui): migrate Digital Twin chrome to shadcn Tabs, Button, Badge, and Collapsible

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Remove legacy CSS and finish

**Files:**
- Delete: `src/ui.tsx`, `src/styles.css`, `src/modern.css`, `src/motion.css`, `scripts/legacy-css.mjs`
- Modify: `src/index.css`, `package.json` (remove `postcss` devDependency if unused), `eslint.config.js`, `docs/frontend-modernization.md`

- [ ] **Step 1: Confirm nothing still depends on legacy markup**

```bash
node scripts/legacy-css.mjs unused
```
Then grep for legacy-only class names still in TSX:
```bash
grep -rnE "className=\"(button|primary|secondary-button|tertiary|ghost|panel|empty|error|quiet|chart-empty|section-heading|page-heading)\b" src --include=*.tsx
grep -rnE "<(button|input|select|textarea)\b" src --include=*.tsx | grep -v "src/components/ui/"
```
Expected for the second grep: only these intentional native buttons:
- the event-select button in `Events.tsx`
- the resizer and backdrop buttons in `Workspace.tsx`
- the inspector backdrop in `DigitalTwin.tsx`
- anything inside the twin SVG/React Flow internals (untouched)

Convert any other hits to shadcn components before continuing.

- [ ] **Step 2: Delete the legacy files**

```bash
git rm src/ui.tsx src/styles.css src/modern.css src/motion.css
```

- [ ] **Step 3: Remove the legacy layer from `src/index.css`**

Delete these lines:
```css
@import "./motion.css" layer(legacy);
@import "./styles.css" layer(legacy);
@import "./modern.css" layer(legacy);
```
and the whole guard block:
```css
/* shadcn elements carry data-slot; roll back every legacy declaration on them to Tailwind's base layer. */
@layer legacy {
  [data-slot][data-slot][data-slot] {
    all: revert-layer;
  }
}
```
Change the first line to:
```css
@layer theme, base, components, utilities;
```

- [ ] **Step 4: Remove the helper script and its dependency**

```bash
git rm scripts/legacy-css.mjs
npm uninstall postcss
```
Put `eslint.config.js` `ignores` back to `["dist", "tests"]`. Only do this if `scripts/` now contains nothing but `render-email-logo.mjs` and that file was never linted before. Otherwise leave `"scripts"` ignored.

- [ ] **Step 5: Build and check for regressions caused by the deletion**

```bash
npm run lint && npm run typecheck && npm run build
```
Run the full suite:
- `npm run smoke`
- `npm run test:ui`
- `npm run test:operations`
- `node tests/project-actions-layout.mjs`
- `node tests/twin-state.mjs`
- `node tests/twin-2d-review.mjs`
- `node tests/monitoring-ui.mjs`

Compare every screenshot in `artifacts/ui-review/` against `artifacts/ui-review-before/`. Anything that relied on a legacy rule that is now gone shows up here. Fix it with utilities in the owning component. Common spots: `main.page` vertical rhythm, heading sizes, link colors, and `.react-flow` minimap/controls theming (grep the deleted `modern.css` in git history for `react-flow` and port those color rules into `live-twin.css` under `@layer components` if the minimap or controls lost their theme).

- [ ] **Step 6: Verify the done criteria**

```bash
grep -rnE "<(button|input|select|textarea)\b" src --include=*.tsx | grep -v "src/components/ui/"
ls src/*.css
wc -l src/app/*.tsx src/main.tsx
```
Expected:
- The first grep shows only the intentional native buttons listed in Step 1.
- `src/*.css` contains only `index.css` and `tokens.css`.
- `main.tsx` is under 20 lines.

- [ ] **Step 7: Update `docs/frontend-modernization.md`**

Add a new section at the top, above "## Scope and architecture":
```markdown
## shadcn/ui migration (2026-09)

The frontend now uses shadcn/ui (Radix, `radix-nova` style) on Tailwind CSS v4. `src/index.css` bridges shadcn's theme tokens onto the unchanged palette in `src/tokens.css`, so dark, light and system themes look the same as before. Dark mode keys off the existing `data-theme` attribute via `@custom-variant dark`. The legacy stylesheets (`styles.css`, `modern.css`, `motion.css`) and the hand-built `Dialog`/`Tabs` in `ui.tsx` were removed. `main.tsx` was split into `src/app/` (shell) and `src/features/*` (pages). Shared building blocks live in `src/components/`, and generated shadcn components in `src/components/ui/`.

Test hooks: Radix `Select` replaces native `<select>`. Triggers and options carry `data-value`, and `tests/helpers.mjs` exposes `chooseValue(page, trigger, value)`. The delete confirmation is an `AlertDialog` (role `alertdialog`). `tests/project-actions-layout.mjs` now checks the live project page instead of static HTML.
```
In the existing "Implementation" table, change the `frontend/src/ui.tsx`, `frontend/src/motion.css` and `frontend/src/styles.css`, `frontend/src/modern.css` rows to note they were superseded by the shadcn migration. Don't delete the rows.

- [ ] **Step 8: Commit**

```bash
git add -A frontend docs/frontend-modernization.md
git commit -m "refactor(ui): remove legacy CSS and hand-built primitives after shadcn migration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Push the branch**

```bash
git push
```

---

## Spec coverage map

| Spec requirement | Task |
|---|---|
| Tailwind v4, shadcn init, Radix base, `@/` alias, `cn()` | 1 |
| Token bridge to existing palette; `data-theme` dark variant; fonts | 1 |
| Legacy CSS in a layer during migration, pruned as areas migrate | 1 (layer, guard, script), 4-13 (prune), 14 (delete) |
| Split `main.tsx` into `app/`, `features/*`, `components/`; delete `Legacy*` | 3 |
| Component mapping (Sidebar, Dialog/AlertDialog, Tabs, Command, DropdownMenu/Popover, Button, Input/Textarea/Label, Select, Switch, Badge, Card, charts, Tooltip, theme toggle, Alert, ScrollArea) | 2, 4-13 |
| Theme switcher | 5 (shadcn `Toggle` buttons instead of `ToggleGroup`, so tests keep `role=button` + `aria-pressed`) |
| Test-selector compatibility, Select test rewrites | 0, 4 (helpers), 5, 7, 8, 11 |
| Motion: dialog/sheet animations, sliding tab indicator, panel reveal, reduced motion | 1 (reduced-motion base), 4 (indicator), 8, 9, 13 |
| Responsiveness 360-1920, no overflow | 5-13 (verified by `test:ui`) |
| Accessibility (focus, Escape, ARIA, skip link, focus rings) | 5, 8 (Radix + preserved names) |
| Verification per commit and at milestones; screenshot parity | every task; 0 (baseline) |
| Done criteria; docs updated | 14 |

**Deviations from the spec, recorded here:**
- Spec §1 says legacy CSS is "declared before Tailwind's layers". The layer actually sits between `base` and `components`, because below `base` the preflight would override legacy element styles.
- Spec §2 lists `ToggleGroup` for the theme switcher. The plan uses `Toggle` buttons so that the tested `role=button`/`aria-pressed` contract holds.
- `Table` and `Skeleton` are generated in Task 2, but no current screen has tabular data or loading placeholders that warrant them. The event and reading lists are row lists, which the spec allows ("`Table` where tabular; otherwise Tailwind list"). Remove them in Task 14 if they're still unused: `git rm src/components/ui/table.tsx src/components/ui/skeleton.tsx`.
