# Token mapping: observe (local) → @hiai-gg/hiai-ui (canonical)

OBS1.1b verification artifact. Documents the canonical → local alias layer that
makes hiai-observe consume `@hiai-gg/hiai-ui/styles/tokens.css` without rewriting every
component.

- **Source of truth:** `/mnt/ai_data/packages/hiai-ui/src/styles/tokens.css` (blocks 1–5)
- **Local observe alias block:** `frontend/src/app.css` (`.theme-observe { ... }`)
- **Verification artifact:** `frontend/src/app.html` applies `class="theme-observe dark"` to `<html>` so both observe's alias block and the canonical dark block resolve correctly

---

## 1. Canonical tokens defined by `.theme-observe` (tokens.css block 3)

`.theme-observe` is a **dark-first slate** variant layered ON TOP of `:root`. It
overrides 22 tokens. observe only needs these — it never touches the light
canon.

| Token | Value | Source rule |
|---|---|---|
| `color-scheme` | `dark` | meta |
| `--background` | `oklch(0.16 0 0)` | bg / page |
| `--foreground` | `oklch(0.96 0 0)` | body text |
| `--card` | `oklch(0.20 0 0)` | raised surface |
| `--card-foreground` | `oklch(0.96 0 0)` | text on card |
| `--popover` | `oklch(0.24 0 0)` | overlays / menus |
| `--popover-foreground` | `oklch(0.96 0 0)` | text on popover |
| `--primary` | `#20b2aa` | brand teal (light canon reused) |
| `--primary-foreground` | `oklch(0.98 0 0)` | text on primary |
| `--primary-hover` | `#1c9c95` | hover state of primary |
| `--secondary` | `oklch(0.24 0 0)` | secondary surface |
| `--secondary-foreground` | `oklch(0.96 0 0)` | text on secondary |
| `--muted` | `oklch(0.26 0 0)` | muted bg |
| `--muted-foreground` | `oklch(0.74 0 0)` | muted text |
| `--accent` | `oklch(0.28 0 0)` | accent bg (slate) |
| `--accent-foreground` | `oklch(0.96 0 0)` | text on accent |
| `--destructive` | `oklch(0.58 0.18 25)` | danger / red |
| `--destructive-foreground` | `oklch(0.98 0.01 25)` | text on destructive |
| `--border` | `oklch(0.32 0 0)` | borders |
| `--input` | `oklch(0.34 0 0)` | form inputs |
| `--ring` | `#20b2aa` | focus ring |
| `--color-primary` | `#20b2aa` | app-level alias (compat) |
| `--color-bg` | `oklch(0.16 0 0)` | app-level alias |
| `--color-surface` | `oklch(0.20 0 0)` | app-level alias (== `--card`) |

> Inherited from `:root` (not overridden in `.theme-observe`, but available): `--radius: 0.625rem`,
> `--highlight-default: #fde68a`, `--hljs-*` syntax highlight tokens, and the
> Tailwind v4 `@theme` mapping (`bg-primary`, `text-foreground`, etc. — see
> tokens.css block 4).

---

## 2. Local observe tokens (pre-migration, from git `597bd7c^`)

The pre-migration `app.css` defined **22 semantic tokens** under `@theme` + a
`html:not(.dark)` light override block. All 22 are reproduced below for
provenance. These names are observed by 1,211 references across the frontend
(route files + components).

### Dark (default — `@theme` block)

| Local token | Hex | Notes |
|---|---|---|
| `--color-surface` | `#0f172a` | bg |
| `--color-surface-raised` | `#1e293b` | card |
| `--color-surface-overlay` | `#334155` | hover / overlay |
| `--color-border` | `#334155` | borders |
| `--color-text-primary` | `#f8fafc` | body text |
| `--color-text-secondary` | `#94a3b8` | secondary text |
| `--color-text-muted` | `#64748b` | muted text |
| `--color-accent` | `#3b82f6` | brand blue (Tailwind blue-500) |
| `--color-accent-hover` | `#2563eb` | accent hover (blue-600) |
| `--color-accent-bg` | `rgba(59, 130, 246, 0.1)` | tinted bg |
| `--color-success` | `#22c55e` | success (green-500) |
| `--color-success-bg` | `rgba(34, 197, 94, 0.15)` | success tinted bg |
| `--color-warning` | `#eab308` | warning (yellow-500) |
| `--color-warning-bg` | `rgba(234, 179, 8, 0.15)` | warning tinted bg |
| `--color-danger` | `#ef4444` | danger (red-500) |
| `--color-danger-bg` | `rgba(239, 68, 68, 0.15)` | danger tinted bg |
| `--color-info` | `#3b82f6` | info == accent |
| `--color-info-bg` | `rgba(59, 130, 246, 0.15)` | info tinted bg |
| `--color-violet` | `#8b5cf6` | violet (violet-500) |
| `--color-violet-bg` | `rgba(139, 92, 246, 0.15)` | violet tinted bg |

