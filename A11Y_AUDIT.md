# A11Y Audit — hiai-observe frontend

**Standard**: WCAG 2.1 AA
**Date**: 2026-06-06
**Scanned**: 30+ Svelte files in `frontend/src/routes/` + `frontend/src/lib/`

## Summary

| Criterion | Status | Count |
|-----------|--------|-------|
| 1.1.1 Non-text Content | ✅ Pass | 0 `<img>` tags found |
| 1.3.1 Info and Relationships | ⚠️ Minor | 1 label missing `for=`, 0 semantic `<nav>`/`<main>` landmarks |
| 1.4.1 Use of Color | ⚠️ Minor | Single-color indicators need text labels |
| 2.1.1 Keyboard | ⚠️ Moderate | 93/94 buttons lack explicit `type=` — risk accidental form submit |
| 2.4.1 Bypass Blocks | ⚠️ Missing | No skip-to-content link |
| 2.4.2 Page Titled | ⚠️ Moderate | 20 `<h1>` — multiple per page on some routes |
| 2.4.6 Headings and Labels | ⚠️ Moderate | ~34 form controls lack associated `<label>` |
| 3.3.2 Labels or Instructions | ⚠️ Missing | 34 form controls (input/select/textarea) without labels |
| 4.1.2 Name, Role, Value | ✅ Pass | 11 `aria-*` attributes, 8 `role=` attributes used |

## Detailed Findings

### 1.1.1 Non-text Content ✅
0 `<img>` tags. No missing alt text.

### 1.3.1 Info and Relationships ⚠️
- 9 `<label>` elements, 8 with `for=` → 1 unassociated label
- 0 `<nav>` elements found
- 0 `<main>` elements found (3 `<main>` if using svelte layouts)
- 0 `<aside>` semantic elements

### 1.4.1 Use of Color ⚠️
- Monitor status (up/down) and health indicators use color only
- No accompanying text labels for status colors

### 2.1.1 Keyboard ⚠️
- 94 `<button>` elements, 93 without explicit `type="button"`
- Default type for `<button>` is `submit` — this can accidentally submit parent forms
- Fix: add `type="button"` to all non-submit buttons

### 2.4.1 Bypass Blocks ❌
- Missing `<a href="#main-content">Skip to content</a>`
- No skip navigation link present

### 2.4.2 Page Titled ⚠️
- 20 `<h1>` elements across pages
- Multiple per-page violates "one `<h1>` per page" guideline
- Heading hierarchy: h1(20) > h2(24) > h3(20) > h4(1) — generally well-structured but too many h1

### 2.4.6 / 3.3.2 Headings and Labels ⚠️
- 43 form controls (input/select/textarea)
- Only 9 `<label>` elements
- ~34 form controls lack visual labels (may use placeholders which fail WCAG)

### 4.1.2 Name, Role, Value ✅
- 11 `aria-*` attributes: `aria-label`, `aria-current`, `aria-selected`, `aria-checked` all used correctly
- 8 `role=` attributes: proper usage of `role="button"`, `role="status"`, `role="alert"`
- SvelteKit generates accessible links by default

## Recommendations (Priority Order)

1. **HIGH**: Add `type="button"` to 93 buttons (prevents accidental form submit)
2. **HIGH**: Add `<label>` for 34 unlabeled form controls
3. **MEDIUM**: Add skip-to-content link in root layout
4. **MEDIUM**: Audit `<h1>` count — ensure one per page
5. **LOW**: Add text labels alongside color-only status indicators
6. **LOW**: Add semantic `<nav>`/`<main>` landmarks

## Estimated Fix Time
~8h for comprehensive remediation.
