# shadcn/ui migration — design

Date: 2026-09-25
Branch: `feature/shadcn-ui`

## Goal

Fully migrate the Agentwin frontend (`frontend/`) from hand-rolled components and plain CSS (`styles.css` ~2.8k lines, `modern.css` ~2.2k lines, `motion.css`) to shadcn/ui components on Tailwind CSS v4, while **preserving the current visual identity** (matte-black dark theme, neutral light theme, purple `#7546C0` accent, DM Sans / Manrope, Dark/Light/System switcher). The code changes; the look stays.

## Decisions

- Scope: full migration — primitives, layouts, cards, sidebar, lists, charts chrome.
- Look: map shadcn theme variables onto the existing palette; no stock shadcn theme.
- Dropdowns: shadcn `Select` (Radix) everywhere; tests updated accordingly.
- Approach: incremental, area by area, on the live app; `main.tsx` split into feature files as part of the migration. Each commit leaves the app working.

## 1. Foundation and structure

**Tooling:** add `tailwindcss` v4, `@tailwindcss/vite`, `tw-animate-css`, `class-variance-authority`, `clsx`, `tailwind-merge`. Run `shadcn init` (Vite, Radix base, lucide icons). Add the `@/*` → `src/*` alias to `tsconfig.json` and `vite.config.ts`. shadcn components live in `src/components/ui/`; `cn()` in `src/lib/utils.ts`.

**Theme bridge:** new `src/index.css`:
- `@import "tailwindcss"` and `tw-animate-css`.
- `@theme inline` maps shadcn tokens to the existing variables in `tokens.css`: `--background`→`--bg-page`, `--card`→`--bg-card`, `--popover`, `--muted`, `--accent`, `--primary`→`--primary` (`#7546C0`), `--primary-foreground`, `--destructive`→`--status-error`, `--border`→`--border-color`, `--input`, `--ring`→primary, `--radius: 10px`, sidebar tokens, `--chart-1..5` (cyan `--operational-cyan` first), fonts (DM Sans body, Manrope headings).
- Dark variant: `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` so the existing `ThemeProvider` (`theme.tsx`), `data-theme` attribute and pre-render script in `index.html` remain unchanged.

**Legacy CSS during migration:** `styles.css`, `modern.css`, `motion.css` are imported into `@layer legacy`, declared before Tailwind's layers, so utilities win. Rules are deleted as each area migrates.

**File structure** (split out of the 1,391-line `main.tsx`):

```
src/
  main.tsx                root, router, providers only
  app/AppShell.tsx        sidebar, topbar, command launcher, system status
  features/overview/      Overview, PlatformAnalytics, Stat
  features/projects/      AddProject, project list
  features/workspace/     Workspace, ProjectOverview, Readings, Controls, Events
  features/agent/         AgentPanel, WinAvatar
  features/settings/      GlobalSettings, MonitoringSettings
  features/events/        GlobalEvents
  features/digital-twin/  existing; chrome only
  components/ui/          shadcn components
  components/             shared app parts (StatusBadge, CompactId, ProjectId, Mark)
```

`ui.tsx`, `LegacyProjectOverview` and `LegacyAddProject` are deleted.

## 2. Component mapping

| Current | shadcn replacement |
|---|---|
| Sidebar rail + mobile nav dialog | `Sidebar` (`SidebarProvider`, `collapsible="icon"`; `Sheet` on mobile) |
| `ui.tsx` `Dialog` | `Dialog`; destructive confirmations use `AlertDialog` |
| `ui.tsx` `Tabs` | `Tabs` + custom sliding indicator (section 3) |
| `CommandLauncher` | `CommandDialog` + `Command` |
| `SystemSwitcher`, `SystemStatus` | `DropdownMenu`, `Popover` |
| raw `<button>` | `Button` (`default`, `secondary`, `ghost`, `outline`, `destructive`; `icon` sizes) |
| `<input>`, `<textarea>`, labels | `Input`, `Textarea`, `Label` |
| `<select>` | `Select` |
| checkbox/toggle inputs | `Switch` / `Checkbox` |
| status `Badge` | shadcn `Badge` + CVA variants `success`, `warning`, `danger` |
| panels, stat tiles, project cards | `Card` family |
| event lists, reading rows | `Table` where tabular; otherwise Tailwind list in `ScrollArea` |
| Recharts charts | wrapped in `ChartContainer` + `ChartTooltip` using `--chart-*` |
| copy-ID / icon hints | `Tooltip` |
| `ThemeSwitcher` | `ToggleGroup` (logic in `theme.tsx` unchanged) |
| loading states | `Skeleton` |
| agent / request errors | `Alert` |

