<script lang="ts">
  import * as d3 from "d3";
  import type { TelemetryRow } from "$lib/types";
  import type { Corner } from "$lib/telemetry/corners";
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

  export interface CornerApexDriver {
    tla: string;
    color: string;
    speed: number;
    distance: number;
    isFastest: boolean;
  }

  export interface CornerApexMarker {
    /** Corner key ("9A"), matches `activeCorner`. */
    key: string;
    drivers: CornerApexDriver[];
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
    fill = false,
    unit = "",
    yDomain: customYDomain,
    yTicks,
    lockYAxis = false,
    corners = [],
    apexMarkers = [],
    activeCorner = null,
    isLast = false,
    showLegend = true,
    showCornerLabels = true,
    compact = false,
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
    /** Take the height of the parent box instead of `height`. */
    fill?: boolean;
    unit?: string;
    yDomain?: [number, number];
    yTicks?: number[];
    lockYAxis?: boolean;
    corners?: Corner[];
    apexMarkers?: CornerApexMarker[];
    activeCorner?: string | null;
    isLast?: boolean;
    showLegend?: boolean;
    showCornerLabels?: boolean;
    /** Tighter label row and padding, for a short panel. */
    compact?: boolean;
  }>();

  let width = $state(320);
  // Fill mode: the plot area's measured height. The SVG is absolutely
  // placed inside it, so it can never push its own box bigger.
  let plotHeight = $state(0);
  const svgHeight = $derived(fill ? plotHeight : height);
  // Stacked charts share one distance axis: when filling, only the last
  // chart draws its labels and the others get the space back.
  const showXAxis = $derived(!fill || isLast);
  const margin = $derived({ top: 10, right: 16, bottom: showXAxis ? 20 : 4, left: 45 });

  const innerWidth = $derived(Math.max(0, width - margin.left - margin.right));
  const innerHeight = $derived(
    Math.max(0, svgHeight - margin.top - margin.bottom),
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

  // As many y labels as fit: one per ~22px of plot, between 2 and 5.
  // A plot too short for two gets just its top label.
  const yGridTicks = $derived.by(() => {
    const [yMin, yMax] = yScale.domain();
    const fits = Math.max(2, Math.min(5, Math.floor(innerHeight / 22)));
    let ticks: number[];
    if (yTicks && yTicks.length > 0) {
      const inRange = yTicks.filter((tick: number) => tick >= yMin && tick <= yMax);
      const step = Math.ceil(inRange.length / fits);
      ticks = inRange.filter((_: number, i: number) => i % step === 0);
    } else {
      ticks = yScale.ticks(fits);
    }
    return innerHeight < 44 ? ticks.slice(-1) : ticks;
  });

  // Minimum horizontal gap (px) between corner number labels; closer
  // labels are hidden (the dashed corner line still shows).
  const CORNER_LABEL_MIN_GAP = 16;

  const visibleCorners = $derived.by(() => {
    let lastLabelPx = -Infinity;
    return corners
      .map((c: Corner) => ({ ...c, px: xScale(c.distance) }))
      .filter(
        (c: Corner & { px: number }) => c.px >= 0 && c.px <= innerWidth,
      )
      .sort((a: { px: number }, b: { px: number }) => a.px - b.px)
      .map((c: Corner & { px: number }) => {
        const showLabel = c.px - lastLabelPx >= CORNER_LABEL_MIN_GAP;
        if (showLabel) lastLabelPx = c.px;
        return { ...c, showLabel };
      });
  });

  const visibleApexes = $derived.by(() => {
    if (!apexMarkers || apexMarkers.length === 0) return [];
    return apexMarkers
      .map((m: CornerApexMarker) => ({
        ...m,
        drivers: m.drivers
          .map((d: CornerApexDriver) => ({
            ...d,
            px: xScale(d.distance),
            py: yScale(d.speed),
          }))
          .filter((d: CornerApexDriver & { px: number; py: number }) => d.px >= 0 && d.px <= innerWidth),
      }))
      .filter((m: { drivers: (CornerApexDriver & { px: number; py: number })[] }) => m.drivers.length > 0);
  });

  // One label per corner: the fastest minimum speed, under the corner's
  // lowest dot (above it near the floor). Skipped if it would touch the
  // previous corner's label, unless the corner is active.
  const apexLabels = $derived.by(() => {
    let lastX = -Infinity;
    const out: { key: string; x: number; y: number; text: string; color: string }[] = [];
    for (const m of visibleApexes) {
      const fastest = m.drivers.find((d: { isFastest: boolean }) => d.isFastest) ?? m.drivers[0];
      const lowest = Math.max(...m.drivers.map((d: { py: number }) => d.py));
      const x = fastest.px;
      if (x - lastX < 26 && m.key !== activeCorner) continue;
      lastX = x;
      out.push({
        key: m.key,
        x,
        y: lowest > innerHeight - 16 ? Math.min(...m.drivers.map((d: { py: number }) => d.py)) - 8 : lowest + 14,
        text: String(Math.round(fastest.speed)),
        color: fastest.color,
      });
    }
    return out;
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative w-full min-w-0 max-w-full overflow-hidden {isLast
    ? ''
    : 'border-b border-border'} {compact ? 'py-1' : 'py-3'} select-none {fill ? 'flex h-full flex-col' : ''}"
  bind:clientWidth={width}
>
  <!-- Label + hover readout row -->
  <div class="{compact ? 'mb-0.5' : 'mb-1.5'} flex min-w-0 items-center justify-between gap-2 px-3">
    <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span class="shrink-0 text-xs font-medium text-foreground">
        {label}
        {#if unit}<span class="ml-0.5 font-normal text-muted-foreground">{unit}</span>{/if}
      </span>
      {#if showLegend && series.length > 1}
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {#each series as s}
            <div class="flex items-center gap-1.5 shrink-0">
              <div
                class="h-1.5 w-1.5 rounded-full"
                style="background-color:{s.color}"
              ></div>
              <span
                class="font-mono text-2xs text-muted-foreground"
                >{s.label}</span
              >
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex shrink-0 items-center gap-2 sm:gap-3">
      {#each hoverValues as hv}
        {#if hv.value !== null}
          <span
            class="font-mono text-xs font-medium tabular-nums"
            style={series.length > 1 ? `color:${hv.color}` : ""}
          >
            {hv.value.toFixed(unit === "n" || label === "Gear" || label === "RPM" ? 0 : 1)}
            {#if series.length === 1}{unit}{/if}
          </span>
        {/if}
      {/each}
    </div>
  </div>

  <div
    class={fill ? "relative min-h-0 flex-1" : "contents"}
    bind:clientHeight={plotHeight}
  >
  {#if series.some((s: ChartSeries) => s.data.length > 0)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg
      bind:this={svgRef}
      {width}
      height={svgHeight}
      class="block max-w-full overflow-hidden font-mono {fill ? 'absolute inset-x-0 top-0' : ''}"
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
              font-size="10"
              font-weight="600"
              text-anchor="middle"
              class="font-mono"
              clip-path={`url(#${clipId})`}>{h.label}</text
            >
          {/if}
        {/each}

        <!-- Grid lines -->
        <g>
          {#each yGridTicks as tick}
            <line
              x1="0"
              x2={innerWidth}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="var(--border)"
              stroke-width="1"
            />
            <text
              x="-8"
              y={yScale(tick)}
              font-size="10"
              text-anchor="end"
              alignment-baseline="middle"
              fill="var(--muted-foreground)"
              class="font-mono tabular-nums"
              >{tick}</text
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
            stroke="var(--border-strong)"
            stroke-width="1"
            stroke-dasharray="2,3"
            clip-path={`url(#${clipId})`}
          />
          {#if showCornerLabels && c.showLabel}
            <text
              x={Math.min(innerWidth - 8, Math.max(8, c.px))}
              y={-2}
              font-size="10"
              font-weight="500"
              text-anchor="middle"
              fill="var(--muted-foreground)"
              class="select-none font-mono"
              >{c.key}</text
            >
          {/if}
        {/each}

        <!-- Apex Minimum Speed Markers -->
        {#if visibleApexes.length > 0}
          <g class="apex-markers-layer" clip-path={`url(#${clipId})`}>
            {#each visibleApexes as apex}
              {@const active = activeCorner === apex.key}
              {#each apex.drivers as d}
                <circle
                  cx={d.px}
                  cy={d.py}
                  r={active ? 3.5 : 2.5}
                  fill={d.color}
                  stroke="var(--card)"
                  stroke-width="1.5"
                />
              {/each}
            {/each}
            {#each apexLabels as l (l.key)}
              <text
                x={l.x}
                y={l.y}
                font-size="10"
                font-weight={activeCorner === l.key ? 700 : 500}
                text-anchor="middle"
                fill={l.color}
                stroke="var(--card)"
                stroke-width="3"
                paint-order="stroke"
                class="pointer-events-none font-mono tabular-nums select-none"
              >
                {l.text}
              </text>
            {/each}
          </g>
        {/if}

        <!-- Playhead -->
        {#if playheadX !== null && playheadX >= 0 && playheadX <= innerWidth}
          <line
            x1={playheadX}
            x2={playheadX}
            y1="0"
            y2={innerHeight}
            stroke="var(--foreground)"
            stroke-width="1"
            stroke-opacity="0.35"
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
            class="fill-primary/10 stroke-primary/70"
            stroke-width="1"
            stroke-dasharray="3,2"
            pointer-events="none"
          />
        {/if}

        <!-- X axis -->
        <g transform={`translate(0,${innerHeight})`} visibility={showXAxis ? "visible" : "hidden"}>
          {#each xScale.ticks(Math.max(2, Math.floor(innerWidth / 100))) as tick}
            <text
              x={xScale(tick)}
              y="12"
              font-size="10"
              text-anchor={xScale(tick) > innerWidth - 20
                ? "end"
                : xScale(tick) < 20
                  ? "start"
                  : "middle"}
              fill="var(--muted-foreground)"
              class="font-mono tabular-nums"
            >
              {tick >= 1000 ? (tick / 1000).toFixed(1) + "k" : tick.toFixed(0)}m
            </text>
          {/each}
        </g>
      </g>
    </svg>
  {:else}
    <div
      style="height:{svgHeight}px"
      class="flex w-full items-center justify-center text-xs text-muted-foreground"
    >
      No data
    </div>
  {/if}
  </div>
</div>
