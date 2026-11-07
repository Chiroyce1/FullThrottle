<script lang="ts">
	import TrackMap from "$lib/components/TrackMap.svelte";
	import { Toggle } from "$lib/components/app";
	import type { ReplayView } from "$lib/replay/replay-view.svelte";
	import WeatherStrip from "./WeatherStrip.svelte";

	/** Live track map with weather, map options and rotation. */
	let { view }: { view: ReplayView } = $props();
</script>

<div class="panel flex h-full min-h-0 flex-col overflow-hidden">
	<div class="no-scrollbar flex shrink-0 items-center overflow-x-auto border-b border-border px-3 py-2">
		<WeatherStrip weather={view.weather} />
	</div>
	<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
		<div class="flex items-center gap-1">
			<Toggle
				pressed={view.showCornersOnMap}
				onclick={() => (view.showCornersOnMap = !view.showCornersOnMap)}>Corners</Toggle
			>
			<Toggle
				pressed={view.showOnlySelectedOnMap}
				onclick={() => (view.showOnlySelectedOnMap = !view.showOnlySelectedOnMap)}
				>Focused only</Toggle
			>
		</div>
		<label class="flex items-center gap-2 text-xs text-muted-foreground">
			Rotate
			<input
				type="range"
				min="0"
				max="360"
				step="1"
				bind:value={view.mapRotation}
				class="h-1.5 w-20 cursor-ew-resize appearance-none rounded-full bg-muted accent-foreground sm:w-24"
			/>
			<span class="w-8 text-right font-mono text-foreground tabular-nums">{view.mapRotation}°</span>
		</label>
	</div>
	<div class="relative min-h-0 flex-1">
		<div class="absolute inset-0">
			<TrackMap
				trackPath={view.engine.trackPath}
				activeDots={view.mapDots}
				corners={view.visibleCorners}
				bind:rotation={view.mapRotation}
			/>
		</div>
	</div>
</div>
