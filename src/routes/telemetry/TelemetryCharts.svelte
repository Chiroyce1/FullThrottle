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
    /** Mobile single-chart switcher (pills). Desktop renders all charts. */
    enableSwitcher?: boolean;
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
    enableSwitcher = false,
  }: Props = $props();

  let innerWidth = $state(1024);
  let speedHeight = $derived(innerWidth < 768 ? 200 : CHART_HEIGHT_SPEED);
  let normalHeight = $derived(innerWidth < 768 ? 120 : CHART_HEIGHT);

  // Mobile chart switcher — one chart at a time instead of a 680px stack.
  // A single visible chart also gets a taller plot for fat-finger scrubbing.
  let active = $state("speed");
  const SWITCHER_CHARTS = [
    { id: "speed", label: "Speed" },
    { id: "throttle", label: "Throttle" },
    { id: "brake", label: "Brake" },
    { id: "rpm", label: "RPM" },
    { id: "gear", label: "Gear" },
    { id: "all", label: "All" },
  ];
  let showAll = $derived(!enableSwitcher || active === "all");
  let showOne = (id: string) => showAll || active === id;
  let singleHeight = (base: number) =>
    enableSwitcher && !showAll ? Math.round(base * 1.3) : base;
</script>

<svelte:window bind:innerWidth />

<div class="flex flex-col pr-0 md:pr-2">
  {#if enableSwitcher}
    <div class="flex gap-1.5 overflow-x-auto px-2 py-2">
      {#each SWITCHER_CHARTS as c}
        <button
          onclick={() => (active = c.id)}
          class="h-9 shrink-0 rounded-md border px-4 font-mono text-[11px] font-bold tracking-wider uppercase transition-colors {active ===
          c.id
            ? 'border-primary bg-primary/15 text-primary'
            : 'border-divider text-on-surface-subtle'}"
        >
          {c.label}
        </button>
      {/each}
    </div>
  {/if}
  {#if showOne("speed")}
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
    height={singleHeight(speedHeight)}
    {corners}
  />
  {/if}
  {#if showOne("throttle")}
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
    height={singleHeight(normalHeight)}
    {corners}
  />
  {/if}
  {#if showOne("brake")}
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
    height={singleHeight(normalHeight)}
    {corners}
  />
  {/if}
  {#if showOne("rpm")}
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
    height={singleHeight(normalHeight)}
    {corners}
  />
  {/if}
  {#if showOne("gear")}
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
    height={singleHeight(normalHeight)}
    {corners}
    isLast={true}
  />
  {/if}
</div>
