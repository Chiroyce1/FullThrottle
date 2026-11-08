<script lang="ts">
	import * as d3 from "d3";
	import { untrack } from "svelte";
	import type { TrackCorner } from "$lib/track-corners";
	import { cornerKey } from "$lib/telemetry/corners";

	// ─── Constants ────────────────────────────────────────────────────────
	const MARGIN = 16; // Canvas padding in pixels.
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
	const VIEWPORT_PADDING_RATIO = 0.08; // Extra viewport padding as track size ratio.
	const CORNER_FONT_SIZE = "9px"; // Corner label font size.
	const CORNER_LABEL_PADDING_X = 2; // Horizontal padding around corner text.
	const CORNER_LABEL_PADDING_Y = 1.5; // Vertical padding around corner text.
	const CORNER_LABEL_RADIUS_PX = 2; // Corner label background radius.
	const CORNER_OFFSET_PX = TRACK_STROKE_WIDTH / 2 + 7; // Corner label offset from track centerline.

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
		showLabels = true,
		corners = [],
		activeCorner = null,
		onSelectCorner,
		onHoverCorner,
	} = $props<{
		trackPath: { x: number; y: number }[];
		activeDots: DriverDot[];
		speedDeltaMode?: boolean;
		speedDeltaSegments?: SpeedDeltaSegment[];
		rotation?: number;
		showLabels?: boolean;
		corners?: TrackCorner[];
		activeCorner?: string | null;
		onSelectCorner?: (corner: TrackCorner) => void;
		onHoverCorner?: (corner: TrackCorner | null) => void;
	}>();

	function dotLabel(dot: DriverDot): string {
		return dot.label ?? dot.id;
	}

	let container = $state<HTMLDivElement>();
	let containerWidth = $state(0);
	let containerHeight = $state(0);

	/**
	 * Track coordinates to SVG pixels, rotation included. Rotating the
	 * coordinates (rather than the SVG group) lets the map be fitted to the
	 * rotated track and keeps every label upright without counter-rotation.
	 */
	type Projection = (x: number, y: number) => [number, number];
	let toScreen = $state<Projection>();
	let mapGroup = $state<d3.Selection<SVGGElement, unknown, null, undefined>>();
	let deltaGroup =
		$state<d3.Selection<SVGGElement, unknown, null, undefined>>();
	let cornersGroup =
		$state<d3.Selection<SVGGElement, unknown, null, undefined>>();
	let dotsGroup = $state<d3.Selection<SVGGElement, unknown, null, undefined>>();

	// Keep track of zoom non-reactively because D3 handles the DOM updates directly
	let currentZoom = 1;
	/**
	 * Label position for a corner. FastF1's `angle` is the direction from the
	 * corner to where its label belongs (track coordinates, y up), which
	 * keeps labels off the racing line and on the outside of the bend.
	 */
	function cornerMarkerPosition(corner: TrackCorner): { x: number; y: number } {
		if (!toScreen) return { x: 0, y: 0 };
		const [x, y] = toScreen(corner.x, corner.y);
		// The label direction turns with the track.
		const rad = (((corner.angle ?? 0) + rotation) * Math.PI) / 180;
		const off = CORNER_OFFSET_PX * (currentZoom === 0 ? 1 : 1 / currentZoom);
		return { x: x + Math.cos(rad) * off, y: y - Math.sin(rad) * off };
	}

	// EFFECT 1: Draw the static track SVG when trackPath mounts or container dimensions change
	$effect(() => {
		if (!container || trackPath.length === 0) return;
		trackPath;
		// Reading dimensions explicitly so effect re-computes on container resize (e.g. sidebar drag)
		const width = containerWidth;
		const height = containerHeight;
		const angle = rotation;
		const curContainer = container;

		untrack(() => {
			// Clear existing SVG entirely
			const containerSelection = d3.select(curContainer);
			containerSelection.selectAll("*").remove();

			const w = Math.round(width || curContainer.clientWidth || 300);
			const h = Math.round(height || curContainer.clientHeight || 300);
			// Rotate counter-clockwise by `angle` (FastF1's convention), then fit
			// the rotated track: uniform pixels per meter, centred, padded.
			const rad = (angle * Math.PI) / 180;
			const cos = Math.cos(rad);
			const sin = Math.sin(rad);
			const rot = (x: number, y: number): [number, number] => [
				x * cos - y * sin,
				x * sin + y * cos,
			];
			const rotated: [number, number][] = trackPath.map((p: { x: number; y: number }) =>
				rot(p.x, p.y),
			);
			const [x0, x1] = d3.extent(rotated, (p) => p[0]) as [number, number];
			const [y0, y1] = d3.extent(rotated, (p) => p[1]) as [number, number];
			const pad = 1 + 2 * VIEWPORT_PADDING_RATIO;
			const innerW = Math.max(w - 2 * MARGIN, 50);
			const innerH = Math.max(h - 2 * MARGIN, 50);
			const ppm = Math.min(
				innerW / (Math.max(x1 - x0, 1) * pad),
				innerH / (Math.max(y1 - y0, 1) * pad),
			);
			const cx = (x0 + x1) / 2;
			const cy = (y0 + y1) / 2;
			const project: Projection = (x, y) => {
				const [rx, ry] = rot(x, y);
				return [w / 2 + (rx - cx) * ppm, h / 2 - (ry - cy) * ppm];
			};
			toScreen = project;

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
								return `translate(${pos.x},${pos.y}) scale(${scaleFactor})`;
							});
					}
					if (dotsGroup) {
						dotsGroup.selectAll("text").attr("transform", `scale(${scaleFactor})`);
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
				.attr("viewBox", `0 0 ${w} ${h}`)
				.attr("preserveAspectRatio", "xMidYMid meet")
				.call(zoom);

			mapGroup = svg.append("g").attr("class", "pan-zoom-container");

			// Draw track line inside map group
			const lineGenerator = d3
				.line<{ x: number; y: number }>()
				.x((d) => project(d.x, d.y)[0])
				.y((d) => project(d.x, d.y)[1])
				.curve(d3.curveCatmullRom.alpha(0.5)); // smooth curve

			// Base track layer
			mapGroup!
				.append("path")
				.datum(trackPath)
				.attr("fill", "none")
				.attr("stroke", "var(--border)") // adapts to theme
				.attr("stroke-width", TRACK_STROKE_WIDTH)
				.attr("stroke-linejoin", "round")
				.attr("stroke-linecap", "round")
				.attr("d", lineGenerator);

			// Speed delta overlay layer (drawn above base track, below dots)
			deltaGroup = mapGroup!.append("g").attr("class", "speed-delta-layer");

			// Corner number labels layer (above delta, below dots)
			cornersGroup = mapGroup!.append("g").attr("class", "corners-layer");

			// Create a persistent layer for dots
			dotsGroup = mapGroup!.append("g").attr("class", "dots-layer");
		});
	});

	// EFFECT 2: Draw speed-delta overlay segments when comparison data changes
	$effect(() => {
		if (!deltaGroup || !toScreen) return;
		const project = toScreen;

		if (!speedDeltaMode || speedDeltaSegments.length === 0) {
			deltaGroup!.selectAll("path.delta-segment").remove();
			return;
		}

		const validSegments = speedDeltaSegments.filter(
			(seg: SpeedDeltaSegment) => seg.points.length >= 2,
		);

		const lineGenerator = d3
			.line<{ x: number; y: number }>()
			.x((d) => project(d.x, d.y)[0])
			.y((d) => project(d.x, d.y)[1])
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
		if (!dotsGroup || !toScreen) return;
		const project = toScreen;

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
							.attr("fill", "var(--foreground)")
							.attr("font-size", TEXT_FONT_SIZE)
							.attr("font-family", "monospace")
							.attr("font-weight", "bold")
							.attr("transform", `scale(${scaleFactor})`)
							.text((d: DriverDot) => dotLabel(d));
					}

					return g.attr(
						"transform",
						(d: DriverDot) => `translate(${project(d.x, d.y).join(",")})`,
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
								.attr("fill", "var(--foreground)")
								.attr("font-size", TEXT_FONT_SIZE)
								.attr("font-family", "monospace")
								.attr("font-weight", "bold")
								.attr("transform", `scale(${scaleFactor})`)
								.text((d: DriverDot) => dotLabel(d));
						} else {
							texts
								.attr("transform", `scale(${scaleFactor})`)
								.text((d: DriverDot) => dotLabel(d));
						}
					} else {
						texts.remove();
					}

					return update.attr(
						"transform",
						(d: DriverDot) => `translate(${project(d.x, d.y).join(",")})`,
					);
				},
				(exit: d3.Selection<SVGGElement, DriverDot, SVGGElement, unknown>) =>
					exit.remove(),
			);
	});

	// EFFECT 4: Render corner number markers on the track
	$effect(() => {
		if (!cornersGroup || !toScreen) return;

		if (corners.length === 0) {
			cornersGroup.selectAll("g.corner-marker").remove();
			return;
		}

		const scaleFactor = 1 / currentZoom;

		cornersGroup
			.selectAll<SVGGElement, TrackCorner>("g.corner-marker")
			.data(corners, (d: TrackCorner) => cornerKey(d))
			.join(
				(enter) => {
					const g = enter
						.append("g")
						.attr("class", "corner-marker")
						.style("cursor", "pointer")
						.on("click", (e, d: TrackCorner) => {
							e.stopPropagation();
							onSelectCorner?.(d);
						})
						.on("mouseenter", (_e, d: TrackCorner) => {
							onHoverCorner?.(d);
						})
						.on("mouseleave", () => {
							onHoverCorner?.(null);
						});

					g.append("rect")
						.attr("class", "corner-label-bg")
						.attr("fill", "var(--card)")
						.attr("stroke", "var(--border)")
						.attr("stroke-width", 0.75)
						.attr("rx", CORNER_LABEL_RADIUS_PX)
						.attr("ry", CORNER_LABEL_RADIUS_PX);

					g.append("text")
						.attr("class", "corner-label-text")
						.attr("text-anchor", "middle")
						.attr("dominant-baseline", "central")
						.attr("fill", "var(--foreground)")
						.attr("font-size", CORNER_FONT_SIZE)
						.attr("font-family", "monospace")
						.attr("font-weight", "bold")
						.text((d: TrackCorner) =>
							cornerKey(d),
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
						return `translate(${pos.x},${pos.y}) scale(${scaleFactor})`;
					});
				},
				(update) => {
					update
						.style("cursor", "pointer")
						.on("click", (e, d: TrackCorner) => {
							e.stopPropagation();
							onSelectCorner?.(d);
						})
						.on("mouseenter", (_e, d: TrackCorner) => {
							onHoverCorner?.(d);
						})
						.on("mouseleave", () => {
							onHoverCorner?.(null);
						});

					update
						.select<SVGTextElement>("text.corner-label-text")
						.text((d: TrackCorner) =>
							cornerKey(d),
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
						return `translate(${pos.x},${pos.y}) scale(${scaleFactor})`;
					});
				},
				(exit) => exit.remove(),
			);
	});

	// EFFECT 4b: Highlight active corner marker
	$effect(() => {
		if (!cornersGroup) return;
		const curActive = activeCorner;
		toScreen; // re-place labels after a redraw
		const scaleFactor = 1 / currentZoom;

		cornersGroup
			.selectAll<SVGGElement, TrackCorner>("g.corner-marker")
			.each(function (d) {
				const group = d3.select(this);
				const isActive = cornerKey(d) === curActive;
				group
					.select<SVGRectElement>("rect.corner-label-bg")
					.attr("fill", isActive ? "var(--accent)" : "var(--card)")
					.attr("stroke", isActive ? "var(--color-primary, #e10600)" : "var(--border)")
					.attr("stroke-width", isActive ? 1.5 : 0.75);
				group
					.select<SVGTextElement>("text.corner-label-text")
					.attr("fill", isActive ? "var(--foreground)" : "var(--foreground)");

				const pos = cornerMarkerPosition(d);
				const s = isActive ? scaleFactor * 1.25 : scaleFactor;
				group.attr("transform", `translate(${pos.x},${pos.y}) scale(${s})`);
			});
	});
</script>

<div
	class="relative flex h-full w-full items-center justify-center overflow-hidden"
>

	<!-- The core map container entirely driven by D3 now -->
	<div
		class="flex h-full w-full shrink-0 items-center justify-center p-2 sm:p-4"
	>
		<div
			bind:this={container}
			bind:clientWidth={containerWidth}
			bind:clientHeight={containerHeight}
			class="flex h-full w-full items-center justify-center"
		></div>
	</div>
</div>
