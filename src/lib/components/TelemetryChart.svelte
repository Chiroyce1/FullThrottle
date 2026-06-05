<script lang="ts">
	import * as d3 from "d3";
	import type { TelemetryRow } from "$lib/types";

	const { data, currentTime, color } = $props<{
		data: TelemetryRow[];
		currentTime: number;
		color: string;
	}>();

	// Dimensions
	let width = $state(800);
	const height = 120;
	const margin = { top: 10, right: 10, bottom: 10, left: 30 };

	const innerWidth = $derived(Math.max(0, width - margin.left - margin.right));
	const innerHeight = Math.max(0, height - margin.top - margin.bottom);

	// Scales
	const xScale = $derived(
		d3
			.scaleLinear()
			.domain(
				data.length > 0
					? [data[0].session_time, data[data.length - 1].session_time]
					: [0, 1],
			)
			.range([0, innerWidth]),
	);

	const yScale = $derived(
		d3
			.scaleLinear()
			.domain([
				0,
				Math.max(
					350,
					d3.max(data, (d: TelemetryRow) => (d.speed as number) || 0) ?? 350,
				),
			])
			.range([innerHeight, 0]),
	);

	// Line generator
	const line = $derived(
		d3
			.line<TelemetryRow>()
			.x((d: TelemetryRow) => xScale(d.session_time))
			.y((d: TelemetryRow) => yScale((d.speed as number) || 0))
			.curve(d3.curveMonotoneX),
	);

	const pathData = $derived(data && data.length > 0 ? line(data) || "" : "");

	// Playhead position
	const playheadX = $derived(xScale(currentTime));
	const isPlayheadVisible = $derived(
		data &&
			data.length > 0 &&
			currentTime >= data[0].session_time &&
			currentTime <= data[data.length - 1].session_time,
	);

	// Find the closest point for the playhead dot
	const currentSpeed = $derived.by(() => {
		if (!data || data.length === 0 || !isPlayheadVisible) return 0;
		// Binary search or simple find. Since it's sorted by time:
		let best = data[0];
		for (let i = 0; i < data.length; i++) {
			if (data[i].session_time >= currentTime) {
				best = data[i];
				break;
			}
		}
		return (best.speed as number) || 0;
	});
</script>

<div
	class="relative w-full rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-xl"
	bind:clientWidth={width}
>
	<div class="mb-2 flex items-center justify-between">
		<span
			class="font-mono text-[10px] font-bold tracking-widest text-zinc-500 uppercase"
			>Current Lap Speed Trace (km/h)</span
		>
	</div>
	{#if data && data.length > 0}
		<svg {width} {height} class="overflow-visible font-mono">
			<g transform={`translate(${margin.left},${margin.top})`}>
				<!-- Grid lines -->
				<g class="text-zinc-800/50" stroke-dasharray="2,2">
					<line
						x1="0"
						x2={innerWidth}
						y1={yScale(100)}
						y2={yScale(100)}
						stroke="currentColor"
					/>
					<line
						x1="0"
						x2={innerWidth}
						y1={yScale(200)}
						y2={yScale(200)}
						stroke="currentColor"
					/>
					<line
						x1="0"
						x2={innerWidth}
						y1={yScale(300)}
						y2={yScale(300)}
						stroke="currentColor"
					/>
				</g>

				<!-- Y Axis Labels -->
				<text
					x="-8"
					y={yScale(100)}
					fill="#71717a"
					font-size="10"
					text-anchor="end"
					alignment-baseline="middle">100</text
				>
				<text
					x="-8"
					y={yScale(200)}
					fill="#71717a"
					font-size="10"
					text-anchor="end"
					alignment-baseline="middle">200</text
				>
				<text
					x="-8"
					y={yScale(300)}
					fill="#71717a"
					font-size="10"
					text-anchor="end"
					alignment-baseline="middle">300</text
				>

				<!-- Data Line -->
				<path
					d={pathData}
					fill="none"
					stroke={color}
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>

				<!-- Playhead -->
				{#if isPlayheadVisible}
					<line
						x1={playheadX}
						x2={playheadX}
						y1="0"
						y2={innerHeight}
						stroke="rgba(255,255,255,0.3)"
						stroke-width="1"
					/>
					<circle
						cx={playheadX}
						cy={yScale(currentSpeed)}
						r="4"
						fill="black"
						stroke={color}
						stroke-width="2.5"
					/>
				{/if}
			</g>
		</svg>
	{:else}
		<div
			class="flex h-30 w-full items-center justify-center font-mono text-xs text-zinc-600"
		>
			No Lap Telemetry Available
		</div>
	{/if}
</div>
