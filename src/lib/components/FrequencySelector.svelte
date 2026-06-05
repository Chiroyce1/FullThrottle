<script lang="ts">
	import { PRESETS, type SampleRate } from "$lib/TelemetryEngine.svelte";

	let {
		onSelect,
		title = "Data Quality",
		description = "Pick once. You can change this later in Settings.",
	} = $props<{
		onSelect?: (hz: SampleRate) => void;
		title?: string;
		description?: string;
	}>();

	function pick(hz: SampleRate) {
		onSelect?.(hz);
	}
</script>

<div class="flex flex-col items-center gap-3">
	<h2 class="text-xl font-black text-on-surface uppercase">{title}</h2>
	<p class="max-w-md text-center text-xs text-on-surface-subtle">
		{description}
	</p>
	<div class="grid w-full max-w-2xl grid-cols-1 gap-3 md:grid-cols-3">
		{#each PRESETS as preset}
			<button
				onclick={() => pick(preset.hz)}
				class="group flex flex-col items-center gap-2 rounded-lg border border-divider bg-surface p-5 transition-all hover:border-on-surface-subtle hover:bg-surface-overlay active:scale-[0.98]"
			>
				<span class="text-2xl font-black tracking-tight text-on-surface"
					>{preset.label}</span
				>
				<span class="text-[11px] text-on-surface-muted">{preset.desc}</span>
				<span class="font-mono text-[10px] text-on-surface-subtle"
					>{preset.reduction}</span
				>
			</button>
		{/each}
	</div>
</div>
