<script lang="ts">
  import SyncedTelemetryChart, {
    type ChartHighlight,
    type ChartSeries,
    type CornerApexMarker,
  } from "$lib/components/SyncedTelemetryChart.svelte";
  import type { Corner } from "$lib/telemetry/corners";
  import type { TelemetryRow } from "$lib/types";

  interface Props {
    series: ChartSeries[];
    highlights: ChartHighlight[];
    xDomain: [number, number] | null;
    hoverX: number | null;
    onZoom: (domain: [number, number] | null) => void;
    onHover: (x: number | null) => void;
    corners?: Corner[];
    apexMarkers?: CornerApexMarker[];
    activeCorner?: string | null;
    /**
     * Share the parent's height between the charts (desktop), so speed,
     * throttle and brake are visible together. Otherwise fixed heights and
     * the page scrolls (mobile).
     */
    fill?: boolean;
    /** Which charts to show, by label (all by default). */
    only?: string[];
    /** Smaller minimum heights when filling, for a short panel. */
    compact?: boolean;
  }

  let {
    series,
    highlights,
    xDomain,
    hoverX,
    onZoom,
    onHover,
    corners = [],
    apexMarkers = [],
    activeCorner = null,
    fill = false,
    only,
    compact = false,
  }: Props = $props();

  interface Channel {
    label: string;
    unit?: string;
    y: (d: TelemetryRow) => number;
    yDomain: [number, number];
    yTicks?: number[];
    lockY?: boolean;
    lico?: boolean;
    /** Share of the space when filling, and the least it may get (px). */
    weight: number;
    min: number;
    /** The least it may get in compact mode (px). */
    compactMin: number;
    /** Fixed height when not filling. */
    fixed: number;
  }

  /** A chart's label row and padding above the plot (px). */
  const CHART_CHROME = 44;
  const COMPACT_CHROME = 26;
  /** The distance axis under the last chart, which compact minimums leave out (px). */
  const X_AXIS = 20;

  const allChannels: Channel[] = [
    { label: "Speed", unit: "km/h", y: (d) => d.speed || 0, yDomain: [0, 400], yTicks: [0, 100, 200, 300, 400], weight: 3, min: 150, compactMin: 48, fixed: 200 },
    { label: "Throttle", unit: "%", y: (d) => d.throttle || 0, yDomain: [0, 100], lockY: true, lico: true, weight: 1.5, min: 64, compactMin: 32, fixed: 120 },
    { label: "Brake", unit: "%", y: (d) => (d.brake ? 100 : 0), yDomain: [0, 100], lockY: true, lico: true, weight: 0.8, min: 44, compactMin: 20, fixed: 90 },
    { label: "Gear", y: (d) => d.n_gear || 0, yDomain: [0, 8], lockY: true, weight: 1.1, min: 56, compactMin: 32, fixed: 110 },
    { label: "RPM", y: (d) => d.rpm || 0, yDomain: [0, 15000], weight: 1.1, min: 56, compactMin: 32, fixed: 110 },
  ];

  const channels = $derived(only ? allChannels.filter((c) => only.includes(c.label)) : allChannels);

</script>

<!--
  Fill: each chart gets a flex slot sized only by its weight and a fixed
  minimum (overflow hidden, so its contents can't grow it), and draws to
  fit the slot. If the minimums don't fit, the stack scrolls.
-->
<div class="w-full min-w-0 {fill ? 'custom-scrollbar h-full overflow-x-hidden overflow-y-auto' : ''}">
  <div class="flex w-full min-w-0 flex-col {fill ? 'h-full' : ''}">
    {#each channels as c, i (c.label)}
      <div
        class={fill ? "min-w-0 overflow-hidden" : "contents"}
        style={fill ? `flex: ${c.weight} 1 0px; min-height: ${(compact ? c.compactMin + COMPACT_CHROME : c.min + CHART_CHROME) + (compact && i === channels.length - 1 ? X_AXIS : 0)}px` : ""}
      >
      <SyncedTelemetryChart
        {fill}
        {compact}
        {series}
        yAccessor={c.y}
        xAccessor={(d) => d.distance ?? 0}
        label={c.label}
        unit={c.unit}
        {xDomain}
        {hoverX}
        {onZoom}
        {onHover}
        showLegend={false}
        yDomain={c.yDomain}
        yTicks={c.yTicks}
        lockYAxis={c.lockY ?? false}
        highlights={c.lico ? highlights : []}
        highlightOpacity={0.35}
        height={c.fixed}
        {corners}
        showCornerLabels={i === 0}
        apexMarkers={i === 0 ? apexMarkers : []}
        activeCorner={i === 0 ? activeCorner : null}
        isLast={i === channels.length - 1}
      />
      </div>
    {/each}
  </div>
</div>
