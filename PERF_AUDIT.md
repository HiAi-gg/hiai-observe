# Performance Audit — hiai-observe

**Date**: 2026-06-06
**Method**: Direct measurement (curl, ps, du)

## Summary

| Metric | Value | Verdict |
|--------|-------|---------|
| HTTP response time (health) | ~6ms | ✅ Excellent |
| HTTP response time (issues API) | ~6ms | ✅ Excellent |
| Memory (RSS) | ~148MB | ⚠️ Acceptable (target <512MB) |
| Bundle size (dist/index.js) | 1.7MB | ✅ Excellent |
| Server startup (cold) | ~3.5s | ✅ Good |
| Source code | 648KB | ✅ Compact |
| Frontend build | 2.9MB | ✅ Good |
| Node modules | 238MB | ⚠️ Normal for full-stack |

## Lighthouse Score (estimation)

Based on bundle analysis:
- **Performance**: ~85-95 (small bundle, fast API responses)
- **Accessibility**: ~75-85 (needs label fixes per A11Y_AUDIT.md)
- **Best Practices**: ~90 (SSR, semantic HTML)
- **SEO**: ~85-95 (proper SvelteKit SSR)

Actual Lighthouse scores require running in a real browser. The frontend is SvelteKit SSR which generates semantic HTML out of the box.

## Recommendations

1. Add `cache-control` headers to static assets in Caddy/nginx
2. Enable HTTP/2 in production Caddy config
3. Consider lazy-loading route modules (SvelteKit does this automatically)
4. Bundle size (1.7MB) is already excellent — 1 request for entire backend

## Lighthouse 90+ Feasibility

Achievable with:
- A11Y fixes from A11Y_AUDIT.md (~15min)
- Proper meta tags in app.html (~5min)
- Lazy image loading (no images currently)
