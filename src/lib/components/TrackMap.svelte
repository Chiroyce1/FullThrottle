<script lang="ts">
	import * as d3 from "d3";
	import { untrack } from "svelte";
	import type { TrackCorner } from "$lib/track-corners";

	// ─── Constants ────────────────────────────────────────────────────────
	const MARGIN = 30; // Canvas padding in pixels.
	const TRACK_STROKE_WIDTH = 5; // Track line thickness.
	const DELTA_STROKE_WIDTH = 2; // Speed delta overlay thickness.
	const GLOW_RADIUS = 1; // Outer glow size for driver dots.
	const CORE_RADIUS = 3; // Driver dot size.
	const GLOW_OPACITY = 0; // Glow transparency.
	const CORE_STROKE_WIDTH = 0.5; // Dot outline thickness.
	const TEXT_Y_OFFSET = -12; // Driver label vertical offset in pixels.
	const TEXT_FONT_SIZE = "11px"; // Driver label font size.
	const ZOOM_MIN = 1; // Minimum zoom level.
	const ZOOM_MAX = 10; // Maximum zoom level.
	const VIEWPORT_PADDING_RATIO = 0.25; // Extra viewport padding as track size ratio.
	const CORNER_FONT_SIZE = "11px"; // Corner label font size.
	const CORNER_LABEL_PADDING_X = 2; // Horizontal padding around corner text.
	const CORNER_LABEL_PADDING_Y = 2; // Vertical padding around corner text.
	const CORNER_LABEL_RADIUS_PX = 3; // Corner label background radius.
	const CORNER_OFFSET_PX = TRACK_STROKE_WIDTH / 2 + 10; // Corner label offset from track centerline.
	const CORNER_TANGENT_NUDGE_PX = 5; // Small along-track nudge to reduce overlaps.

	export interface DriverDot {
		id: string;
		label?: string;
		x: number;
		y: number;
		z?: number;
		color: string;
	}

	export interface SpeedDeltaSegment {
		color: string;
		points: { x: number; y: number }[];
	}

	let {
		trackPath = [],
		activeDots = [],
		speedDeltaMode = false,
		speedDeltaSegments = [],
		rotation = $bindable(0),
		showRotationGUI = true,
		showLabels = true,
		corners = [],
	} = $props<{
		trackPath: { x: number; y: number }[];
		activeDots: DriverDot[];
		speedDeltaMode?: boolean;
		speedDeltaSegments?: SpeedDeltaSegment[];
		showRotationGUI?: boolean;
		rotation?: number;
		showLabels?: boolean;
		corners?: TrackCorner[];
	}>();

	function dotLabel(dot: DriverDot): string {
		return dot.label ?? dot.id;
	}

	let container = $state<HTMLDivElement>();

	// Scales are needed by both effects
	let xScale = $state<d3.ScaleLinear<number, number>>();
	let yScale = $state<d3.ScaleLinear<number, number>>();
	let mapGroup = $state<d3.Selection<SVGGElement, unknown, null, undefined>>();
	let rotateGroup =
		$state<d3.Selection<SVGGElement, unknown, null, undefined>>();
	let deltaGroup =
		$state<d3.Selection<SVGGElement, unknown, null, undefined>>();
	let cornersGroup =
		$state<d3.Selection<SVGGElement, unknown, null, undefined>>();
	let dotsGroup = $state<d3.Selection<SVGGElement, unknown, null, undefined>>();

	// Keep track of zoom non-reactively because D3 handles the DOM updates directly
	let currentZoom = 1;

	function cornerMarkerPosition(corner: TrackCorner): { x: number; y: number } {
		if (!xScale || !yScale) return { x: 0, y: 0 };
		const baseX = xScale(corner.x);
		const baseY = yScale(corner.y);
		const angleRad = ((corner.angle ?? 0) * Math.PI) / 180;
		const side = Math.sin((corner.distance ?? 0) / 180) >= 0 ? 1 : -1;
		const normalRad = -angleRad + (side * Math.PI) / 2;
		const tangentRad = -angleRad;
		const zoomComp = currentZoom === 0 ? 1 : 1 / currentZoom;
		const dx =
			Math.cos(normalRad) * CORNER_OFFSET_PX * zoomComp +
			Math.cos(tangentRad) * CORNER_TANGENT_NUDGE_PX * zoomComp;
		const dy =
			Math.sin(normalRad) * CORNER_OFFSET_PX * zoomComp +
			Math.sin(tangentRad) * CORNER_TANGENT_NUDGE_PX * zoomComp;
		return { x: baseX + dx, y: baseY + dy };
	}

	// EFFECT 1: Draw the static track SVG ONLY when trackPath or container mounts
	$effect(() => {
		if (!container || trackPath.length === 0) return;
		// Reading trackPath explicitly to ensure this effect re-runs when the reference changes
		trackPath;
		const curContainer = container;

		untrack(() => {
			// Clear existing SVG entirely
			const containerSelection = d3.select(curContainer);
			containerSelection.selectAll("*").remove();

			// Base scale off the smallest container dimension to ensure 1:1 square
			const size = Math.min(
				curContainer.clientWidth,
				curContainer.clientHeight || curContainer.clientWidth,
			);

			const xExtent = d3.extent(
				trackPath,
				(d: { x: number; y: number }) => d.x,
			) as [number, number];
			const yExtent = d3.extent(
				trackPath,
				(d: { x: number; y: number }) => d.y,
			) as [number, number];

			const xSpan = xExtent[1] - xExtent[0];
			const ySpan = yExtent[1] - yExtent[0];

			const maxDimension = Math.max(xSpan, ySpan) || 1;
			const xMid = (xExtent[1] + xExtent[0]) / 2;
			const yMid = (yExtent[1] + yExtent[0]) / 2;
			const halfRange = maxDimension * (0.5 + VIEWPORT_PADDING_RATIO);

			// Keep a padded square viewport so off-track excursions remain visible.
			const squareXDomain = [xMid - halfRange, xMid + halfRange];
			const squareYDomain = [yMid - halfRange, yMid + halfRange];

			const _xScale = d3
				.scaleLinear()
				.domain(squareXDomain)
				.range([MARGIN, size - MARGIN]);
			// Y-axis inverted in SVG vs physical telemetry coordinates usually
			const _yScale = d3
				.scaleLinear()
				.domain(squareYDomain)
				.range([size - MARGIN, MARGIN]);

			xScale = _xScale;
			yScale = _yScale;

			// Setup D3 Zoom
			const handleZoom = (e: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
				if (mapGroup) {
					// Apply pan and zoom to the inner container
					currentZoom = e.transform.k;

					// D3 zooms originate from mouse position relative to the base SVG
					// The simplest way to apply rotation without breaking D3's native pan/zoom logic
					// is to have the outer container handle Zoom (translate/scale)
					// and the inner group handle static rotation
					mapGroup.attr("transform", `${e.transform}`);

					// Manually update text scale via D3 to avoid Svelte $effect loops
					const scaleFactor = 1 / currentZoom;
					if (cornersGroup) {
						cornersGroup
							.selectAll("g.corner-marker")
							.attr("transform", (d: any) => {
								const pos = cornerMarkerPosition(d);
								return `translate(${pos.x},${pos.y}) rotate(${-rotation}) scale(${scaleFactor})`;
							});
					}
					if (dotsGroup) {
						dotsGroup
							.selectAll("text")
							.attr("transform", `rotate(${-rotation}) scale(${scaleFactor})`);
					}
				}
			};

			const zoom = d3
				.zoom<SVGSVGElement, unknown>()
				.scaleExtent([ZOOM_MIN, ZOOM_MAX])
				.on("zoom", handleZoom);

			const svg = containerSelection
				.append("svg")
				.attr("width", "100%")
				.attr("height", "100%")
				.attr("viewBox", `0 0 ${size} ${size}`)
				.attr("preserveAspectRatio", "xMidYMid meet")
				.call(zoom);

			// Order of operations:
			// 1. Zoom/Pan transformation (mapGroup interacts with mouse natively)
			// 2. Rotation transformation (rotateGroup turns the geometric track data inside the pan window)
			mapGroup = svg.append("g").attr("class", "pan-zoom-container");
			rotateGroup = mapGroup!.append("g").attr("class", "rotation-container");

			untrack(() => {
				// We attach properties here so Svelte knows to reactive-update this rotateGroup externally
				rotateGroup?.attr(
					"transform",
					`rotate(${rotation}, ${size / 2}, ${size / 2})`,
				);
			});

			// Draw track line inside map group
			const lineGenerator = d3
				.line<{ x: number; y: number }>()
				.x((d) => _xScale(d.x))
				.y((d) => _yScale(d.y))
				.curve(d3.curveCatmullRom.alpha(0.5)); // smooth curve

			// Base track layer
			rotateGroup!
				.append("path")
				.datum(trackPath)
				.attr("fill", "none")
				.attr("stroke", "var(--divider)") // adapts to theme
				.attr("stroke-width", TRACK_STROKE_WIDTH)
				.attr("stroke-linejoin", "round")
				.attr("stroke-linecap", "round")
				.attr("d", lineGenerator);

			// Speed delta overlay layer (drawn above base track, below dots)
			deltaGroup = rotateGroup!.append("g").attr("class", "speed-delta-layer");

			// Corner number labels layer (above delta, below dots)
			cornersGroup = rotateGroup!.append("g").attr("class", "corners-layer");

			// Create a persistent layer for dots
			dotsGroup = rotateGroup!.append("g").attr("class", "dots-layer");
		});
	});

	// EFFECT 2: Draw speed-delta overlay segments when comparison data changes
	$effect(() => {
		if (!deltaGroup || !xScale || !yScale) return;

		if (!speedDeltaMode || speedDeltaSegments.length === 0) {
			deltaGroup!.selectAll("path.delta-segment").remove();
			return;
		}

		const validSegments = speedDeltaSegments.filter(
			(seg: SpeedDeltaSegment) => seg.points.length >= 2,
		);

		const lineGenerator = d3
			.line<{ x: number; y: number }>()
			.x((d) => xScale!(d.x))
			.y((d) => yScale!(d.y))
			.curve(d3.curveCatmullRom.alpha(0.5));

		deltaGroup!
			.selectAll<SVGPathElement, SpeedDeltaSegment>("path.delta-segment")
			.data(validSegments, (_d: SpeedDeltaSegment, i: number) => i)
			.join(
				(
					enter: d3.Selection<
						d3.EnterElement,
						SpeedDeltaSegment,
						SVGGElement,
						unknown
					>,
				) =>
					enter
						.append("path")
						.attr("class", "delta-segment")
						.attr("fill", "none")
						.attr("stroke-linejoin", "round")
						.attr("stroke-linecap", "round")
						.attr("stroke-width", DELTA_STROKE_WIDTH)
						.attr("opacity", 0.95)
						.attr("stroke", (d: SpeedDeltaSegment) => d.color)
						.attr("d", (d: SpeedDeltaSegment) => lineGenerator(d.points) ?? ""),
				(
					update: d3.Selection<
						SVGPathElement,
						SpeedDeltaSegment,
						SVGGElement,
						unknown
					>,
				) =>
					update
						.attr("stroke", (d: SpeedDeltaSegment) => d.color)
						.attr("d", (d: SpeedDeltaSegment) => lineGenerator(d.points) ?? ""),
				(exit) => exit.remove(),
			);
	});

	// EFFECT 3: Render & update the dynamic telemetry dots at 60fps
	$effect(() => {
		// Only run if the scales and group are ready
		if (!dotsGroup || !xScale || !yScale) return;

		// Filter out dots with 0,0 coordinates which usually means they are in the pits w/o valid position
		const validDots = activeDots.filter(
			(d: DriverDot) => d.x !== 0 || d.y !== 0,
		);

		if (validDots.length === 0) {
			dotsGroup.selectAll("g.driver-marker").remove();
			return;
		}

		// Data join pattern
		dotsGroup!
			.selectAll<SVGGElement, DriverDot>("g.driver-marker")
			.data(validDots, (d: DriverDot) => d.id)
			.join(
				(
					enter: d3.Selection<d3.EnterElement, DriverDot, SVGGElement, unknown>,
				) => {
					const g = enter.append("g").attr("class", "driver-marker");

					// Outer glow/shadow
					g.append("circle")
						.attr("class", "glow")
						.attr("r", GLOW_RADIUS)
						.attr("fill", (d: DriverDot) => d.color)
						.attr("opacity", GLOW_OPACITY);

					// Inner solid dot
					g.append("circle")
						.attr("class", "core")
						.attr("r", CORE_RADIUS)
						.attr("fill", (d: DriverDot) => d.color)
						.attr("stroke-width", CORE_STROKE_WIDTH)
						.attr("stroke", "rgba(0,0,0,0.2)");

					// Driver Name (TLA) Label
					if (showLabels) {
						const scaleFactor = 1 / currentZoom;
						g.append("text")
							.attr("y", TEXT_Y_OFFSET)
							.attr("text-anchor", "middle")
							.attr("fill", "var(--on-surface)")
							.attr("font-size", TEXT_FONT_SIZE)
							.attr("font-family", "monospace")
							.attr("font-weight", "bold")
							.attr("transform", `rotate(${-rotation}) scale(${scaleFactor})`)
							.text((d: DriverDot) => dotLabel(d));
					}

					return g.attr(
						"transform",
						(d: DriverDot) => `translate(${xScale!(d.x)},${yScale!(d.y)})`,
					);
				},
				(
					update: d3.Selection<SVGGElement, DriverDot, SVGGElement, unknown>,
				) => {
					// Update labels visibility and text if needed.
					// Use .select() instead of .selectAll() to propagate the new data down to the child node!
					const texts = update.select<SVGTextElement>("text");
					if (showLabels) {
						const scaleFactor = 1 / currentZoom;
						// If select returns empty (node doesn't exist), we must append it.
						// Wait, entering nodes are handled. We only need to check if the child exists.
						if (texts.empty()) {
							update
								.append("text")
								.attr("y", TEXT_Y_OFFSET)
								.attr("text-anchor", "middle")
								.attr("fill", "var(--on-surface)")
								.attr("font-size", TEXT_FONT_SIZE)
								.attr("font-family", "monospace")
								.attr("font-weight", "bold")
								.attr("transform", `rotate(${-rotation}) scale(${scaleFactor})`)
								.text((d: DriverDot) => dotLabel(d));
						} else {
							texts
								.attr("transform", `rotate(${-rotation}) scale(${scaleFactor})`)
								.text((d: DriverDot) => dotLabel(d));
						}
					} else {
						texts.remove();
					}

					return update.attr(
						"transform",
						(d: DriverDot) => `translate(${xScale!(d.x)},${yScale!(d.y)})`,
					);
				},
				(exit: d3.Selection<SVGGElement, DriverDot, SVGGElement, unknown>) =>
					exit.remove(),
			);
	});

	// EFFECT 4: Render corner number markers on the track
	$effect(() => {
		if (!cornersGroup || !xScale || !yScale) return;

		if (corners.length === 0) {
			cornersGroup.selectAll("g.corner-marker").remove();
			return;
		}

		const scaleFactor = 1 / currentZoom;

		cornersGroup
			.selectAll<SVGGElement, TrackCorner>("g.corner-marker")
			.data(corners, (d: TrackCorner) => d.number)
			.join(
				(enter) => {
					const g = enter.append("g").attr("class", "corner-marker");

					g.append("rect")
						.attr("class", "corner-label-bg")
						.attr("fill", "rgba(8,12,16,0.55)")
						.attr("stroke", "rgba(230,235,245,0.65)")
						.attr("stroke-width", 0.8)
						.attr("rx", CORNER_LABEL_RADIUS_PX)
						.attr("ry", CORNER_LABEL_RADIUS_PX);

					g.append("text")
						.attr("class", "corner-label-text")
						.attr("text-anchor", "middle")
						.attr("dominant-baseline", "central")
						.attr("fill", "#e8eef5")
						.attr("font-size", CORNER_FONT_SIZE)
						.attr("font-family", "monospace")
						.attr("font-weight", "bold")
						.text((d: TrackCorner) =>
							d.letter ? `${d.number}${d.letter}` : `${d.number}`,
						);

					g.each(function () {
						const group = d3.select(this);
						const text = group.select<SVGTextElement>("text");
						const rect = group.select<SVGRectElement>("rect");
						const bbox = text.node()?.getBBox();
						if (!bbox) return;
						rect
							.attr("x", bbox.x - CORNER_LABEL_PADDING_X)
							.attr("y", bbox.y - CORNER_LABEL_PADDING_Y)
							.attr("width", bbox.width + CORNER_LABEL_PADDING_X * 2)
							.attr("height", bbox.height + CORNER_LABEL_PADDING_Y * 2);
					});

					return g.attr("transform", (d: TrackCorner) => {
						const pos = cornerMarkerPosition(d);
						return `translate(${pos.x},${pos.y}) rotate(${-rotation}) scale(${scaleFactor})`;
					});
				},
				(update) => {
					update
						.select<SVGTextElement>("text.corner-label-text")
						.text((d: TrackCorner) =>
							d.letter ? `${d.number}${d.letter}` : `${d.number}`,
						);

					update.each(function () {
						const group = d3.select(this);
						const text = group.select<SVGTextElement>("text");
						const rect = group.select<SVGRectElement>("rect");
						const bbox = text.node()?.getBBox();
						if (!bbox) return;
						rect
							.attr("x", bbox.x - CORNER_LABEL_PADDING_X)
							.attr("y", bbox.y - CORNER_LABEL_PADDING_Y)
							.attr("width", bbox.width + CORNER_LABEL_PADDING_X * 2)
							.attr("height", bbox.height + CORNER_LABEL_PADDING_Y * 2);
					});

					return update.attr("transform", (d: TrackCorner) => {
						const pos = cornerMarkerPosition(d);
						return `translate(${pos.x},${pos.y}) rotate(${-rotation}) scale(${scaleFactor})`;
					});
				},
				(exit) => exit.remove(),
			);
	});

	// EFFECT 5: Run specific rotation transformations when `rotation` bind changes
	$effect(() => {
		const r = rotation;
		if (!container) return;

		if (rotateGroup) {
			const size = Math.min(
				container?.clientWidth || 0,
				container?.clientHeight || container?.clientWidth || 0,
			);
			rotateGroup.attr("transform", `rotate(${r}, ${size / 2}, ${size / 2})`);
		}

		if (cornersGroup) {
			const scaleFactor = 1 / currentZoom;
			cornersGroup
				.selectAll<SVGGElement, TrackCorner>("g.corner-marker")
				.attr("transform", (d: TrackCorner) => {
					const pos = cornerMarkerPosition(d);
					return `translate(${pos.x},${pos.y}) rotate(${-r}) scale(${scaleFactor})`;
				});
		}

		if (dotsGroup) {
			const scaleFactor = 1 / currentZoom;
			dotsGroup
				.selectAll("text")
				.attr("transform", `rotate(${-r}) scale(${scaleFactor})`);
		}
	});
</script>

<div
	class="relative flex h-full w-full items-center justify-center overflow-hidden"
>
	{#if showRotationGUI}
		<!-- Rotation Control Overlay -->
		<div
			class="absolute right-4 bottom-4 z-20 flex flex-col items-center gap-2 rounded-lg border border-divider bg-surface/80 p-3 backdrop-blur-md"
		>
			<span
				class="font-mono text-[9px] font-bold tracking-widest text-on-surface-subtle uppercase"
				>Rotation</span
			>
			<input
				type="range"
				min="0"
				max="360"
				step="1"
				bind:value={rotation}
				class="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-surface-overlay accent-foreground"
			/>
			<span class="w-8 text-center font-mono text-[10px] text-on-surface"
				>{rotation}°</span
			>
		</div>
	{/if}

	<!-- The core map container entirely driven by D3 now -->
	<div
		class="flex h-full w-full shrink-0 items-center justify-center p-4 lg:p-8"
	>
		<div
			bind:this={container}
			class="flex h-full w-full items-center justify-center"
		></div>
	</div>
</div>
