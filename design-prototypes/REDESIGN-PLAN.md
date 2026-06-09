# CloudSprocket UI/UX Redesign — Plan & Prototype

_Status: proposal for review. Created 2026-06-09._

## 1. Diagnosis — why the current UI feels wrong

The current desktop shell (`apps/desktop/src`) mixes **two clashing design languages**:

1. **AWS Cloudscape** (`@cloudscape-design/components`) for all main-panel content — tables,
   containers, headers, flashbars. This is *literally the AWS Console design system*. An app
   whose pitch is "work locally, escape the consoles" ends up looking exactly like the console
   it replaces: dense, grey, enterprise, utilitarian.
2. **A hand-rolled CSS sidebar** (`styles.css`, ~1060 lines) with its own dark-navy look,
   stepper, "Context" panel and stacked action buttons.

Concrete pain points observed:
- **Wizard/stepper onboarding** ("Provider → Profile → Auth → Lock", "Step 1 of 4") is heavy
  and ceremonial for what is really "pick a connection".
- **The "Lock / Unlock Workspace" metaphor** is unusual and unexplained.
- **Card-in-card nesting** and dense Cloudscape tables everywhere; lots of chrome, low signal.
- **No product personality** — generic enterprise grey, no warmth, no brand.
- Navigation is duplicated between sidebar items, the Context block, and footer actions.

## 2. What we borrow from the references

| Reference | What we take |
|-----------|--------------|
| **Slack** | Far-left **icon rail** as a connection switcher (AWS / Azure / GCP / Local), each with a live status dot. Fast context switching; identity at the bottom. |
| **Docker Hub / Docker Desktop** | **Card + table resource browsing** with status pills; customizable contextual left nav; status-first emulator/container cards with inline logs and start/stop. |
| **OpenHuman** (closest analog — also Tauri v2 + React) | "**Simple, UI-first & Human**": near-zero onboarding (install → working in a few clicks, no config-first, no terminal), approachability over density, warmth and brand personality. |

**Common DNA:** friendly, status-first, workspace-switcher driven, card-based, near-zero onboarding.

## 3. The proposed shell

```
┌──────┬─────────────────┬───────────────────────────────────────┐
│ RAIL │ CONTEXTUAL NAV  │ MAIN                                    │
│ 68px │ 256px           │ flex                                    │
│      │                 │ ┌─ topbar: breadcrumb · search · ⟳ · 🔔 │
│ CS   │ AWS · sandbox   │ ┌─ page header + actions                │
│ ●aws │ ● Connected     │ ┌─ content (cards / table / runtime)    │
│ ○az  │ Overview        │                                         │
│ ○gcp │ Storage  (6)    │                                         │
│ ●loc │ Compute  (4)    │                                         │
│  +   │ Functions(2)    │                                         │
│ ⚙ AS │ Identity        │                                         │
└──────┴─────────────────┴───────────────────────────────────────┘
```

Screens prototyped (see `index.html`):
1. **Connect** — replaces the wizard. "CloudSprocket found these on your machine. Pick one to start — no setup required." Connections as cards with detected profiles + status.
2. **Overview** — at-a-glance stats, read-only safety banner, "Jump back in" recents.
3. **Storage (S3)** — Docker-Hub-style bucket cards (object count, size, visibility pill).
4. **Compute (EC2)** — clean table, status pills, inline hover lifecycle actions, region selector.
5. **Local Runtime** — emulator cards (LocalStack, floci-az) with endpoint, uptime, start/stop, inline logs.
6. **Dark theme** — full token-based theming.

## 4. Design tokens (proposed)
- Brand: indigo `#5b6cff` (warmer, distinct from AWS orange / Azure blue).
- Neutral surfaces, 12px radii, soft shadows, generous spacing, Inter typeface.
- Status: green `#18a957` / amber `#d98c00` / red `#e0413b`, each with a tinted "weak" background.
- Full light + dark via CSS custom properties.

## 5. Implementation options (the key decision)

**Option A — Replace Cloudscape with a modern component layer (recommended).**
Adopt Tailwind + a headless primitive lib (Radix / shadcn-style) or a single cohesive kit
(Mantine). Rip out `@cloudscape-design/*`. Highest fidelity to the references; one design
language; full theming control. Largest effort (rebuild tables/forms/modals).

**Option B — Re-skin: keep Cloudscape, restyle the shell.**
Keep Cloudscape components but wrap them in the new rail+nav shell and apply a Cloudscape
custom theme + visual-refresh density. Faster, lower risk, but Cloudscape's "AWS console"
character will still leak through tables/forms.

**Option C — Hybrid / incremental.**
Build the new shell (rail, nav, topbar, Connect, Overview, Local Runtime) in fresh CSS now;
migrate dense data screens (S3/EC2/Azure tables) off Cloudscape later, screen by screen.
Pragmatic middle path; temporary dual-stack during migration.

## 6. Phasing (independent of option)
- **P0 — Foundations:** design tokens, theme provider, icon set, base primitives.
- **P1 — Shell:** rail connection-switcher + contextual nav + topbar. Wire to existing
  `session`/`workspace` state (no backend changes).
- **P2 — Onboarding:** replace the wizard with the Connect screen; reframe lock/unlock.
- **P3 — Resource screens:** Overview, Storage, Compute, Azure RG/VMs as cards/tables.
- **P4 — Local Runtime:** emulator cards with status, logs, controls.
- **P5 — Polish:** dark mode, empty/error/loading states, keyboard (⌘K), a11y pass.

No backend (`backend/daemon`) or RPC changes required — this is a frontend re-shell over the
existing `backendRequest` data contracts.

## 7. Prototype
`design-prototypes/index.html` — self-contained, click-through, light/dark.
Run: served at `http://localhost:4321/design-prototypes/index.html` via the `prototype`
launch config (`python -m http.server 4321`). Bottom bar switches screens + theme.
