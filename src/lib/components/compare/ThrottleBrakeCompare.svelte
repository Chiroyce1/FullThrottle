<script lang="ts">
	import * as d3 from 'd3';
	import type { TelemetryRow } from '$lib/types';

	let {
		data1 = [],
		data2 = [],
		color1 = '#3b82f6',
		color2 = '#ef4444',
		tla1 = 'D1',
		tla2 = 'D2',
		hoveredDistance = $bindable<number | null>(null)
	} = $props<{
		data1: TelemetryRow[];
		data2: TelemetryRow[];
		color1: string;
		color2: string;
		tla1: string;
		tla2: string;
		hoveredDistance?: number | null;
	}>();

	let width = $state(800);
	const height = 200;
	const margin = { top: 20, right: 20, bottom: 25, left: 45 };

	const innerWidth = $derived(Math.max(0, width - margin.left - margin.right));
	const throttleHeight = 90;
	const brakeHeight = 30;
	const gap = 15;
	const xExtent = $derived.by(() => {
		const ext1 = d3.extent(data1, (d: TelemetryRow) => d.distance);
		const ext2 = d3.extent(data2, (d: TelemetryRow) => d.distance);
		const min = Math.min(ext1[0] ?? Infinity, ext2[0] ?? Infinity);
		const max = Math.max(ext1[1] ?? -Infinity, ext2[1] ?? -Infinity);
		return min === Infinity ? ([0, 1] as [number, number]) : ([min, max] as [number, number]);
	});

	const xScale = $derived(d3.scaleLinear().domain(xExtent).range([0, innerWidth]));
	const throttleY = $derived(d3.scaleLinear().domain([0, 100]).range([throttleHeight, 0]));

	// Throttle line generators
	const throttleLine1 = $derived(
		d3
			.line<TelemetryRow>()
			.x((d: TelemetryRow) => xScale(d.distance))
			.y((d: TelemetryRow) => throttleY(d.throttle || 0))
			.curve(d3.curveMonotoneX)(data1) || ''
	);
	const throttleLine2 = $derived(
		d3
			.line<TelemetryRow>()
			.x((d: TelemetryRow) => xScale(d.distance))
			.y((d: TelemetryRow) => throttleY(d.throttle || 0))
			.curve(d3.curveMonotoneX)(data2) || ''
	);

	// Brake segments - convert boolean brake data to horizontal bars
	function brakeSegments(data: TelemetryRow[]): { x1: number; x2: number }[] {
		const segs: { x1: number; x2: number }[] = [];
		let braking = false;
		let startDist = 0;
		for (const row of data) {
			if (row.brake && !braking) {
				braking = true;
				startDist = row.distance;
			} else if (!row.brake && braking) {
				braking = false;
				segs.push({ x1: startDist, x2: row.distance });
			}
		}
		if (braking && data.length > 0) {
			segs.push({ x1: startDist, x2: data[data.length - 1].distance });
		}
		return segs;
	}

	const brakeSegs1 = $derived(brakeSegments(data1));
	const brakeSegs2 = $derived(brakeSegments(data2));

	const brakeTopY = throttleHeight + gap;

	// Hover state
	const hoverX = $derived(hoveredDistance !== null ? xScale(hoveredDistance) : null);

	const tooltipData = $derived.by(() => {
		if (hoveredDistance === null) return null;

		const bisect = d3.bisector<TelemetryRow, number>((d) => d.distance).left;
		const i1 = Math.min(bisect(data1, hoveredDistance), data1.length > 0 ? data1.length - 1 : 0);
		const i2 = Math.min(bisect(data2, hoveredDistance), data2.length > 0 ? data2.length - 1 : 0);

		return {
			d1Throttle: data1[i1]?.throttle || 0,
			d2Throttle: data2[i2]?.throttle || 0,
			d1Brake: data1[i1]?.brake || false,
			d2Brake: data2[i2]?.brake || false,
			dist: Math.round(hoveredDistance)
		};
	});

	function handleMouseMove(e: MouseEvent) {
		const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
		const mx = e.clientX - rect.left - margin.left;
		if (mx < 0 || mx > innerWidth) {
			hoveredDistance = null;
			return;
		}
		hoveredDistance = xScale.invert(mx);
	}
</script>

