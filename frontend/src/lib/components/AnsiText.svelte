<script lang="ts">
  import { parseAnsi } from "$lib/ansi";

  interface Props {
    text: string;
  }

  let { text }: Props = $props();

  const spans = $derived(parseAnsi(text));
</script>

{#each spans as span, i (i)}
  {#if span.style}
    <span style={span.style}>{span.content}</span>
  {:else}
    {span.content}
  {/if}
{/each}
