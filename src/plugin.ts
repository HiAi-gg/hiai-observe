/**
 * HiAi Observe — plugin manifest.
 *
 * Self-describing manifest for the hiai-observe module, conforming to
 * HIAI_CONVENTIONS.md §6 (Plugin / Proxy contract). It can be consumed by
 * any HiAi host (hiai-admin, hiai-dashboard, hiai-kit, sites) to:
 *
 *   1. Render the Observe nav group in the host's sidebar.
 *   2. Forward `/api/observe/*` traffic to the observe backend on :8001.
 *   3. Surface the host-required settings (OBSERVE_URL, OBSERVE_API_KEY) in
 *      the host's plugin settings UI.
 *   4. Verify the module is reachable via the canonical health probe.
 *
 * The contract here mirrors the canonical `HiAiPlugin` interface defined in
 * `hiai-admin/app/src/lib/plugins/types.ts` (which uses Svelte `Component`
 * types for `pages` / `settings.component`). For portability — this module
 * has no Svelte dependency — the `settings` field uses a portable, structural
 * shape `{ fields: SettingField[] }` that any host can render or translate
 * into its own typed settings component.
 *
 * Version is sourced from package.json at build/runtime via a dynamic import
 * so a single bump in package.json propagates to every host without touching
 * this file.
 */

// ── Version (from package.json, single source of truth) ──────────────────

import packageJson from "../package.json";
import { config } from "./lib/config.js";

// ── Types (portable mirror of hiai-admin's HiAiPlugin) ───────────────────

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  badge?: string | number;
  comingSoon?: boolean;
  disabled?: boolean;
}

export interface NavGroup {
  label?: string;
  icon?: string;
  items: NavItem[];
}

export interface ProxyConfig {
  /** URL prefix mounted on the host, e.g. "/api/observe". */
  prefix: string;
  /** Upstream target URL (the observe backend). */
  target: string;
  /** Auth mode used by the host when forwarding. */
  auth: "jwt" | "api-key";
  /** Optional sliding-window rate limit applied at the proxy. */
  rateLimit?: { requests: number; window: number };
}

/**
 * A portable, host-agnostic settings descriptor. Hosts can render this list
 * as a generic form, or translate it into their native Svelte settings
 * component (the canonical HiAiPlugin shape uses `settings.component`).
 */
export interface SettingField {
  key: string;
  label: string;
  type: "string" | "password" | "number" | "boolean" | "url";
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  /** Environment-variable name the host should resolve this field to. */
  env?: string;
}

export interface PluginSettings {
  fields: SettingField[];
}

/**
 * HiAiPlugin — portable mirror of HIAI_CONVENTIONS.md §6.
 * `pages`, `onInstall`, `onUninstall` are intentionally omitted from this
 * portable shape (they are host-specific). Hosts that need them can extend
 * the interface locally.
 */
export interface HiAiPlugin {
  id: string;
  name: string;
  version: string;
  icon?: string;
  description: string;
  navGroups: NavGroup[];
  proxy: ProxyConfig;
  settings?: PluginSettings;
  /** Canonical health probe the host can ping to verify reachability. */
  healthCheck?: string;
}

// ── Manifest ─────────────────────────────────────────────────────────────

/**
 * The hiai-observe plugin manifest.
 *
 * `proxy.target` falls back to `http://localhost:8001` (the canonical
 * observe port per HIAI_CONVENTIONS.md §3) and can be overridden by the
 * host via the OBSERVE_URL setting field.
 */
export const hiaiObservePlugin: HiAiPlugin = {
  id: "hiai-observe",
  name: "HiAi Observe",
  version: packageJson.version,
  icon: "Activity",
  description:
    "Unified observability for AI Agents and TypeScript backends — errors, uptime, infrastructure, logs, traces, and AI/agent analytics.",
  navGroups: [
    {
      label: "Issues",
      icon: "Bug",
      items: [
        { label: "All Issues", href: "/observe/issues", icon: "AlertCircle" },
        { label: "Events", href: "/observe/events", icon: "Zap" },
        { label: "Replays", href: "/observe/replays", icon: "RotateCcw" },
      ],
    },
    {
      label: "Uptime",
      icon: "HeartPulse",
      items: [
        { label: "Monitors", href: "/observe/uptime", icon: "Activity" },
        { label: "Status Pages", href: "/observe/status", icon: "Globe" },
      ],
    },
    {
      label: "Infrastructure",
      icon: "Server",
      items: [
        { label: "Containers", href: "/observe/infrastructure", icon: "Container" },
        { label: "Host Metrics", href: "/observe/infrastructure/host", icon: "Cpu" },
        { label: "GPU", href: "/observe/infrastructure/gpu", icon: "Layers" },
      ],
    },
    {
      label: "Logs",
      icon: "ScrollText",
      items: [
        { label: "Live Stream", href: "/observe/logs", icon: "Terminal" },
        { label: "Saved Searches", href: "/observe/logs/saved", icon: "Bookmark" },
      ],
    },
    {
      label: "Traces",
      icon: "GitBranch",
      items: [
        { label: "Spans", href: "/observe/traces", icon: "Workflow" },
        { label: "Workflows", href: "/observe/traces/workflows", icon: "ListTree" },
        { label: "Agents", href: "/observe/traces/agents", icon: "Bot" },
      ],
    },
    {
      label: "AI Analytics",
      icon: "Sparkles",
      items: [
        { label: "Token Usage", href: "/observe/analytics/tokens", icon: "Coins" },
        { label: "Latency", href: "/observe/analytics/latency", icon: "Timer" },
        { label: "Cost", href: "/observe/analytics/cost", icon: "Receipt" },
        { label: "Alerts", href: "/observe/alerts", icon: "BellRing" },
      ],
    },
  ],
  proxy: {
    prefix: "/api/observe",
    target: config.OBSERVE_URL,
    auth: "api-key",
    rateLimit: { requests: 1000, window: 60 },
  },
  settings: {
    fields: [
      {
        key: "OBSERVE_URL",
        label: "Observe backend URL",
        type: "url",
        description: "Base URL of the hiai-observe backend (default: http://localhost:8001).",
        required: false,
        default: "http://localhost:8001",
        placeholder: "http://localhost:8001",
        env: "HIAI_OBSERVE_URL",
      },
      {
        key: "OBSERVE_API_KEY",
        label: "Observe API key",
        type: "password",
        description:
          "API key the host injects on every proxied request. Format: ho_<hex>. Issued by the observe backend.",
        required: true,
        placeholder: "ho_…",
        env: "HIAI_OBSERVE_API_KEY",
      },
    ],
  },
  healthCheck: "/api/health",
};

export default hiaiObservePlugin;
