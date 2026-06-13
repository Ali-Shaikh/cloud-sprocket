# CloudSprocket UI Rebuild — Modular Implementation Plan

_Decision locked (2026-06-09): **Replace Cloudscape**. Theme **follows OS** with manual override._

## Confirmed stack
- **Tailwind CSS v4.1** + official `@tailwindcss/vite` plugin (no PostCSS, no `tailwind.config.js`;
  tokens live in CSS via `@theme`). Compatible with Vite 8 / React 19.
- **shadcn/ui** (new-york style, OKLCH tokens, `data-slot` primitives) — copy-in components, no
  lock-in. Full React 19 + Tailwind v4 support; unified Radix UI package.
- **lucide-react** icons, **sonner** toasts (replaces Cloudscape `Flashbar`), `clsx` + `tailwind-merge` (`cn()`).
- Unchanged: Tauri v2, Go sidecar, all `backendRequest` RPC contracts. **No backend changes.**

## Cloudscape footprint to remove (scoped)
`@cloudscape-design/*` appears in 6 files / 10 refs:
- `apps/desktop/src/main.tsx:1` — `global-styles/index.css` import
- `apps/desktop/src/App.tsx` — shell + components (2)
- `apps/desktop/src/views/SessionSetupView.tsx` (2)
- `apps/desktop/src/views/WorkspaceView.tsx` (2)
- `apps/desktop/src/views/shared.tsx` (2)
- `apps/desktop/vite.config.ts:13` — `manualChunks` "cloudscape" split
Plus `apps/desktop/src/styles.css` (1064 L) hand-rolled shell CSS, and the `@cloudscape-design/*`
+ `global-styles` deps in `package.json`.

## Migration principle
**The app stays runnable after every module.** During migration, Cloudscape and Tailwind
coexist; we swap the shell first (Module 2), then migrate one view at a time behind it. A view
not yet migrated still renders its Cloudscape version. Cloudscape is deleted only in Module 8.

---

## Module map

Legend — **Dep**: prerequisite modules · **New RPC**: none anywhere · **Size**: rough effort.

### M0 — Tooling & theme foundation  ·  Dep: none  ·  Size: S
Stand up the new styling pipeline alongside Cloudscape without breaking the build.
- Add deps: `tailwindcss @tailwindcss/vite clsx tailwind-merge lucide-react sonner`.
- `vite.config.ts`: add `tailwindcss()` plugin (keep Cloudscape chunk for now).
- New `src/styles/theme.css`: `@import "tailwindcss";` + `@theme` tokens (map prototype palette
  → OKLCH), light/dark via `@media (prefers-color-scheme)` and `[data-theme]` override.
- `src/lib/cn.ts` (`cn()` helper). `src/lib/theme.tsx` — `ThemeProvider`: resolves
  `system | light | dark`, sets `data-theme` on `<html>`, persists to `localStorage` (later to
  app settings RPC).
- Init shadcn (`components.json`, new-york, base color). Create `src/components/ui/`.
- **Acceptance:** a throwaway Tailwind component renders correctly in light & dark; OS theme
  switch flips the page; existing Cloudscape screens still work; `tsc` + tests green.

### M1 — Primitive kit  ·  Dep: M0  ·  Size: M
The reusable component layer the whole app builds on.
- shadcn primitives: Button, Input, Textarea, Badge, Card, Table, Dialog (replaces `Modal`),
  DropdownMenu, Tooltip, Tabs, ScrollArea, Sheet (drawer), Skeleton, Separator, Avatar, Switch, Select.
- App atoms in `src/components/`: `StatusDot`, `StatusPill`, `ProviderIcon` (reuse existing
  `assets/cloud-icons/*`), `StatCard`, `EmptyState`, `SectionHeader`, `CodeBlock`, `LogStream`.
- A dev-only gallery route/page rendering every primitive in both themes.
- **Acceptance:** gallery renders all primitives, light+dark, keyboard-focusable.

### M2 — App shell (rail + nav + topbar)  ·  Dep: M1  ·  Size: M
Replace `AppSidebar` + `styles.css` shell with the three-zone layout from the prototype.
- New `src/components/shell/`: `AppShell`, `ConnectionRail`, `ContextNav`, `TopBar`, `ActivityDrawer`.
- Derive rail items from `providers` + `session`; nav from `session.workspaceTabs` + static items
  (Overview, Local Runtime, Debug). Reuse handlers already in `App.tsx`.
- Topbar: breadcrumb, search field (wire ⌘K later), refresh, notifications, theme menu.
- **Acceptance:** shell renders from live state; switching rail connection updates nav +
  breadcrumb; activity drawer opens; collapse + responsive behaviour preserved.

### M3 — Connect / onboarding (kill the wizard)  ·  Dep: M2  ·  Size: M
Replace `SessionSetupView` (607 L, the 4-step stepper) with the Connect screen.
- `src/views/ConnectView.tsx`: connection cards from discovered `providers`/`profiles` with
  detected-profile chips + status. Picking one calls existing `session.selectProvider`/
  `selectProfile`/`selectAuthMethod` then `session.lock` ("Open workspace").
- Reframe **lock/unlock** language → "Open / Close workspace" (same RPCs, no metaphor change in
  backend).
- **Acceptance:** cold start → pick connection → land in workspace, no wizard, no "Step n of 4".

