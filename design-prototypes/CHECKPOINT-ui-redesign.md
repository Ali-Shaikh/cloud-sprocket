# Checkpoint — UI/UX Redesign work stream

_Last updated: 2026-06-13 (M9 complete — the redesign is feature-complete)_

## Goal
User dislikes the current CloudSprocket UI/UX. Redesign toward Slack / Docker Hub / OpenHuman
DNA: friendly, status-first, workspace-switcher driven, card-based, near-zero onboarding.

## Context captured
- Stack: Tauri v2 + React 19 + **AWS Cloudscape** + Go sidecar. Branch: `feat/azure-local-runtime`.
- Root cause of "bad UI": Cloudscape == AWS-console design system + a clashing hand-rolled CSS
  sidebar. Two design languages, enterprise density, heavy wizard onboarding, odd lock metaphor.
- UI lives in: `apps/desktop/src/App.tsx` (1865 L, shell+sidebar), `views/WorkspaceView.tsx`
  (2491 L), `views/SessionSetupView.tsx` (607 L), `styles.css` (1064 L).

## Done this session
- Researched OpenHuman, Slack, Docker Hub/Desktop.
- Built click-through prototype: `design-prototypes/index.html` (rail + contextual nav +
  topbar; screens: Connect, Overview, Storage, Compute, Local Runtime; light + dark).
- Captured screenshots of all 6 screens (shown to user).
- Wrote `design-prototypes/REDESIGN-PLAN.md` (diagnosis, references, shell, tokens, 3 build
  options A/B/C, P0–P5 phasing).
- Added `prototype` server to `.claude/launch.json` (python http.server :4321).

## Decision LOCKED (2026-06-09)
- Build path: **Replace Cloudscape** (full rebuild, highest fidelity).
- Theme: **Follows OS** (prefers-color-scheme) with manual override.
- Stack: **Tailwind CSS v4.1** (`@tailwindcss/vite`, `@theme` tokens) + **shadcn/ui**
  (new-york, OKLCH, copy-in) + lucide-react + sonner. React 19 / Vite 8 / Tauri 2. No backend changes.

## Modular plan written → `design-prototypes/IMPLEMENTATION-PLAN.md`
Modules: M0 tooling/theme → M1 primitive kit → M2 shell (rail+nav+topbar) →
M3 Connect onboarding (kill wizard) · M4 Overview · M5 resources (decompose WorkspaceView
2491 L: S3/EC2/Azure) · M6 Local Runtime · M7 notifications/settings (Flashbar→sonner) →
M8 remove Cloudscape + polish → M9 notification UX revamp (added 2026-06-10 from user feedback:
notifications do not close and are not user-friendly; auto-dismiss, per-job updating toasts,
dedupe, history in the Activity drawer). App stays runnable after every module; Cloudscape
deleted only in M8.

Cloudscape footprint to remove: 6 files / 10 refs (main.tsx global-styles, App.tsx,
SessionSetupView, WorkspaceView, shared.tsx, vite.config.ts manualChunks) + styles.css + package.json deps.

