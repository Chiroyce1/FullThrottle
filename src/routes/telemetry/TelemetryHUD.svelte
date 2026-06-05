<script lang="ts">
	import type { TelemetryRow } from "$lib/types";

	interface Props {
		hudRows: (TelemetryRow | null)[];
		slotColors: string[];
		slotTlas: string[];
	}

	let { hudRows, slotColors, slotTlas }: Props = $props();
</script>

<div
	class="sticky top-0 z-10 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 border-b border-divider bg-surface/90 px-4 py-2 md:py-1.5 backdrop-blur-sm"
>
	<div class="flex flex-wrap items-center gap-3 md:gap-4">
		{#each hudRows as hud, i}
			{#if hud}
				<div class="flex items-center gap-2">
					<span
						class="h-2 w-2 shrink-0 rounded-full"
						style="background:{slotColors[i]}"
					></span>
					<span
						class="font-mono text-xs font-bold"
						style="color:{slotColors[i]}">{slotTlas[i]}</span
					>
					<span class="font-mono text-xs text-on-surface">
						{Math.round(hud.speed || 0)} km/h
					</span>
				</div>
			{/if}
		{/each}
	</div>
	<div class="md:ml-auto font-mono text-xs text-on-surface-muted uppercase hidden md:block">
		click and drag to zoom ⋅ double-click to reset
	</div>
	<div class="font-mono text-[10px] text-on-surface-muted uppercase md:hidden">
		pan to zoom ⋅ tap to reset
	</div>
</div>