### Light (`html:not(.dark)` overrides)

| Local token | Light hex |
|---|---|
| `--color-surface` | `#f1f5f9` |
| `--color-surface-raised` | `#ffffff` |
| `--color-surface-overlay` | `#f1f5f9` |
| `--color-border` | `#e2e8f0` |
| `--color-text-primary` | `#0f172a` |
| `--color-text-secondary` | `#475569` |
| `--color-text-muted` | `#94a3b8` |
| `--color-accent` | `#2563eb` |
| `--color-accent-hover` | `#1d4ed8` |
| `--color-accent-bg` | `rgba(37, 99, 235, 0.1)` |
| `--color-success` | `#16a34a` |
| `--color-success-bg` | `rgba(22, 163, 74, 0.1)` |
| `--color-warning` | `#ca8a04` |
| `--color-warning-bg` | `rgba(202, 138, 4, 0.1)` |
| `--color-danger` | `#dc2626` |
| `--color-danger-bg` | `rgba(220, 38, 38, 0.1)` |
| `--color-info` | `#2563eb` |
| `--color-info-bg` | `rgba(37, 99, 235, 0.1)` |
| `--color-violet` | `#7c3aed` |
| `--color-violet-bg` | `rgba(124, 58, 237, 0.1)` |

---

## 3. Mapping table (local observe → canonical shadcn-svelte)

The alias block in `app.css` (`.theme-observe { ... }`) is the bridge. observe
keeps its existing `--color-*` names (so 1,211 component refs stay valid) but
they now resolve through `var(--canonical)`.

| Local observe | Canonical (.theme-observe) | Notes |
|---|---|---|
| `--color-surface` | `var(--background)` | bg → bg |
| `--color-surface-raised` | `var(--card)` | raised surface → card |
| `--color-surface-overlay` | `var(--accent)` | overlay → accent (slate, matches slate scheme) |
| `--color-border` | `var(--border)` | 1:1 |
| `--color-text-primary` | `var(--foreground)` | 1:1 |
| `--color-text-secondary` | `var(--muted-foreground)` | matches gray-400 from old hex |
| `--color-text-muted` | `var(--muted-foreground)` | same as secondary (intentional, both were muted) |
| `--color-accent` | `var(--primary)` | local blue `#3b82f6` → canon teal `#20b2aa` |
| `--color-accent-hover` | `var(--primary-hover)` | local `#2563eb` → canon `#1c9c95` |
| `--color-accent-bg` | `color-mix(in oklch, var(--primary) 12%, transparent)` | tinted bg via color-mix (replaces rgba) |
| `--color-success` | `var(--success)` | semantic add-on token |
| `--color-success-bg` | `color-mix(in oklch, var(--success) 18%, transparent)` | tinted bg via color-mix |
| `--color-warning` | `var(--warning)` | semantic add-on token |
| `--color-warning-bg` | `color-mix(in oklch, var(--warning) 18%, transparent)` | tinted bg via color-mix |
| `--color-danger` | `var(--destructive)` | local `danger` → shadcn `destructive` |
| `--color-danger-bg` | `color-mix(in oklch, var(--destructive) 18%, transparent)` | tinted bg via color-mix |
| `--color-info` | `var(--info)` | semantic add-on token |
| `--color-info-bg` | `color-mix(in oklch, var(--info) 18%, transparent)` | tinted bg via color-mix |
| `--color-violet` | `var(--violet)` | semantic add-on token |
| `--color-violet-bg` | `color-mix(in oklch, var(--violet) 18%, transparent)` | tinted bg via color-mix |

### Notable color shifts (pre-migration hex → canonical)

The migration is not strictly 1:1 — a few observe values intentionally drift
toward the canon to read as one product. OBS1.2c must surface these to the user
when the local hexes are deleted.

| Token | Old hex (dark) | New resolved (dark, .theme-observe) | Visual delta |
|---|---|---|---|
| `--color-surface` | `#0f172a` | `oklch(0.16 0 0)` ≈ `#181818` | warmer slate (cool→neutral) |
| `--color-surface-raised` | `#1e293b` | `oklch(0.20 0 0)` ≈ `#333333` | brighter, neutral |
| `--color-surface-overlay` | `#334155` | `oklch(0.28 0 0)` ≈ `#474747` | darker, neutral |
| `--color-text-muted` | `#64748b` | `oklch(0.74 0 0)` ≈ `#bdbdbd` | much brighter (slate gray-500 → neutral gray) |
| `--color-accent` | `#3b82f6` blue-500 | `#20b2aa` teal | brand shift: blue → teal (this is intentional per hiai-docs canon) |
| `--color-accent-hover` | `#2563eb` blue-600 | `#1c9c95` darker teal | matches teal family |
| `--color-danger` | `#ef4444` red-500 | `oklch(0.58 0.18 25)` ≈ `#e85b5b` | slightly desaturated |
| `--color-success` | `#22c55e` green-500 | `oklch(0.55 0.18 145)` ≈ `#58cc6c` | slightly desaturated |
| `--color-warning` | `#eab308` yellow-500 | `oklch(0.7 0.18 75)` ≈ `#e9b852` | warmer, more amber |
| `--color-info` | `#3b82f6` blue-500 | `oklch(0.6 0.18 240)` ≈ `#5b9fd9` | shifted from blue to neutral-info |
| `--color-violet` | `#8b5cf6` violet-500 | `oklch(0.6 0.22 290)` ≈ `#9d6dd9` | slightly brighter, more saturated |