## Implementation progress
Branch: `feat/ui-rebuild-tailwind` (off `feat/azure-local-runtime`). Tasks tracked in session task list (#1-#9 = M0-M8).

**Committed (not pushed):**
- `93b5fc8` feat(desktop): Tailwind v4 + shadcn foundation + primitive kit (M0 + M1)
- `a6f9062` docs: UI redesign plan, prototype, and checkpoint
- `5332495` docs: mark M0/M1 committed, set M2 as resume point
- `5028c6c` feat(desktop): replace Cloudscape sidebar with Tailwind app shell (M2)
- `24714da` docs: mark M2 (app shell) complete, set M3 as resume point
- `fc968e7` feat(desktop): replace setup wizard with card-based Connect view (M3)
- `ea0e18c` docs: mark M3 (Connect view) complete, set M4 as resume point

- `0cd5fa8` feat(desktop): add Tailwind Overview as the workspace landing tab (M4)
- `249ce83` docs: mark M4 (Overview) complete, set M5 as resume point

- `7ab554a` feat(desktop): migrate resource screens to Tailwind workspace views (M5)
- `f609236` docs: mark M5 (resource screens) complete, set M6 as resume point

- `74c1842` feat(desktop): replace virtualisation tab with Tailwind RuntimeView (M6)
- `25ed563` docs: mark M6 complete, add M9 notification UX revamp to the plan

- `dad7f90` feat(desktop): migrate notifications, reset, activity, and debug (M7)
- `f94239b` docs: mark M7 complete, set M8 (Cloudscape removal) as resume point

**M8 — DONE + verified, committed (`e4d7cf2`); post-M8 polish committed up to `9f7758b`.**

### >>> M9 — DONE, verified, UNCOMMITTED (2026-06-13). This was the FINAL module. <<<
The notification model now sits on top of M7's sonner plumbing. Built with two parallel
sub-agents against a pinned contract (engine + UI), integration into App.tsx done by hand.

- **Engine** (`lib/notify.ts`, rewritten - the public `notify`/`notifyJob`/`NotificationTone`
  surface is unchanged so existing call sites kept working): a module-level store exposed to
  React via `useSyncExternalStore` (callable outside React, as before). New: `NotificationRecord`
  history (newest first, capped 100), `unreadCount`, `useNotifications()` hook returning
  `{ records, unreadCount, markAllRead, dismiss, clearAll }`, plus `NotifyOptions`
  (`id`/`dedupeKey`/`action`/`durationMs`). Test-only `__resetNotifications()`/`__getNotifications()`.
  - **Lifecycle**: success 4s, info/warning 6s, in-progress + **error = Infinity (persist until
    dismissed)** - the key change from M7's 10s.
  - **Dedupe / burst-collapse**: identical `dedupeKey` (explicit, else `tone|title|description`)
    within a 4s window reuses the same toast id, increments `count`, refreshes the timer, and shows
    a ` (×N)` suffix on the toast + history row. Job toasts dedupe purely by `jobId` and are exempt.
  - 11 unit tests in `lib/notify.test.ts` (sonner mocked): durations, error-persist, burst collapse
    in/out of window, job lifecycle in place, history cap, markAllRead/dismiss/clearAll.
- **UI**: `components/shell/notification-center.tsx` (`NotificationCenter`) - a right Sheet listing
  records newest-first with tone icon, title (+`×N`), description, relative timestamp
  (`formatRelativeTime`), optional action button, per-row dismiss X, "Clear all" header action,
  unread accent, reduced-motion respected. `components/inline-banner.tsx` (`InlineBanner`, CVA
  tones info/warning/success/destructive) for persistent state.
- **Hierarchy (banners not toasts)**: OverviewView's read-only / writes-enabled banner re-built on
  `InlineBanner` (same copy). RuntimeView gained a Docker-down `InlineBanner` (gated on
  `!dockerReachable`, summary from `dockerDiagnostics`). No persistent-state toasts existed to
  remove - banners are additive.
- **App.tsx integration**: `useNotifications()` wired; **bell badge** = `unreadCount` (the dropped
  M7 prop, restored); the bell opens the NotificationCenter and `markAllRead()` on open. The nav
  "Recent activity" button still opens the old `ActivityDrawer` (backend discovery log) - two
  distinct drawers now. `<Toaster visibleToasts={4}>`. Emulator error/warning notifications carry a
  **"View logs"** action → jumps to the Local Runtime tab. Reset clears notification history.
  Types reconciled: `components/shell/types.ts` re-exports the notification types from `@/lib/notify`
  (single source of truth; the agent's local mirror removed).
- Tests: `App.test.tsx` gains one integration test (bell badge → open centre → record listed →
  badge clears → dismiss empties it) + `__resetNotifications()` in `beforeEach`. **33/33 green**;
  `tsc` clean; production build green (CSS 47.4 kB, JS ~578 kB). Exe rebuilt.

Dev server for any follow-up: launch config `desktop-web` (vite :1425). Heads-up: headless
screenshotter hangs on looping animations / Radix portals - inject
`*{animation:none!important;transition:none!important}` via preview_eval first (but NOT before
sonner toast checks - they need the enter transition); resize viewport to >=1280. Branch:
`feat/ui-rebuild-tailwind`.

- **M0 — DONE, verified, committed (`93b5fc8`).** Tailwind v4.3.0 + `@tailwindcss/vite`, clsx,
  tailwind-merge, lucide-react 1.17, sonner installed in `apps/desktop`.
  - `vite.config.ts`: `tailwindcss()` plugin + `@`→`./src` alias. `tsconfig.json`: `paths @/*`
    (no `baseUrl` — TS6 deprecation).
  - `src/styles/theme.css`: OKLCH semantic tokens (shadcn-compatible) + indigo primary; OS-aware
    via `prefers-color-scheme` + `[data-theme]` override; **Preflight intentionally skipped**
    (imports `tailwindcss/theme.css` + `utilities.css` only) so it coexists with Cloudscape; small
    base scoped to `.app-next`. Re-enable full preflight in M8.
  - `src/lib/utils.ts` (`cn`), `src/lib/theme.tsx` (`ThemeProvider`/`useTheme`, persists `cs-theme`).
  - `components.json` (new-york, neutral, cssVariables, `@/` aliases).
  - `src/dev/Gallery.tsx` mounted at `#gallery` (sanity surface, grows in M1). `main.tsx` wraps in
    ThemeProvider + renders Gallery at `#gallery`.
  - Verified: `tsc` clean; 19/19 vitest pass; gallery renders light+dark; **existing Cloudscape app
    still renders unharmed** (coexistence confirmed via preview).

- **M1 — DONE, verified, committed (`93b5fc8`).** Primitive kit built (delegated to a sub-agent,
  reviewed). `src/components/ui/`: button, input, textarea, badge, card, table, dialog,
  alert-dialog, dropdown-menu, tooltip, tabs, scroll-area, sheet, skeleton, separator, avatar,
  switch, select (Radix-based, React-19 `data-slot` style, CVA variants). `src/components/`
  atoms: status-dot, status-pill, provider-icon (reuses cloud-icons SVGs + lucide Cloud fallback),
  stat-card, empty-state, section-header, code-block, log-stream. Deps added: `@radix-ui/react-*`
  (dialog, alert-dialog, dropdown-menu, tooltip, tabs, scroll-area, switch, select, separator,
  avatar, slot) + `class-variance-authority`. `src/dev/Gallery.tsx` expanded to full showcase.
  - Verified: `tsc` clean; 19/19 vitest pass; `preview_inspect` confirms correct 1020px layout +
    all sections render; light overview render shows correct colours. (NOTE: the headless
    screenshotter intermittently hangs on the gallery — a Radix-portal/animation quirk, not a code
    bug; console is error-free.)

- **M2 — DONE, verified, uncommitted.** Three-zone shell now wraps the real app (the first module
  that visibly replaces the Cloudscape sidebar). Existing Cloudscape views still render *inside* the
  new shell (migrated per-view in M3-M7).
  - New `src/components/shell/`: `types.ts` (shared prop contract), `app-shell.tsx` (3-zone grid,
    carries `.app-next`, `68px / 256px / 1fr`, collapses to `68px / 1fr`), `connection-rail.tsx`
    (68 px `bg-rail`; brand, one item per provider + Local Runtime, status dots, aria-labels,
    tooltips, avatar), `context-nav.tsx` (256 px `bg-sidebar`; connection header + status, grouped
    nav, footer Recent activity + caller footer), `top-bar.tsx` (breadcrumb, search placeholder,
    refresh, notifications w/ count, theme `DropdownMenu` via `useTheme`), `activity-drawer.tsx`
    (right Sheet from `logs`), `index.ts` barrel. (Presentational pieces built by a sub-agent
    against `types.ts`, reviewed; integration done by hand.)
  - `App.tsx`: deleted `AppSidebar` (~295 L) + old icon helpers + the Cloudscape `activityDrawer`
    + footer; derives `railConnections` / `navConnection` / `navGroups` / `activeNavItemId` /
    `activityEntries` from live `providers`/`session`/`workspace`; `handleRailSelect` (provider →
    `selectProvider` + Overview; `local` → virtualisation) + `handleNavSelect` (plain tab ids, plus
    `s3:<page>` composite ids routed to `activeS3PageId`). Removed dead Cloudscape imports
    (`Icon`/`IconProps`/`Checkbox`/`Textarea`/`renderLogEntries`/`useEffectEvent`/`appVersion`).
    Flashbar + reset Modal kept (Cloudscape) until M7. `.app-next` now lives on the shell root.
  - Model note: Local Runtime is a **rail connection** (not in the provider nav). S3 sub-pages
    surface as a contextual "Storage" nav group (`s3:buckets/objects/upload/inspect`); Azure
    RG/VMs come from the backend's own top-level tabs (no synthetic sub-group). ContextNav active
    match is prefix-aware so a parent tab stays lit while a sub-page is active.
  - Tests: `App.test.tsx` updated for the new shell - wrap renders in `ThemeProvider`; navigate
    Local Runtime via the rail when no `virtualisation` tab; scope nav assertions with `within(...)`;
    button names corrected ("Lock Workspace", "Unlock"). Infra: `vitest.config.ts` gains the `@`
    alias; `src/test/setup.ts` stubs `matchMedia` and sets `innerWidth = 1440` (else the nav
    auto-collapses in jsdom). 19/19 green.
  - Verified: `tsc` clean; 19/19 vitest pass; live preview shows the 3-zone shell, all 4 rail
    connections, breadcrumb, theme menu; nav auto-collapses < 1180 px and returns >= 1280 px;
    console error-free.

- **M3 — DONE, verified, committed (`fc968e7`).** Killed the 4-step wizard. New `src/views/ConnectView.tsx`
  (Tailwind, card-based, single screen) replaces `SessionSetupView` as the unlocked content.
  - Layout: "Your clouds" header + Refresh; a responsive grid of connection cards (one per
    provider + a Local Runtime card) with `ProviderIcon` + `StatusPill` (Ready/Setup); selecting a
    provider opens an inline detail panel listing that provider's profiles (radio-style) + auth
    chips, and an "Open workspace" primary button. Prop-driven (backend session is source of
    truth); reuses the existing `onSelectProvider/Profile/AuthMethod` + lock handlers. A small
    effect auto-selects the auth path when a profile exposes exactly one usable method.
  - `App.tsx`: swapped `<SessionSetupView>` for `<ConnectView>` (drops the PropertyFilter/
    preferences/sensitive-values prop surface); added `onOpenLocalRuntime` (→ virtualisation tab).
    Reframed lock/unlock language to **Open / Close workspace** ("Open workspace" in ConnectView;
    `WorkspaceView` exit button "Unlock" → "Close workspace"). Unlocked breadcrumb + setup nav item
    now read "Connect" (not "Overview"). The mock returns all profiles, so ConnectView filters by
    the selected provider.
  - Note: the sensitive-value masking (Hidden until revealed / Reveal) is intentionally dropped
    from the connect screen; it still lives in the locked `WorkspaceView` profile panel and will be
    rebuilt properly in a later view. `SessionSetupView.tsx` is now orphaned (no importer) - left in
    place for the M8 Cloudscape sweep.
  - Tests: `App.test.tsx` - rewrote "renders the connect view" + null-fields tests for the new DOM;
    repurposed the masks-sensitive test to a locked session; updated unlock/reset flows to land on
    "Your clouds" + "Open workspace"; button rename "Unlock" → "Close workspace". 19/19 green.
  - Verified: `tsc` clean; 19/19 vitest pass; live preview shows the card-based Connect screen
    (AWS/Azure/GCP/Local Runtime cards, sandbox/prod profiles, CLI/SSO chips, enabled Open
    workspace), breadcrumb "AWS / Connect", console error-free.

- **M4 — DONE, verified, uncommitted.** New `src/views/OverviewView.tsx` (Tailwind) is now the
  locked workspace's landing tab; the Cloudscape `WorkspaceView` overview tab is dead code for
  locked sessions (still used by other tabs until M5-M7).
  - Layout: `{provider} · {profile}` header + Refresh; a safety banner driven by
    `workspace.awsWritesEnabled` (read-only = calm primary tint with ShieldCheck; writes-enabled =
    warning tint with ShieldAlert); provider-aware stat cards built on the M1 `StatCard` (AWS: S3
    buckets + EC2 instances; Azure: resource groups + VMs; always: local runtimes; running counts
    as dot footers); a "Jump back in" recents grid (first 3 buckets/instances or RGs/VMs) with
    status dots. Stat cards and recents are buttons that call `onNavigate(tabId)` to jump to the
    matching workspace tab.
  - `App.tsx`: new content branch - locked + overview tab renders `<OverviewView>` (before the
    WorkspaceView branch). **"Close workspace" moved into the shell**: the ContextNav footer now
    shows a LogOut "Close workspace" button whenever the session is locked (calls
    `session.unlock`), and `WorkspaceView`'s header close button was REMOVED - one consistent
    affordance, reachable from every tab.
  - Tests: locked-landing assertions moved from "Locked Workspace" to OverviewView markers (banner
    text variants, stat labels, recents); the locked-tabs test now asserts the writes-enabled
    banner + stats + recents; masks-sensitive test reaches the WorkspaceView profile panel via a
    placeholder "Identity" tab (the panel left the landing tab). 19/19 green.
  - Verified: `tsc` clean; 19/19 vitest pass; live preview (browser mock): Open workspace →
    Overview renders banner + 3 stat cards (S3 2, EC2 2 · 1 running, runtimes 2) + 4 recents with
    status; stat click jumps to the S3 tab (breadcrumb "AWS / Storage"); "Close workspace" in the
    nav footer; console error-free.

- **M5 — DONE, verified, uncommitted.** Decomposed the resource screens out of `WorkspaceView`
  into `src/views/workspace/` (Tailwind, no Cloudscape imports). WorkspaceView now only serves the
  virtualisation tab (M6) and the "actions" tab (M7).
  - Shared: `src/lib/use-debounced-value.ts` (Cloudscape-free debounce) and
    `src/views/workspace/detail-fields.tsx` (`DetailFieldList` label/value grid with sensitive
    masking).
  - **M5a `StorageView.tsx`**: four sub-pages from the nav (`s3:buckets|objects|upload|inspect`,
    legacy "url-tester" normalised - this FIXES a pre-existing bug where the old sidebar sent
    "inspect" but WorkspaceView only understood "url-tester", making the URL tools unreachable).
    Bucket cards land first; entering a bucket opens the object browser (bucket Select, debounced
    prefix filter at parity with the stale-response guard, shadcn Table) plus the Object Detail
    drawer (metadata + Copy JSON/CSV, export snippets, signed URL generation). Upload keeps the
    write-policy gating + acknowledgement checkbox + Tauri file dialogue. Inspect keeps
    analyse/validate. `App.tsx`: extracted `applyS3PrefixFilter` (request-id race guard) shared
    with WorkspaceView; S3 tab branch renders StorageView.
  - **M5b `ComputeView.tsx`** (built by a sub-agent against a pinned contract, reviewed): EC2
    Fleet status cards, Instance Inventory (region Select, Refresh EC2, plain text filter
    replacing PropertyFilter, Start/Stop/Reboot with the same write-mode + state gating), confirm
    via shadcn **AlertDialog** (role alertdialog - the EC2 test was updated from role "dialog"),
    Instance Detail fields, six generated Copy Actions, and EC2 Action History. `App.tsx`:
    extracted the four EC2 handlers (`refreshEC2Inventory`, `selectEC2Region`,
    `selectEC2Instance`, `invokeEC2LifecycleAction`) shared with WorkspaceView.
  - **M5c `AzureView.tsx`** (same sub-agent): overview (subscription/tenant/auth cards, metric
    cards incl. "Resource Groups, VMs", Workspace Profile fields), resource-groups (table +
    detail), virtual-machines (RG Select, table, detail, copy actions). Driven by
    `activeAzurePageId` for the azure-overview tab; the azure-resource-groups / azure-vms tabs map
    straight to their pages.
  - **M5d `PlaceholderView.tsx`**: for tabs without a dedicated view (Functions/Identity);
    EmptyState + the Workspace Profile inspector with "Reveal/Hide Sensitive Values" and the
    "Hidden until revealed" masking (the masks-sensitive test now exercises this view).
  - Tests: S3 tests follow the new buckets→objects flow; EC2 dialog role "alertdialog"; everything
    else passed unchanged. 19/19 green; `tsc` clean.
  - Verified in live preview: Storage (bucket cards, objects table, detail drawer, gated
    upload/inspect) and Compute (fleet, inventory, enabled Stop → AlertDialog with full action
    context, Cancel) render correctly with no console errors; Azure verified via the test suite
    (the browser mock opens an AWS workspace).

- **M6 — DONE, verified, uncommitted.** New `src/views/workspace/RuntimeView.tsx` (Tailwind, no
  Cloudscape) replaces the virtualisation tab for BOTH paths: the open-workspace tab and the
  standalone rail destination (`unlocked` prop swaps in the standalone intro copy reworded to the
  Open/Close metaphor). WorkspaceView now only serves the locked "actions" tab.
  - Layout: "Local Runtime" header (Docker engine state + emulator count) + Refresh Docker;
    "Docker Runtime" section (engine state dot, endpoint, server version, ownership policy,
    summary, detail fields); "Local Runtimes" as two-column emulator cards in the prototype style
    (provider logo, image line, status pill with pulse while running, summary, detail fields,
    runtime-action status + settings-locked hint, LocalStack auth token (password input,
    aria-label preserved), persistence checkboxes ("Enable {label} persistence"), env textareas
    (placeholders preserved), Create/Start/Stop buttons with IDENTICAL gating - start stays
    enabled while "unhealthy", settings lock while running/unhealthy - and an inline `LogStream`
    panel with Refresh Logs); "Managed Docker Resources" cards; "Local Config Artifacts" cards;
    "Runtime Settings" field grid (platform, paths, images - the cloudsprocket-workspace.db
    assertion renders from here).
  - Props grouped as two `EmulatorControls` objects (localStack incl. authToken, flociAz) plus
    workspace/unlocked/showSensitiveValues/onRefreshDockerRuntime; App.tsx wires them from the
    existing state + handlers (no new RPCs). Content chain: `virtualisation` branch ahead of
    WorkspaceView catches locked AND unlocked; WorkspaceView's unlocked early-return is now dead.
  - Tests: 19/19 green WITHOUT any test edits (all emulator flow tests - start/stop both
    emulators, locked controls while running, unhealthy keeps start enabled, sparse runtime
    fields, unlock-from-runtime - pass against the new view as-is). `tsc` clean.
  - Verified in live preview (unlocked rail path): all five sections render, both emulator cards,
    and clicking "Start LocalStack" flips the status pill to "running" with the correct action
    status; console error-free.

- **M7 — DONE, verified, uncommitted.** Cross-cutting sweep; **App.tsx is now fully
  Cloudscape-free** (only main.tsx + the three dead view files still reference it, M8 deletes them).
  - **Flashbar → sonner**: new `src/lib/notify.ts` (`notify(tone, title, description)` +
    `notifyJob(job)` - a job is ONE toast keyed by jobId that resolves loading → success/error in
    place). App.tsx: `notifications` state + Flashbar strip deleted; pushNotification /
    addLocalStackNotification / addEmulatorNotification became thin notify() adapters (call sites
    unchanged); job.updated handler calls notifyJob. `<Toaster theme={resolvedTheme}
    position="bottom-right" closeButton richColors />` rendered next to the reset dialog; errors
    10 s, warnings 8 s, success/info default (~4 s). Verified live: refresh produces one success
    toast WITH a close button that AUTO-DISMISSES in ~4 s (the core "never closes" complaint is
    already fixed at M7 level; the deeper model - dedupe, history, banners - stays M9).
  - **Reset Modal → AlertDialog** (M1 kit + Input/Button): same title/copy/"type RESET" gating,
    stays open while in flight; Cancel clears. Test role updated "dialog" → "alertdialog".
  - **ActivityView** (`views/workspace/ActivityView.tsx`): "Activity" h1, "Refresh Discovery",
    log entries with status dots; fed by `toActivityEntries(logs).slice(0, 12)`. The 100-prop
    `<WorkspaceView>` element was DELETED from App.tsx - WorkspaceView is now fully orphaned.
  - **DebugView** (`views/DebugView.tsx`): Tailwind table (time / type badge / method / payload)
    on getDebugLogs/subscribeToDebugLogs; replaces the Cloudscape Container + shared DebugConsole.
  - Also: AppErrorBoundary + Suspense fallback restyled to Tailwind; leftover wizard state
    (provider/profile query + preferences) deleted; TopBar bell badge prop dropped (returns with
    real history in M9); theme menu already done in M2 - untouched.
  - Tests: only the reset dialog role changed; 19/19 green (sonner renders fine in jsdom). `tsc`
    clean.
  - Verified live: one updating toast per job with auto-dismiss + close button; reset alertdialog
    gates on RESET; Activity tab renders entries; Debug Console streams 40 live RPC rows with
    typed badges; console error-free.

- **M8 — DONE, verified, uncommitted.** Cloudscape is fully decommissioned; **zero
  `@cloudscape-design` references remain anywhere in src**.
  - Deleted: `views/WorkspaceView.tsx` (2,491 L), `views/SessionSetupView.tsx` (607 L),
    `views/shared.tsx`, and `src/styles.css` (1,064 L) - a class-name sweep against live code
    found only data-slot/comment false positives first.
  - `main.tsx`: dropped the global-styles + styles.css imports. `theme.css`: switched to the full
    `@import "tailwindcss";` (Preflight global) and replaced the scoped `.app-next` base with a
    global base (universal `border-color: var(--border)`; body gets background/foreground/font/
    antialiasing). The `app-next` class was removed from AppShell + Gallery.
  - `vite.config.ts`: cloudscape `manualChunks` branch removed. `package.json` + lockfile:
    `@cloudscape-design/components` and `@cloudscape-design/global-styles` uninstalled.
  - **Bundle**: the 545 kB (151 kB gzip) cloudscape chunk is GONE; production JS is now ~564 kB
    total (was ~1.1 MB), CSS 45 kB.
  - Verified: `tsc` clean; 19/19 vitest; production build green; live preview under full
    Preflight - Connect, open workspace, Azure overview/resource groups/VMs (live click-through
    of the Azure path this time, the mock had Azure persisted), light AND dark themes, gallery
    renders all 11 sections; body resets (margin 0, Inter, token background) confirmed; console
    error-free. A11y held up: kit-wide focus-visible rings, aria-labels on rail/nav/dialogs.

## Bug fix (2026-06-12, uncommitted): S3 bucket dropdown flicker

- Symptom (user report): switching buckets from the Storage view dropdown made the whole
  view flicker badly.
- Root cause: `App.tsx` routed `aws.s3.selectBucket`, `aws.s3.selectObject`,
  `azure.selectResourceGroup`, and `azure.selectVirtualMachine` through `mutateSession`,
  but all four RPCs return a **WorkspaceSnapshot** (daemon `service.go` and the browser
  mock agree). Normalising that as a SessionSnapshot yielded `isLocked: false`, so the app
  briefly swapped to the Connect view, `loadWorkspace` wiped the workspace to empty, and
  `loadState()` then re-fetched everything and remounted - a full unmount/remount cycle
  plus three redundant round trips per selection.
- Fix: new `mutateWorkspace` helper in `App.tsx` (mirrors the existing EC2 select
  handlers): one request, response treated as a workspace snapshot, session untouched.
  The four call sites switched over. `App.test.tsx`'s backend mock gained a faithful
  `aws.s3.selectBucket` case (it previously fell through to `default: return
  sessionFixture`, which masked the response-shape mismatch).
- Verified: `tsc` clean; 19/19 vitest; live preview with a MutationObserver across bucket
  switches in both directions showed zero DOM teardown and no Connect-view flash; console
  error-free.

## Post-M8 polish (2026-06-13, uncommitted): S3 viewer fixes + one-click workspace open

User feedback after testing the redesign: (1) the Storage view bucket dropdown breaks with
long bucket names, (2) the S3 object details pane is weak UI/UX, (3) the lock/unlock
(Open/Close workspace) ceremony is too complicated. All three fixed, frontend only,
implemented via two sub-agents and reviewed:

1. **Select primitive** (`components/ui/select.tsx`, kit-wide so EC2 region + Azure RG
   selects benefit): trigger clamps the value to one line (shadcn canonical
   `*:data-[slot=select-value]:line-clamp-1` + `min-w-0`), popper capped at
   `max-w-[min(26rem,var(--radix-select-content-available-width))]` (var verified present
   in @radix-ui/react-select 2.3.0), items `break-all` so full names stay readable.
   StorageView bucket picker `w-56` -> flexible `w-64 min-w-48 max-w-80` + title tooltips.
2. **S3 object details pane** (`StorageView.tsx`): file-name title + extension icon, full
   key in mono with copy button, 3-up facts grid (size/modified/storage class), compact
   metadata JSON/CSV copy buttons, tight snippet rows, signed URL presets (15 min/1 h/12 h)
   replacing the free-text seconds input, every copy fires a sonner toast. Layout: >=1280 px
   docks as a sticky scrolling aside; below that it floats in a Sheet so the table is never
   crushed (`useIsWideViewport` hook). Objects table is `table-fixed` with truncating key
   cells + title tooltips.
3. **One-click workspace open** (App.tsx + ConnectView.tsx): clicking a profile card runs
   `openWorkspace` -> `session.selectProfile`, then if exactly ONE usable auth method,
   chains `selectAuthMethod` + `session.lock` and applies state ONCE (no mutateSession
   per step, no flicker). Multiple usable methods -> auth chips appear; a chip click
   completes the chain. Zero usable -> disabled chips with hover summaries + explanatory
   copy (gap caught in review: `needsAuthChoice` alone hid the section, added
   `noUsableAuth`). The "Ready to open / Open workspace" footer ceremony is deleted;
   profile cards show an Open chevron + per-card "Opening" spinner. Nav footer
   "Close workspace" -> **"Switch connection"** (ArrowLeftRight). Lock metaphor swept from
   user-facing copy (AzureView/ComputeView "locked workspace" -> "open workspace"; error
   toast "Could not open the workspace"). Backend untouched (selectProvider/selectProfile
   already self-unlock, so no unlock step is needed to switch).
   Follow-up in the same session: the daemon's user-facing strings were swept too
   (service.go: "Locked %s session" -> "Opened %s workspace", "Unlocked the active cloud
   session" -> "Closed the active workspace", "lock an AWS/Azure session before ..." ->
   "open an AWS/Azure workspace before ...", workspace tab Detail copy, local-profile
   summaries "Select and lock it from setup" -> "Open it from the Connect screen"), plus
   the matching browser-mock and StorageView fallback strings. No identifier/JSON contract
   changes (IsLocked, lockedProviderId, session.lock RPC names untouched).
- Tests: 21/21 desktop (added one-click open + multi-auth chip tests); `go test ./...`
  clean; `tsc` clean; exe rebuilt.

## Next step
**The modular rebuild (M0-M9) is feature-complete.** M9 is verified and uncommitted in the working
tree (commit it to finish the stream). Remaining ideas are polish, not plan modules: optional ⌘K
command palette (deferred from M8), wider live a11y pass, and watching for user feedback after Ali
tests the M9 exe. No outstanding plan work.

## To reopen prototype
`preview_start` config `prototype`, then open `http://localhost:4321/design-prototypes/index.html`.
