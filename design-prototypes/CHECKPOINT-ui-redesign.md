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

### >>> RESUME HERE: M2 (app shell) <<<
Next session: build M2 (ConnectionRail + ContextNav + TopBar + AppShell), wrap the new app root
in `.app-next`, replace `AppSidebar` + `styles.css` shell in `App.tsx`, wire existing handlers.
Build on the M1 kit in `src/components/`. Dev server: launch config `desktop-web` (vite :1425);
gallery at `/#gallery`. Heads-up: the headless screenshotter hangs on pages with looping CSS
animations / Radix portals (inject `*{animation:none!important}` and reload to recover).

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

## Next step
**M2 — app shell** (rail + contextual nav + topbar). First module that visibly replaces the
Cloudscape shell in the real app. Wrap the new app root in `.app-next`. Build on the M1 kit.

## To reopen prototype
`preview_start` config `prototype`, then open `http://localhost:4321/design-prototypes/index.html`.
