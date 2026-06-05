<script lang="ts">
	import SyncedTelemetryChart, {
		type ChartHighlight,
		type ChartSeries,
	} from "$lib/components/SyncedTelemetryChart.svelte";
	import type { TrackCorner } from "$lib/track-corners";

	interface Props {
		series: ChartSeries[];
		highlights: ChartHighlight[];
		xDomain: [number, number] | null;
		hoverX: number | null;
		onZoom: (domain: [number, number] | null) => void;
		onHover: (x: number | null) => void;
		corners?: TrackCorner[];
	}

	import { CHART_HEIGHT, CHART_HEIGHT_SPEED } from "$lib/constants";

	let {
		series,
		highlights,
		xDomain,
		hoverX,
		onZoom,
		onHover,
		corners = [],
	}: Props = $props();

	let innerWidth = $state(1024);
	let speedHeight = $derived(innerWidth < 768 ? 200 : CHART_HEIGHT_SPEED);
	let normalHeight = $derived(innerWidth < 768 ? 120 : CHART_HEIGHT);
</script>

<svelte:window bind:innerWidth />

<div class="flex flex-col pr-0 md:pr-6">
	<SyncedTelemetryChart
		{series}
		yAccessor={(d) => d.speed || 0}
		xAccessor={(d) => d.distance ?? 0}
		label="Speed"
		unit="km/h"
		{xDomain}
		{hoverX}
		{onZoom}
		{onHover}
		yDomain={[0, 400]}
		yTicks={[0, 100, 200, 300, 400]}
		height={speedHeight}
		{corners}
	/>
	<SyncedTelemetryChart
		{series}
		yAccessor={(d) => d.throttle || 0}
		xAccessor={(d) => d.distance ?? 0}
		label="Throttle"
		unit="%"
		{xDomain}
		{hoverX}
		{onZoom}
		{onHover}
		yDomain={[0, 100]}
		{highlights}
		highlightOpacity={0.35}
		lockYAxis={true}
		height={normalHeight}
		{corners}
	/>
	<SyncedTelemetryChart
		{series}
		yAccessor={(d) => (d.brake ? 100 : 0)}
		xAccessor={(d) => d.distance ?? 0}
		label="Brake"
		unit="%"
		{xDomain}
		{hoverX}
		{onZoom}
		{onHover}
		yDomain={[0, 100]}
		{highlights}
		highlightOpacity={0.35}
		lockYAxis={true}
		height={normalHeight}
		{corners}
	/>
	<SyncedTelemetryChart
		{series}
		yAccessor={(d) => d.rpm || 0}
		xAccessor={(d) => d.distance ?? 0}
		label="RPM"
		{xDomain}
		{hoverX}
		{onZoom}
		{onHover}
		yDomain={[0, 15000]}
		height={normalHeight}
		{corners}
	/>
	<SyncedTelemetryChart
		{series}
		yAccessor={(d) => d.n_gear || 0}
		xAccessor={(d) => d.distance ?? 0}
		label="Gear"
		unit="n"
		{xDomain}
		{hoverX}
		{onZoom}
		{onHover}
		yDomain={[0, 8]}
		lockYAxis={true}
		height={normalHeight}
		{corners}
	/>
</div>