### Why the alias block (vs direct rewrite)

OBS1.2c will eventually **delete** the local 22-token block entirely, replacing
component references to point directly at the canonical names (`bg-background`,
`bg-card`, `text-muted-foreground`, etc.). The alias block keeps the migration
**non-breaking** during OBS1.2b (component swap phase): 1,211 existing refs keep
resolving while we replace them one file at a time.

---

## 4. svelte-check verification

```bash
$ cd /mnt/ai_data/projects/hiai-observe/frontend && bun run check 2>&1 | tail -10
svelte-check found 2 errors and 17 warnings in 6 files
error: script "check" exited with code 1
```

| Status | Count | Source |
|---|---|---|
| TS errors | **2** | pre-existing in adapter files (`StatusBadgeAdapter.svelte`, `ConfirmDialogAdapter.svelte`) — OUT OF SCOPE for OBS1.1b (those are OBS1.2b type-narrowing tasks) |
| a11y warnings | **15** | pre-existing in route files |
| Svelte warnings | **2** | pre-existing (`SplitPane` state capture, button labels) |
| Theme migration regressions | **0** | no new errors introduced by `@import "@hiai-gg/hiai-ui/styles/tokens.css"` or `.theme-observe` block |

`svelte-check` exit 1 is **expected** — the 2 TS errors and 17 warnings are all
pre-existing. The OBS1.1b-specific change (adding `@import "@hiai-gg/hiai-ui/styles/tokens.css"`
+ the alias block + `class="theme-observe dark"` on `<html>`) introduces **zero
new diagnostics**.

`bun run build` also passes (verified): build artifact
`build/client/_app/immutable/assets/0.Y_sc0PVr.css` contains:

```css
.theme-observe{color-scheme:dark;--background:oklch(16% 0 0);...--primary:#20b2aa;...}
.theme-observe{--color-surface:var(--background);--color-surface-raised:var(--card);...}
```

— confirming tokens.css + the alias block both reach the bundle.

---

## 5. `@source` directive: NOT needed for OBS1.1b, REQUIRED for OBS1.2b

**Current state (OBS1.1b):** Tailwind v4 + `@tailwindcss/vite` resolves
`@import "@hiai-gg/hiai-ui/styles/tokens.css"` automatically via Vite's CSS module
graph. `.theme-observe` rules are plain CSS selectors with no class scanning
required — they're applied to whatever element carries the class.

No utility-class lookup is needed in tokens.css itself: it only defines
**CSS-level** rules (`:root`, `.dark`, `.theme-observe`, `@theme` mapping
blocks, base). The `@theme` mapping (`bg-primary`, `text-foreground`, etc.)
**does** generate utility classes that would need scanning — but only if they
are *referenced* from somewhere.

**OBS1.2b (component swap):** when we replace `frontend/src/lib/components/StatusBadge.svelte`
and `ConfirmDialog.svelte` with their `@hiai-gg/hiai-ui` counterparts, the package
components reference utility classes like `bg-primary`, `text-primary-foreground`,
`border-input`, etc. that come from shadcn-svelte's `cn(buttonVariants({ ... }))`
runtime. Tailwind v4's content scanner must see those classes — but Vite's
auto-discovery only scans the **consumer** project, not workspace packages.

**Required for OBS1.2b — add to `frontend/src/app.css`:**

```css
@import "tailwindcss";
@import "@hiai-gg/hiai-ui/styles/tokens.css";
@source "../../../../../packages/hiai-ui/src";   /* observe is at projects/hiai-observe/frontend — packages/ is 5 levels up */
```

(Relative to `frontend/src/app.css`, the path to hiai-ui src is
`../../../../../packages/hiai-ui/src` — `../../../` to project root,
`../../../packages/hiai-ui/src` from there. Verify with a `realpath` after
placement.)

**Verification recipe for OBS1.2b:** after adding `@source`, run
`bun run build` and confirm `bg-primary`, `bg-card`, `text-muted-foreground`
classes appear in the compiled CSS bundle for the components that use them.

---

## 6. Path to this file

`/mnt/ai_data/projects/hiai-observe/frontend/src/lib/token-mapping.md`

Referenced from:
- OBS1.2a (component swap plan)
- OBS1.2b (component swap impl — will need @source)
- OBS1.2c (local token deletion — uses §3 table to flag visual deltas)
