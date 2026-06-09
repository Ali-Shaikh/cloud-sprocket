# Checkpoint — UI/UX Redesign work stream

_Last updated: 2026-06-09_

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
M8 remove Cloudscape + polish. App stays runnable after every module; Cloudscape deleted only in M8.

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

**M3 — DONE + verified, NOT yet committed (sitting in the working tree).**

### >>> RESUME HERE: M4 (Overview) <<<
Next session: build M4 - `src/views/OverviewView.tsx`. Stat cards (counts from `workspace.get`:
s3Buckets, ec2Instances, azure RG/VMs, emulators), a read-only safety banner driven by
`workspace.awsWritesEnabled`, and a "Jump back in" recents strip. This is the FIRST tab shown
*after* a workspace is opened (locked). Currently the locked "overview" tab still renders the old
Cloudscape `WorkspaceView` overview; M4 swaps that one tab to a Tailwind view (decompose pattern
continues in M5). Reuse M1 `StatCard`/`Card`/`Badge` + the shell. Acceptance: live counts + safety
state reflect the workspace snapshot.
Dev server: launch config `desktop-web` (vite :1425). Heads-up: headless screenshotter hangs on
looping animations / Radix portals - inject `*{animation:none!important;transition:none!important}`
via preview_eval first; preview viewport defaults narrow (<1180 px) so the context nav
auto-collapses (by design) - resize to >=1280 to see it. The branch is `feat/ui-rebuild-tailwind`
(NOT the default branch - check `git branch` first; the repo also has `chore/add-termius-sponsor`).
**Commit M3 before starting M4 if a clean history is wanted.**

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

- **M3 — DONE, verified, uncommitted.** Killed the 4-step wizard. New `src/views/ConnectView.tsx`
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

## Next step
**M4 — Overview.** Build `OverviewView.tsx` (stat cards + safety banner + recents) for the locked
workspace's first tab. See the RESUME HERE block above for specifics.

## To reopen prototype
`preview_start` config `prototype`, then open `http://localhost:4321/design-prototypes/index.html`.