<div class="relative flex flex-col pt-2">
	<div class="mb-3 flex items-center justify-between">
		<span class="font-mono text-[10px] font-bold tracking-widest text-on-surface-subtle uppercase"
			>THROTTLE & BRAKE</span
		>
		<div class="flex items-center gap-4">
			<div class="flex items-center gap-1.5">
				<div class="h-0.5 w-4 rounded-full" style="background-color: {color1};"></div>
				<span class="font-mono text-[10px] font-bold text-on-surface-muted">{tla1}</span>
			</div>
			<div class="flex items-center gap-1.5">
				<div class="h-0.5 w-4 rounded-full" style="background-color: {color2};"></div>
				<span class="font-mono text-[10px] font-bold text-on-surface-muted">{tla2}</span>
			</div>
		</div>
	</div>

	{#if data1.length > 0 || data2.length > 0}
		<div class="w-full" bind:clientWidth={width}>
			<svg
				{width}
				{height}
				class="overflow-visible font-mono"
				role="img"
				onmousemove={handleMouseMove}
				onmouseleave={() => {
					hoveredDistance = null;
				}}
			>
				<g transform={`translate(${margin.left},${margin.top})`}>
					<!-- Throttle section -->
				<text
					x="-8"
					y="0"
					fill="var(--on-surface-subtle)"
					font-size="9"
					text-anchor="end"
					alignment-baseline="hanging">100%</text
				>
				<text
					x="-8"
					y={throttleHeight}
					fill="var(--on-surface-subtle)"
					font-size="9"
					text-anchor="end"
					alignment-baseline="baseline">0%</text
				>
				<line
					x1="0"
					x2={innerWidth}
					y1={throttleY(50)}
					y2={throttleY(50)}
					stroke="var(--divider)"
					stroke-dasharray="2,3"
				/>

					{#if throttleLine1}
						<path d={throttleLine1} fill="none" stroke={color1} stroke-width="1.2" opacity="0.85" />
					{/if}
					{#if throttleLine2}
						<path d={throttleLine2} fill="none" stroke={color2} stroke-width="1.2" opacity="0.85" />
					{/if}

					<!-- Label -->
				<text
					x={innerWidth + 5}
					y={throttleHeight / 2}
					fill="var(--on-surface-subtle)"
					font-size="9"
					alignment-baseline="middle">THR</text
				>

					<!-- Brake section -->
				<line
					x1="0"
					x2={innerWidth}
					y1={brakeTopY}
					y2={brakeTopY}
					stroke="var(--divider)"
					stroke-width="0.5"
				/>

					<!-- D1 brakes -->
					{#each brakeSegs1 as seg}
						<rect
							x={xScale(seg.x1)}
							y={brakeTopY + 2}
							width={Math.max(1, xScale(seg.x2) - xScale(seg.x1))}
							height={brakeHeight / 2 - 2}
							fill={color1}
							opacity="0.7"
							rx="1"
						/>
					{/each}

					<!-- D2 brakes -->
					{#each brakeSegs2 as seg}
						<rect
							x={xScale(seg.x1)}
							y={brakeTopY + brakeHeight / 2 + 1}
							width={Math.max(1, xScale(seg.x2) - xScale(seg.x1))}
							height={brakeHeight / 2 - 2}
							fill={color2}
							opacity="0.7"
							rx="1"
						/>
					{/each}

				<text
					x={innerWidth + 5}
					y={brakeTopY + brakeHeight / 2}
					fill="var(--on-surface-subtle)"
					font-size="9"
					alignment-baseline="middle">BRK</text
				>

					<!-- Hover interaction -->
					{#if hoverX !== null && tooltipData}
					<line
						x1={hoverX}
						x2={hoverX}
						y1="0"
						y2={brakeTopY + brakeHeight}
						stroke="var(--on-surface-subtle)"
						stroke-width="1"
						stroke-dasharray="4,4"
					/>

					{@const tooltipRight = hoverX > innerWidth - 100}
					<g transform={`translate(${hoverX + (tooltipRight ? -160 : 10)}, 10)`}>
						<rect width="150" height="60" fill="var(--surface-raised)" rx="4" stroke="var(--divider)" />
						<text x="8" y="14" fill="var(--on-surface-muted)" font-size="9">Distance: {tooltipData.dist}m</text>

						<circle cx="12" cy="30" r="3" fill={color1} />
						<text x="20" y="32" fill="var(--on-surface)" font-size="10" font-weight="bold">
							{tla1} T: {Math.round(tooltipData.d1Throttle)}% B: {tooltipData.d1Brake
								? 'ON'
								: 'OFF'}
						</text>

						<circle cx="12" cy="46" r="3" fill={color2} />
						<text x="20" y="48" fill="var(--on-surface)" font-size="10" font-weight="bold">
							{tla2} T: {Math.round(tooltipData.d2Throttle)}% B: {tooltipData.d2Brake
								? 'ON'
								: 'OFF'}
						</text>
					</g>
					{/if}
				</g>
			</svg>
		</div>
	{:else}
	<div class="flex h-50 items-center justify-center font-mono text-xs text-on-surface-subtle">
		No Telemetry Data
	</div>
	{/if}
</div>
