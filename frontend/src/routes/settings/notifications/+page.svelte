<script lang="ts">
  import { apiKey } from "$lib/stores.svelte";
  import { getNotificationChannels, testAllAlerts } from "$lib/api";

  let channels = $state<Array<{
    type: string;
    name: string;
    description: string;
    configFields: Array<{ key: string; label: string; envVar: string; required: boolean }>;
    configured: boolean;
  }>>([]);

  let loading = $state(true);
  let testing = $state(false);
  let testResult = $state<{ message: string; success: boolean } | null>(null);

  // Config form state
  let telegramBotToken = $state("");
  let telegramChatId = $state("");
  let discordWebhookUrl = $state("");
  let smtpHost = $state("");
  let smtpPort = $state("587");
  let smtpUser = $state("");
  let smtpPass = $state("");
  let smtpFrom = $state("");
  let saving = $state(false);
  let saveResult = $state<{ message: string; success: boolean } | null>(null);

  async function loadChannels() {
    try {
      loading = true;
      const result = await getNotificationChannels();
      channels = result.channels;
    } catch {
      // silent
    } finally {
      loading = false;
    }
  }

  $effect(() => { loadChannels(); });

  async function handleTestAll() {
    testing = true;
    testResult = null;
    try {
      const result = await testAllAlerts();
      testResult = { message: result.message, success: true };
    } catch {
      testResult = { message: "Failed to send test notifications", success: false };
    } finally {
      testing = false;
    }
  }

  async function handleSaveConfig() {
    saving = true;
    saveResult = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey.current) headers["Authorization"] = `Bearer ${apiKey.current}`;
      const res = await fetch("/api/alerts/config", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          telegram: { botToken: telegramBotToken, chatId: telegramChatId },
          discord: { webhookUrl: discordWebhookUrl },
          smtp: { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, from: smtpFrom },
        }),
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        saveResult = { message: "Configuration saved. Restart the server to apply changes.", success: true };
        await loadChannels();
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        saveResult = { message: (err as { error?: string }).error ?? "Failed to save", success: false };
      }
    } catch (e) {
      saveResult = { message: e instanceof Error && e.name === "AbortError" ? "Request timed out" : "Failed to save configuration", success: false };
    } finally {
      saving = false;
    }
  }

  function isChannelConfigured(type: string): boolean {
    return channels.find((c) => c.type === type)?.configured ?? false;
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold text-[var(--color-text)]">Notification Channels</h1>
      <p class="text-sm text-[var(--color-text-muted)]">Configure how alerts are delivered</p>
    </div>
    <a
      href="/settings"
      class="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)]"
    >
      Back to Settings
    </a>
  </div>

  <!-- Channel Status Overview -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    {#each channels as channel (channel.type)}
      <div class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-[var(--color-text)]">{channel.name}</h3>
          <span
            class="h-2.5 w-2.5 rounded-full {channel.configured ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-muted)]'}"
            title={channel.configured ? "Configured" : "Not configured"}
          ></span>
        </div>
        <p class="mt-1 text-xs text-[var(--color-text-muted)]">{channel.description}</p>
      </div>
    {/each}
  </div>

  <!-- Telegram Configuration -->
  <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="text-lg">Telegram</span>
      {#if isChannelConfigured("telegram")}
        <span class="rounded-full bg-[var(--color-success)]/20 px-2 py-0.5 text-xs text-[var(--color-success)]">Connected</span>
      {:else}
        <span class="rounded-full bg-[var(--color-text-muted)]/20 px-2 py-0.5 text-xs text-[var(--color-text-muted)]">Not configured</span>
      {/if}
    </div>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label for="tg-token" class="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Bot Token</label>
        <input
          id="tg-token"
          type="password"
          bind:value={telegramBotToken}
          placeholder="123456:ABC-DEF..."
          class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
        <p class="mt-1 text-xs text-[var(--color-text-muted)]">Get from @BotFather</p>
      </div>
      <div>
        <label for="tg-chat" class="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Chat ID</label>
        <input
          id="tg-chat"
          type="text"
          bind:value={telegramChatId}
          placeholder="-1001234567890"
          class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
        <p class="mt-1 text-xs text-[var(--color-text-muted)]">Use @userinfobot or @getmyid_bot</p>
      </div>
    </div>
  </section>

  <!-- Discord Configuration -->
  <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="text-lg">Discord</span>
      {#if isChannelConfigured("discord")}
        <span class="rounded-full bg-[var(--color-success)]/20 px-2 py-0.5 text-xs text-[var(--color-success)]">Connected</span>
      {:else}
        <span class="rounded-full bg-[var(--color-text-muted)]/20 px-2 py-0.5 text-xs text-[var(--color-text-muted)]">Not configured</span>
      {/if}
    </div>
    <div>
      <label for="dc-webhook" class="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Webhook URL</label>
      <input
        id="dc-webhook"
        type="url"
        bind:value={discordWebhookUrl}
        placeholder="https://discord.com/api/webhooks/..."
        class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />
      <p class="mt-1 text-xs text-[var(--color-text-muted)]">Server Settings &gt; Integrations &gt; Webhooks</p>
    </div>
  </section>

  <!-- Email (SMTP) Configuration -->
  <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
    <div class="mb-3 flex items-center gap-2">
      <span class="text-lg">Email (SMTP)</span>
      {#if isChannelConfigured("email")}
        <span class="rounded-full bg-[var(--color-success)]/20 px-2 py-0.5 text-xs text-[var(--color-success)]">Connected</span>
      {:else}
        <span class="rounded-full bg-[var(--color-text-muted)]/20 px-2 py-0.5 text-xs text-[var(--color-text-muted)]">Not configured</span>
      {/if}
    </div>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <label for="smtp-host" class="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">SMTP Host</label>
        <input
          id="smtp-host"
          type="text"
          bind:value={smtpHost}
          placeholder="smtp.gmail.com"
          class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>
      <div>
        <label for="smtp-port" class="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Port</label>
        <input
          id="smtp-port"
          type="number"
          bind:value={smtpPort}
          placeholder="587"
          class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>
      <div>
        <label for="smtp-from" class="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">From Address</label>
        <input
          id="smtp-from"
          type="email"
          bind:value={smtpFrom}
          placeholder="alerts@example.com"
          class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>
      <div>
        <label for="smtp-user" class="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Username (optional)</label>
        <input
          id="smtp-user"
          type="text"
          bind:value={smtpUser}
          placeholder="user@example.com"
          class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>
      <div>
        <label for="smtp-pass" class="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Password (optional)</label>
        <input
          id="smtp-pass"
          type="password"
          bind:value={smtpPass}
          placeholder="App password"
          class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
      </div>
    </div>
  </section>

  <!-- Action Buttons -->
  <div class="flex items-center gap-3">
    <button
      onclick={handleSaveConfig}
      disabled={saving}
      class="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
    >
      {saving ? "Saving..." : "Save Configuration"}
    </button>
    <button
      onclick={handleTestAll}
      disabled={testing}
      class="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-raised)] disabled:opacity-50"
    >
      {testing ? "Sending..." : "Send Test Notification"}
    </button>
  </div>

  <!-- Result Messages -->
  {#if saveResult}
    <div
      class="rounded-md p-3 text-sm {saveResult.success ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'}"
    >
      {saveResult.message}
    </div>
  {/if}

  {#if testResult}
    <div
      class="rounded-md p-3 text-sm {testResult.success ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'}"
    >
      {testResult.message}
    </div>
  {/if}

  <!-- Environment Variables Reference -->
  <section class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
    <h2 class="mb-3 text-lg font-semibold text-[var(--color-text)]">Environment Variables</h2>
    <p class="mb-3 text-sm text-[var(--color-text-muted)]">
      These can also be set in your <code class="rounded bg-[var(--color-surface)] px-1 py-0.5 text-xs">.env</code> file.
    </p>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--color-border)]">
            <th class="py-2 text-left font-medium text-[var(--color-text-muted)]">Variable</th>
            <th class="py-2 text-left font-medium text-[var(--color-text-muted)]">Channel</th>
            <th class="py-2 text-left font-medium text-[var(--color-text-muted)]">Required</th>
          </tr>
        </thead>
        <tbody>
          {#each channels as channel (channel.type)}
            {#each channel.configFields as field (field.key)}
              <tr class="border-b border-[var(--color-border)]/50">
                <td class="py-1.5 font-mono text-xs text-[var(--color-text)]">{field.envVar}</td>
                <td class="py-1.5 text-[var(--color-text-muted)]">{channel.name}</td>
                <td class="py-1.5">
                  {#if field.required}
                    <span class="text-[var(--color-danger)]">Yes</span>
                  {:else}
                    <span class="text-[var(--color-text-muted)]">Optional</span>
                  {/if}
                </td>
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
