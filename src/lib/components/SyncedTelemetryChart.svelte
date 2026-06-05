<script lang="ts">
	import * as d3 from "d3";
	import type { TelemetryRow } from "$lib/types";
	import type { TrackCorner } from "$lib/track-corners";
	import { mode } from "mode-watcher";

	export interface ChartHighlight {
		start: number;
		end: number;
		color: string;
		label?: string;
	}

	export interface ChartSeries {
		data: TelemetryRow[];
		color: string;
		label: string;
	}

	const {
		series = [],
		yAccessor,
		xAccessor = (d: TelemetryRow) => d.session_time,
		label,
		xDomain,
		onZoom,
		hoverX,
		onHover,
		highlights = [],
		highlightOpacity = 0.15,
		height = 120,
		unit = "",
		yDomain: customYDomain,
		yTicks,
		lockYAxis = false,
		corners = [],
	} = $props<{
		series: ChartSeries[];
		yAccessor: (d: TelemetryRow) => number;
		xAccessor?: (d: TelemetryRow) => number;
		label: string;
		xDomain: [number, number] | null;
		onZoom: (xDomain: [number, number] | null) => void;
		hoverX?: number | null;
		onHover?: (x: number | null) => void;
		highlights?: ChartHighlight[];
		highlightOpacity?: number;
		height?: number;
		unit?: string;
		yDomain?: [number, number];
		yTicks?: number[];
		lockYAxis?: boolean;
		corners?: TrackCorner[];
	}>();

	let width = $state(800);
	const margin = { top: 10, right: 10, bottom: 20, left: 45 };

	const innerWidth = $derived(Math.max(0, width - margin.left - margin.right));
	const innerHeight = $derived(
		Math.max(0, height - margin.top - margin.bottom),
	);

	// ─── X domain ─────────────────────────────────────────────────────────
	const defaultXDomain = $derived.by<[number, number]>(() => {
		if (series.length === 0) return [0, 1];
		let min = Infinity,
			max = -Infinity;
		for (const s of series) {
			if (s.data.length === 0) continue;
			const sMin = xAccessor(s.data[0]);
			const sMax = xAccessor(s.data[s.data.length - 1]);
			if (sMin < min) min = sMin;
			if (sMax > max) max = sMax;
		}
		return min === Infinity ? [0, 1] : [min, max];
	});

	const currentXDomain = $derived(xDomain || defaultXDomain);
	const xScale = $derived(
		d3.scaleLinear().domain(currentXDomain).range([0, innerWidth]),
	);

	// ─── Y domain ─────────────────────────────────────────────────────────
	// localYDomain is only applied when lockYAxis is false
	let localYDomain = $state<[number, number] | null>(null);

	// Reset local y zoom whenever the global x zoom resets (user double-clicked)
	$effect(() => {
		if (xDomain === null) localYDomain = null;
	});

	const yScale = $derived.by(() => {
		let maxVal = 0;
		for (const s of series) {
			const m = d3.max(s.data, yAccessor);
			if (typeof m === "number" && m > maxVal) maxVal = m;
		}
		const base: [number, number] = customYDomain || [0, maxVal || 100];
		// localYDomain only used when NOT locked
		const active = !lockYAxis && localYDomain ? localYDomain : base;
		const span = active[1] - active[0];
		return d3
			.scaleLinear()
			.domain([active[0], active[1] + (span === 0 ? 1 : span * 0.05)])
			.range([innerHeight, 0]);
	});

	const line = $derived(
		d3
			.line<TelemetryRow>()
			.x((d) => xScale(xAccessor(d)))
			.y((d) => yScale(yAccessor(d)))
			.curve(d3.curveMonotoneX)
			.defined((d) => !isNaN(yAccessor(d))),
	);

	const paths = $derived(
		series.map((s: ChartSeries) => ({
			d: line(s.data) || "",
			color: s.color,
			label: s.label,
		})),
	);

	// ─── Drag-to-zoom state ────────────────────────────────────────────────
	// NOTE: all coordinates below are in INNER SVG space (post-margin)
	// because we use a transparent <rect> inside the <g> as the event target.
	let isDragging = $state(false);
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let dragCurX = $state(0);
	let dragCurY = $state(0);
	let svgRef = $state<SVGSVGElement | null>(null);

	// Convert a mouse event to inner SVG coordinates
	function innerCoords(e: MouseEvent): { x: number; y: number } {
		if (!svgRef) return { x: 0, y: 0 };
		const rect = svgRef.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(innerWidth, e.clientX - rect.left - margin.left)),
			y: Math.max(0, Math.min(innerHeight, e.clientY - rect.top - margin.top)),
		};
	}

	function touchCoords(e: TouchEvent): { x: number; y: number } {
		if (!svgRef || e.touches.length === 0) return { x: 0, y: 0 };
		const rect = svgRef.getBoundingClientRect();
		const touch = e.touches[0];
		return {
			x: Math.max(
				0,
				Math.min(innerWidth, touch.clientX - rect.left - margin.left),
			),
			y: Math.max(
				0,
				Math.min(innerHeight, touch.clientY - rect.top - margin.top),
			),
		};
	}

	function handleMouseDown(e: MouseEvent) {
		if (e.button !== 0) return;
		const { x, y } = innerCoords(e);
		isDragging = true;
		dragStartX = x;
		dragStartY = y;
		dragCurX = x;
		dragCurY = y;
		e.preventDefault();
	}

	function handleMouseMove(e: MouseEvent) {
		const { x, y } = innerCoords(e);
		// Always update hover crosshair from x position
		if (onHover) onHover(xScale.invert(x));
		if (!isDragging) return;
		dragCurX = x;
		dragCurY = y;
	}

	function handleMouseUp(_e: MouseEvent) {
		if (!isDragging) return;
		isDragging = false;

		const w = Math.abs(dragCurX - dragStartX);
		const h = Math.abs(dragCurY - dragStartY);

		if (w < 6) {
			// Tiny drag = just a click, ignore
			return;
		}

		// X zoom (always allowed)
		const x1 = Math.min(dragStartX, dragCurX);
		const x2 = Math.max(dragStartX, dragCurX);
		onZoom([xScale.invert(x1), xScale.invert(x2)]);

		// Y zoom (only when axis is not locked AND drag has meaningful height)
		if (!lockYAxis && h > 6) {
			const y1 = Math.min(dragStartY, dragCurY);
			const y2 = Math.max(dragStartY, dragCurY);
			const yTop = yScale.invert(y1);
			const yBottom = yScale.invert(y2);
			localYDomain = [Math.min(yTop, yBottom), Math.max(yTop, yBottom)];
		}
	}

	function handleTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		const { x, y } = touchCoords(e);
		isDragging = true;
		dragStartX = x;
		dragStartY = y;
		dragCurX = x;
		dragCurY = y;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging || e.touches.length !== 1) return;
		const { x, y } = touchCoords(e);
		if (onHover) onHover(xScale.invert(x));
		dragCurX = x;
		dragCurY = y;
	}

	function handleTouchEnd(_e: TouchEvent) {
		if (!isDragging) return;
		isDragging = false;

		const w = Math.abs(dragCurX - dragStartX);
		const h = Math.abs(dragCurY - dragStartY);

		if (w < 6) return;

		const x1 = Math.min(dragStartX, dragCurX);
		const x2 = Math.max(dragStartX, dragCurX);
		onZoom([xScale.invert(x1), xScale.invert(x2)]);

		if (!lockYAxis && h > 6) {
			const y1 = Math.min(dragStartY, dragCurY);
			const y2 = Math.max(dragStartY, dragCurY);
			const yTop = yScale.invert(y1);
			const yBottom = yScale.invert(y2);
			localYDomain = [Math.min(yTop, yBottom), Math.max(yTop, yBottom)];
		}
	}

	function handleMouseLeave() {
		isDragging = false;
		if (onHover) onHover(null);
	}

	function handleDblClick() {
		localYDomain = null;
		onZoom(null);
	}

	// ─── Derived selection rect ────────────────────────────────────────────
	const selRect = $derived.by(() => {
		if (!isDragging) return null;
		const x = Math.min(dragStartX, dragCurX);
		const y = Math.min(dragStartY, dragCurY);
		const w = Math.abs(dragCurX - dragStartX);
		const h = Math.abs(dragCurY - dragStartY);
		if (w < 2) return null;
		return { x, y, w, h };
	});

	// ─── Playhead + hover values ──────────────────────────────────────────
	const playheadX = $derived(hoverX != null ? xScale(hoverX) : null);

	function getValueAt(trace: TelemetryRow[], x: number | null) {
		if (x == null || trace.length === 0) return null;
		const bisect = d3.bisector((d: TelemetryRow) => xAccessor(d)).left;
		const idx = bisect(trace, x);
		const d0 = trace[idx - 1],
			d1 = trace[idx];
		if (!d0) return yAccessor(d1);
		if (!d1) return yAccessor(d0);
		return x - xAccessor(d0) > xAccessor(d1) - x
			? yAccessor(d1)
			: yAccessor(d0);
	}

	const hoverValues = $derived(
		series.map((s: ChartSeries) => ({
			value: getValueAt(s.data, hoverX ?? null),
			color: s.color,
			label: s.label,
		})),
	);

	const visibleHighlights = $derived.by(() =>
		highlights
			.map((h: ChartHighlight) => {
				const x1 = xScale(h.start),
					x2 = xScale(h.end);
				return { ...h, x: Math.min(x1, x2), w: Math.abs(x2 - x1) };
			})
			.filter(
				(h: { x: number; w: number }) => h.x + h.w > 0 && h.x < innerWidth,
			),
	);

	const clipId = `clip-${Math.random().toString(36).slice(2, 7)}`;

	const yGridTicks = $derived.by(() => {
		const [yMin, yMax] = yScale.domain();
		if (yTicks && yTicks.length > 0) {
			return yTicks.filter((tick: number) => tick >= yMin && tick <= yMax);
		}
		return yScale.ticks(4);
	});

	const visibleCorners = $derived.by(() =>
		corners
			.map((c: TrackCorner) => ({ ...c, px: xScale(c.distance) }))
			.filter(
				(c: TrackCorner & { px: number }) => c.px >= 0 && c.px <= innerWidth,
			),
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative w-full border-b border-zinc-900/50 py-4 select-none md:py-4"
	bind:clientWidth={width}
>
	<!-- Label + hover readout row -->
	<div class="mb-1 flex items-center justify-between px-2">
		<div class="flex items-center gap-4">
			<span
				class="text-md font-mono font-bold tracking-widest text-zinc-800 dark:text-zinc-200 uppercase"
			>
				{label}
				{#if unit}<span class="text-zinc-800 dark:text-zinc-200">
						({unit})</span
					>{/if}
			</span>
			{#if series.length > 1}
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					{#each series as s}
						<div class="flex items-center gap-1.5">
							<div
								class="h-1.5 w-1.5 rounded-full"
								style="background-color:{s.color}"
							></div>
							<span
								class="font-mono text-[9px] font-bold text-zinc-500 uppercase"
								>{s.label}</span
							>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-3">
			{#each hoverValues as hv}
				{#if hv.value !== null}
					<span
						class="text-md font-mono font-bold"
						style={series.length > 1 ? `color:${hv.color}` : ""}
					>
						{hv.value.toFixed(unit === "n" ? 0 : 1)}
						{#if series.length === 1}{unit}{/if}
					</span>
				{/if}
			{/each}
		</div>
	</div>

	{#if series.some((s: ChartSeries) => s.data.length > 0)}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<svg
			bind:this={svgRef}
			{width}
			{height}
			class="block overflow-visible font-mono"
			style="cursor: crosshair; touch-action: pan-y;"
			onmousedown={handleMouseDown}
			onmousemove={handleMouseMove}
			onmouseup={handleMouseUp}
			onmouseleave={handleMouseLeave}
			ondblclick={handleDblClick}
			ontouchstart={handleTouchStart}
			ontouchmove={handleTouchMove}
			ontouchend={handleTouchEnd}
			ontouchcancel={handleTouchEnd}
		>
			<defs>
				<clipPath id={clipId}>
					<rect x="0" y="0" width={innerWidth} height={innerHeight} />
				</clipPath>
			</defs>

			<g transform={`translate(${margin.left},${margin.top})`}>
				<!-- Highlights -->
				{#each visibleHighlights as h}
					<rect
						x={h.x}
						y="0"
						width={h.w}
						height={innerHeight}
						fill={h.color}
						fill-opacity={highlightOpacity}
						clip-path={`url(#${clipId})`}
					/>
					{#if h.label && h.w > 40}
						<text
							x={h.x + h.w / 2}
							y="10"
							fill={h.color}
							font-size="8"
							font-weight="bold"
							text-anchor="middle"
							class="tracking-tighter uppercase"
							clip-path={`url(#${clipId})`}>{h.label}</text
						>
					{/if}
				{/each}

				<!-- Grid lines -->
				<g stroke-dasharray="2,2">
					{#each yGridTicks as tick}
						<line
							x1="0"
							x2={innerWidth}
							y1={yScale(tick)}
							y2={yScale(tick)}
							stroke="#27272a"
							stroke-opacity={mode.current === "dark" ? 1 : 0.3}
						/>
						<text
							x="-8"
							y={yScale(tick)}
							fill="#a1a1aa"
							font-size="9"
							text-anchor="end"
							alignment-baseline="middle">{tick}</text
						>
					{/each}
				</g>

				<!-- Data lines -->
				{#each paths as p, idx}
					<path
						d={p.d}
						fill="none"
						stroke={p.color}
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						opacity={idx === 0 ? 1 : 0.7}
						clip-path={`url(#${clipId})`}
					/>
				{/each}

				<!-- Corner markers -->
				{#each visibleCorners as c}
					<line
						x1={c.px}
						x2={c.px}
						y1="0"
						y2={innerHeight}
						stroke={mode.current === "dark" ? "#ffffff" : "#000000"}
						stroke-width="0.5"
						stroke-dasharray="2,3"
						stroke-opacity={1}
						clip-path={`url(#${clipId})`}
					/>
					<text
						x={c.px}
						y={-2}
						fill={mode.current === "dark" ? "#ffffff" : "#000000"}
						fill-opacity={1}
						font-size="7"
						text-anchor="middle"
						class="select-none"
						>{c.letter ? `${c.number}${c.letter}` : c.number}</text
					>
				{/each}

				<!-- Playhead -->
				{#if playheadX !== null && playheadX >= 0 && playheadX <= innerWidth}
					<line
						x1={playheadX}
						x2={playheadX}
						y1="0"
						y2={innerHeight}
						stroke="white"
						stroke-width="1"
						stroke-opacity="0.25"
					/>
					{#each hoverValues as hv}
						{#if hv.value !== null}
							<circle
								cx={playheadX}
								cy={yScale(hv.value)}
								r="3"
								fill={hv.color}
							/>
						{/if}
					{/each}
				{/if}

				<!-- Drag selection rect -->
				{#if selRect}
					<rect
						x={selRect.x}
						y={lockYAxis ? 0 : selRect.y}
						width={selRect.w}
						height={lockYAxis ? innerHeight : selRect.h}
						fill="rgba(255,255,255,0.1)"
						stroke="rgba(255,255,255,0.7)"
						stroke-width="1"
						stroke-dasharray="3,2"
						pointer-events="none"
					/>
				{/if}

				<!-- X axis -->
				<g transform={`translate(0,${innerHeight})`}>
					{#each xScale.ticks(Math.max(2, Math.floor(innerWidth / 100))) as tick}
						<text
							x={xScale(tick)}
							y="12"
							fill="#ffffff"
							font-size="8"
							text-anchor="middle"
						>
							{tick >= 1000 ? (tick / 1000).toFixed(1) + "k" : tick.toFixed(0)}m
						</text>
					{/each}
				</g>
			</g>
		</svg>
	{:else}
		<div
			style="height:{height}px"
			class="flex w-full items-center justify-center font-mono text-xs text-zinc-400"
		>
			No Data
		</div>
	{/if}
</div>
