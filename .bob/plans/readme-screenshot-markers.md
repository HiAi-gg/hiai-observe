# Plan: README Screenshot Placeholder Markers

## Goal
Insert HTML comment markers at 4 optimal positions in README.md so the user knows exactly where to paste their screenshots and splash image.

## Deliverable
`README.md` with 4 `<!-- SCREENSHOT -->` comment blocks, each specifying: file path, what to show, recommended dimensions, alt text, and the exact `<img>` tag to paste.

---

## Wave 1: Insert 4 Screenshot Markers

### Position 1 — Hero / Splash (after tagline, before Quick Start)
**Line reference:** After "3. What are my agents actually doing?" and before "## Quick Start" (currently line 14→15)
**Purpose:** Main dashboard hero image — first thing users see.

```html
<!-- ============================================ -->
<!-- 🖼️  SCREENSHOT #1: Hero / Splash              -->
<!-- Файл:         docs/screenshots/hero.png       -->
<!-- Что показать: Главный дашборд (светлая тема)  -->
<!--              — error rate, uptime, containers  -->
<!--              — AI cost panel, recent issues     -->
<!-- Размер:       1200×675 (16:9)                 -->
<!-- alt text:     "HiAi Observe unified dashboard showing error rate, uptime, container stats, and AI cost" -->
<!-- Вставь сюда:  <img src="docs/screenshots/hero.png" width="100%" alt="HiAi Observe unified dashboard" /> -->
<!-- ============================================ -->
```

### Position 2 — Feature Showcase (after "What's Included", before "## Comparison")
**Line reference:** After "Plus: unified dashboard..." paragraph, before "## Comparison" (line 108→110)
**Purpose:** Show the dashboard or individual feature screens in a small gallery.

```html
<!-- ============================================ -->
<!-- 🖼️  SCREENSHOT #2: Feature Showcase           -->
<!-- Файл:         docs/screenshots/features.png    -->
<!-- Что показать: 2-3 панели рядом (можно монтаж): -->
<!--              — Issues list with stack traces    -->
<!--              — Uptime monitor with response time -->
<!--              — Log viewer with search           -->
<!-- Размер:       1200×500 (широкая полоса)       -->
<!-- alt text:     "HiAi Observe features: issue tracking, uptime monitoring, and log viewer" -->
<!-- Вставь сюда:  <img src="docs/screenshots/features.png" width="100%" alt="HiAi Observe features" /> -->
<!-- ============================================ -->
```

### Position 3 — Error Tracking Detail (after Sentry SDK code block)
**Line reference:** After the Sentry SDK code fence, before "### OpenTelemetry (Generic)" (line 154→156)
**Purpose:** Show what an actual error looks like — stack trace, breadcrumbs, context.

```html
<!-- ============================================ -->
<!-- 🖼️  SCREENSHOT #3: Error Detail               -->
<!-- Файл:         docs/screenshots/error-detail.png -->
<!-- Что показать: Страница ошибки:                  -->
<!--              — Stack trace с подсветкой          -->
<!--              — Breadcrumbs (user actions)        -->
<!--              — Tags (browser, OS, release)       -->
<!--              — Related issues                    -->
<!-- Размер:       1200×700                         -->
<!-- alt text:     "HiAi Observe error detail with stack trace, breadcrumbs, and context" -->
<!-- Вставь сюда:  <img src="docs/screenshots/error-detail.png" width="100%" alt="HiAi Observe error detail" /> -->
<!-- ============================================ -->
```

### Position 4 — AI Tracing (after MCP section, before "## API Endpoints")
**Line reference:** After the MCP Shell/CLI paragraph ("Drop the skills/..."), before "## API Endpoints" (line ~198→200)
**Purpose:** Show AI agent traces — workflow visualization, token usage.

```html
<!-- ============================================ -->
<!-- 🖼️  SCREENSHOT #4: AI Agent Tracing           -->
<!-- Файл:         docs/screenshots/ai-tracing.png  -->
<!-- Что показать: Трейс AI-агента:                 -->
<!--              — Workflow steps (дерево)          -->
<!--              — Token usage per step             -->
<!--              — Latency breakdown                -->
<!--              — Tool calls (если есть)           -->
<!-- Размер:       1200×700                         -->
<!-- alt text:     "HiAi Observe AI agent trace showing workflow steps and token usage" -->
<!-- Вставь сюда:  <img src="docs/screenshots/ai-tracing.png" width="100%" alt="HiAi Observe AI agent tracing" /> -->
<!-- ============================================ -->
```

---

## Wave 2: Verify

- No functional changes — only HTML comments
- `bun run typecheck` — should be clean (no code changes)

---

## File Structure After Changes

```
docs/screenshots/          ← создай эту папку
├── hero.png               ← скриншот #1
├── features.png           ← скриншот #2
├── error-detail.png       ← скриншот #3
└── ai-tracing.png         ← скриншот #4
```

## Notes for User

- Формат: PNG, сжатый (TinyPNG / `optipng`)
- Тема: светлая (лучше читается на GitHub)
- Не используй тёмную тему для скриншотов — GitHub README фон белый, тёмные скрины выглядят как дыры
- Если есть заставка (splash screen) — она идёт в Position 1 как hero.png
- После вставки удали блоки `<!-- ============================================ -->` (они только для навигации)