### M4 — Overview  ·  Dep: M2  ·  Size: S
- `src/views/OverviewView.tsx`: stat cards (counts from `workspace.get`), read-only safety banner
  driven by `workspace.awsWritesEnabled`, "Jump back in" recents.
- **Acceptance:** live counts + safety state reflect the workspace snapshot.

### M5 — Resource screens (decompose WorkspaceView, 2491 L)  ·  Dep: M1, M2  ·  Size: L
Split the monolith into `src/views/workspace/` modules; remove Cloudscape per submodule.
- **M5a Storage (S3):** bucket cards → object Table → object drawer; upload, presign, URL inspect.
  Replace Cloudscape Table + PropertyFilter with shadcn Table + lightweight filter.
- **M5b Compute (EC2):** region Select, instance Table, lifecycle actions + confirm Dialog
  (the "danger" confirmation panel becomes an AlertDialog). Uses existing `aws.ec2.*` RPCs.
- **M5c Azure:** Resource Groups + Virtual Machines tables (`azure.*` RPCs).
- **M5d:** Functions / Identity placeholder screens (empty states).
- Each submodule shippable on its own; until migrated, the old Cloudscape tab still renders.
- **Acceptance:** data + actions at parity with today; no `@cloudscape-design` import in migrated files.

### M6 — Local Runtime  ·  Dep: M1, M2  ·  Size: M
Replace the Cloudscape virtualisation panel with emulator cards (prototype style).
- `src/views/workspace/RuntimeView.tsx`: LocalStack + floci-az cards — status pill, endpoint,
  uptime, profile, persistence Switch, env editor, start/stop/restart, inline `LogStream`,
  Docker engine status. Wire to existing `emulators.*` / `docker.*` RPCs + polling already in `App.tsx`.
- **Acceptance:** start/stop/restart works; logs refresh; Docker status reflects runtime.

### M7 — Cross-cutting: notifications, settings, debug  ·  Dep: M1  ·  Size: S
- Replace `Flashbar` → **sonner** toasts fed by `job.updated` events.
- Reset-app `Modal` → shadcn `AlertDialog`; "type RESET to confirm" preserved.
- Theme settings UI (System / Light / Dark) persisted; Debug Console restyled.
- **Acceptance:** job notifications appear as toasts; reset flow intact; theme choice persists.

### M8 — Decommission Cloudscape & polish  ·  Dep: M3–M7  ·  Size: M
- Remove `@cloudscape-design/*` imports (incl. `main.tsx` global-styles, `shared.tsx`),
  drop deps from `package.json`, remove the `cloudscape` `manualChunks` branch in `vite.config.ts`.
- Delete legacy `styles.css` (fold anything still needed into Tailwind).
- a11y pass, focus rings, empty/error/loading states, optional ⌘K command palette.
- Update `App.test.tsx` + view tests for the new structure; bundle-size check.
- **Acceptance:** zero Cloudscape references; `tsc --noEmit` + `vitest` green; app fully on new kit.

### M9 — Notification UX revamp  ·  Dep: M7  ·  Size: M  ·  **DONE (2026-06-13)**
_User feedback (2026-06-10): the current notifications do not close and are not user-friendly._
Rethink the whole notification model, not just the rendering library:
- **Lifecycle:** every notification must be dismissible AND auto-dismiss by default
  (success ~4 s, info ~6 s; errors persist until dismissed). In-progress job toasts update
  in place via a stable toast id (sonner `toast.loading` → `toast.success`/`toast.error` on the
  same id), never stack duplicates per job.
- **Volume control:** dedupe repeated messages, collapse bursts (e.g. poll loops emitting the
  same status), cap concurrent toasts, and route the full history into the Activity drawer so
  nothing is lost when a toast expires.
- **Hierarchy:** transient outcomes → toast; long-running jobs → one updating toast + topbar
  bell badge; persistent state (read-only mode, Docker down) → inline banners on the relevant
  view, not toasts.
- **Affordances:** clear close button, hover-to-pause timers, action buttons where useful
  (e.g. "View logs" on an emulator failure), reduced-motion respected.
- **Acceptance:** no permanently stuck toasts; success toasts self-clear; a job emits exactly one
  toast that updates through queued → running → completed/failed; bell badge and Activity drawer
  stay consistent with toast history.

---

## Sequencing
```
M0 → M1 → M2 ─┬→ M3 (onboarding)
              ├→ M4 (overview)
              ├→ M5a/b/c/d (resources)   ← largest, parallelizable
              ├→ M6 (runtime)
              └→ M7 (notifications/settings)   →   M8 (remove Cloudscape + polish)
                                                      └→ M9 (notification UX revamp)
```
M0–M2 are the critical path. After M2, M3–M7 can proceed in parallel; M8 is the final gate for
the Cloudscape removal; M9 closes out the notification experience on top of the M7 plumbing.

## Risks / notes
- **Coexistence CSS:** Tailwind preflight vs Cloudscape global-styles can collide during M2–M7.
  Mitigate by scoping Tailwind preflight or migrating the shell + each view atomically.
- **PropertyFilter parity (M5):** Cloudscape's property filter is feature-rich; the replacement
  starts as simple search/filter and grows only if needed. Flag if any screen depends on it heavily.
- **Tests:** current tests assert Cloudscape DOM; expect rewrites in M8 (and as each view migrates).
- Keep PRs one-module-each for reviewability; every module leaves `main` runnable.