React Flow, the Three.js canvas and twin SVG internals are not replaced; only their surrounding chrome (toolbars, buttons, source picker, inspector) migrates. `live-twin.css` stays for canvas-scoped styling.

**Test-selector compatibility:** class names used by Playwright tests (`.sidebar`, `.source-picker`, `.monitoring-heading`, `.flow-node`, `.control-card .badge`, `.event-item .badge`, `.control-state`, `.session-kicker.simulation`, `.topbar-search-trigger`, `main.page`, `.tab-content`, `.workspace-grid > .workspace-agent`, `.workspace-main .agent-mini`, `.transition-list`, `.source-note`, `.twin2d-caption`, etc.) are kept on the migrated elements as unstyled hook classes. Tests that operate native `select`/`option` are rewritten to `getByRole('combobox')` → `getByRole('option')`.

## 3. Motion, responsiveness, accessibility

**Motion:**
- Dialog/Sheet: `data-[state=open]:animate-in` / `data-[state=closed]:animate-out` fade+zoom using `--duration-quick`, `--duration-fast`, `--ease-smooth-out`; closing faster than opening.
- Tabs: sliding pill kept as an absolutely positioned indicator inside `TabsList`, positioned by a `useTabIndicator` hook (measure active trigger, `ResizeObserver`, no animation on first paint). Radix supplies roving focus and arrow/Home/End keys, replacing the manual handler.
- Inspector/panel reveal: `animate-in fade-in slide-in-from-*`.
- Sidebar collapse: shadcn built-in width transition. Theme crossfade in `theme.tsx` unchanged.
- Reduced motion: `motion-reduce:` variants plus a global `prefers-reduced-motion` rule in `index.css`. Telemetry values and chart updates never animate.

**Responsiveness:** Tailwind breakpoints covering the tested widths 360–1920. Workspace panels stack below `lg`; Twin inspector moves below the canvas; forms collapse to one column below `md`; tabs scroll horizontally in `ScrollArea`; no document-level horizontal overflow.

**Accessibility:** Radix focus trap/restore, Escape and backdrop dismissal, ARIA roles. Keep the skip link, visible focus rings (`--ring`), `aria-label` on icon buttons, tab ↔ panel associations.

## 4. Migration order and verification

Commits (each leaves the app working):

1. Foundation — Tailwind, shadcn init, token bridge, legacy layer, alias, `cn`. No visual change.
2. Split `main.tsx` into feature files — pure move, no behavior/style change; delete `Legacy*` components.
3. App shell — Sidebar, topbar, CommandDialog, system status, theme toggle.
4. Overview and platform analytics — Cards, stats, charts.
5. Projects — list, AddProject (six-stage creation flow), delete `AlertDialog`.
6. Workspace — Tabs + indicator, ProjectOverview, Readings, Controls, Events.
7. Agent panel.
8. Settings and monitoring settings — Selects, Switches, forms.
9. Global events.
10. Digital twin chrome — toolbar, source picker, inspector.
11. Cleanup — delete `ui.tsx`, `motion.css`, remaining legacy CSS and the legacy layer; update `docs/frontend-modernization.md`.

**Every commit:** `npm run lint`, `npm run typecheck`, `npm run build`.

**Area milestones and final:** Playwright suites `smoke`, `test:ui` (10 views × 2 themes × 8 widths), `test:operations`, `monitoring-ui`, `twin-2d-review`, `project-actions-layout`, run against the isolated backend + MQTT fixture per `docs/frontend-modernization.md`. Before/after screenshots compared for visual parity.

**Error handling:** behavior unchanged — agent/request errors displayed via `Alert`, deletion behind explicit confirmation, command completion determined by backend evidence. `types.ts` API, subscription and state logic untouched.

## Done criteria

- No raw `<button>`, `<input>`, `<select>`, `<textarea>` outside `src/components/ui/`.
- `styles.css`, `modern.css`, `motion.css` and `ui.tsx` deleted; remaining CSS is `tokens.css`, `index.css`, `live-twin.css`.
- `main.tsx` contains only root/router/providers.
- Lint, typecheck, build and all Playwright suites pass.
- Both themes visually match the current app.
- `docs/frontend-modernization.md` updated.

## Out of scope

Backend, gateway, firmware or schema changes; bundle splitting; the pre-existing uncommitted backend/Docker changes on the working tree (not committed on this branch).
