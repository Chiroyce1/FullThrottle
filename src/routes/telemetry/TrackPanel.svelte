<script lang="ts">
	import TrackMap from "$lib/components/TrackMap.svelte";
	import type { TelemetryState, TelemetryView } from "./state";

	/** Track map with speed-delta colouring and the active-corner readout. */
	let { tm, view }: { tm: TelemetryState; view: TelemetryView } = $props();

	const corner = $derived(view.activeCornerData);
</script>

<div class="relative h-full w-full">
	<TrackMap
		trackPath={tm.trackPath}
		activeDots={view.mapCursor}
		speedDeltaMode={view.speedDeltaMode}
		speedDeltaSegments={view.speedDeltaSegments}
		rotation={0}
		showLabels={false}
		corners={view.visibleCorners}
		activeCorner={view.activeCorner}
		onSelectCorner={view.selectCorner}
		onHoverCorner={view.hoverCorner}
	/>

	{#if corner}
		<div
			class="pointer-events-none absolute top-2.5 left-2.5 z-10 flex items-center gap-2.5 rounded-md border border-border bg-popover/90 px-2.5 py-1.5 font-mono text-xs shadow-lg backdrop-blur-md"
		>
			<span class="font-medium text-foreground"
				>T{corner.corner.key}</span
			>
			<span class="h-3 w-px bg-border" aria-hidden="true"></span>
			{#each corner.speeds as sp (sp.tla)}
				<span class="flex items-center gap-1 tabular-nums">
					<span class="h-1.5 w-1.5 rounded-full" style="background-color: {sp.color}"></span>
					<span class="font-medium" style="color: {sp.color}">{sp.tla}</span>
					<span class={sp.isFastest ? "font-medium text-foreground" : "text-muted-foreground"}
						>{sp.minSpeed}</span
					>
					{#if !sp.isFastest && sp.deltaVsFastest < 0}
						<span class="text-muted-foreground">({sp.deltaVsFastest})</span>
					{/if}
				</span>
			{/each}
		</div>
	{/if}
</div>
