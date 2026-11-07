<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import SEO from "$lib/components/SEO.svelte";
  import AppHeader from "$lib/components/AppHeader.svelte";
  import { LoadingState, Notice } from "$lib/components/app";
  import { settings } from "$lib/settings";
  import type { SampleRate } from "$lib/TelemetryEngine.svelte";
  import ChartToolbar from "./ChartToolbar.svelte";
  import CornerSpeedsTable from "./CornerSpeedsTable.svelte";
  import LapStats from "./LapStats.svelte";
  import SessionBar from "./SessionBar.svelte";
  import TelemetryCharts from "$lib/components/TelemetryCharts.svelte";
  import TelemetryEmptyState from "./TelemetryEmptyState.svelte";
  import TrackPanel from "./TrackPanel.svelte";
  import { TelemetryState, TelemetryView, parseUrlSlots, type YearEntry } from "./state";

  /** Width at which the page becomes a fixed two-column workspace. */
  const DESKTOP = 1024;

  let years = $state<YearEntry[]>([]);
  let innerWidth = $state(DESKTOP);
  const isDesktop = $derived(innerWidth >= DESKTOP);

  const tm = new TelemetryState(() => years);
  const view = new TelemetryView(tm);
  onDestroy(() => tm.dispose());

  const isLoading = $derived(tm.loadFeedback === "loading" || tm.isLoading);

  onMount(() => {
    fetch("/metadata.json")
      .then((r) => r.json() as Promise<{ years: YearEntry[] }>)
      .then((d) => {
        years = d.years;
        const urlSpecs = parseUrlSlots(window.location.search);
        if (urlSpecs) tm.initFromUrl(urlSpecs, settings.dataFrequency as SampleRate);
        else tm.init(settings.dataFrequency as SampleRate, true);
      });

    const onPageHide = () => tm.dispose();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  });

  async function loadData() {
    if (!tm.canLoadData || tm.isLoading) return;
    view.clearInteraction();
    await tm.load(settings.dataFrequency);
  }
</script>

<SEO route="telemetry" />

<svelte:window bind:innerWidth />

<!--
  One layout for every size. DOM order is the narrow-screen order (lap
  summary, map, charts, corners); from lg it becomes a fixed workspace:
  summary and charts in the main column, map and corners in the rail.
  The map spans the summary row plus whatever extra height it needs, so
  the charts start right under the summary.
-->
<div class="flex min-h-dvh w-full flex-col bg-background text-foreground lg:h-dvh lg:overflow-hidden">
  <AppHeader variant="compact">
    {#snippet breadcrumb()}
      <span class="text-foreground">Telemetry</span>
    {/snippet}
  </AppHeader>

  <SessionBar {tm} {view} {years} onload={loadData} />

  {#if isLoading}
    <main class="flex flex-1 p-3"><LoadingState label="Loading telemetry…" class="panel" /></main>
  {:else if !view.hasData}
    <main class="flex flex-1 p-3">
      <div class="panel flex flex-1">
        <TelemetryEmptyState
          slots={tm.slots}
          slotColors={(sid) => tm.color(sid)}
          slotBadge={(sid) => tm.badge(sid)}
          slotDriverName={(sid) => tm.driverName(sid)}
          errorMessage={tm.loadFeedback === "error"
            ? tm.loadErrorMessage || "Failed to load telemetry."
            : ""}
          onload={loadData}
          canLoad={tm.canLoadData}
          isLoading={tm.isLoading}
        />
      </div>
    </main>
  {:else}
    <main
      class="grid grid-cols-1 gap-3 p-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_26rem]"
    >
      <section class="panel overflow-hidden lg:col-start-1 lg:row-start-1" aria-label="Lap summary">
        <LapStats slots={view.lapStats} hudRows={view.hoverRows} />
        {#if view.weakAlignmentTlas.length > 0}
          <Notice>
            Low alignment confidence ({view.weakAlignmentTlas.join(", ")}): traces may not line up
          </Notice>
        {/if}
      </section>

      <section
        class="panel aspect-[4/3] overflow-hidden sm:aspect-[16/9] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:aspect-square"
        aria-label="Track map"
      >
        <TrackPanel {tm} {view} />
      </section>

      <section
        class="panel flex min-h-0 flex-col overflow-hidden lg:col-start-1 lg:row-span-2 lg:row-start-2"
        aria-label="Telemetry charts"
      >
        <ChartToolbar {view} />
        <!-- Absolutely placed on desktop so the charts' height never feeds
             back into the grid rows they are sized from. -->
        <div class="relative min-h-0 flex-1">
          <div class="lg:absolute lg:inset-0">
          <TelemetryCharts
            fill={isDesktop}
            series={view.series}
            highlights={view.licoHighlights}
            xDomain={view.xDomain}
            hoverX={view.hoverDist}
            onZoom={(d) => (view.xDomain = d)}
            onHover={(x) => (view.hoverDist = x)}
            corners={view.visibleCorners}
            apexMarkers={view.apexMarkers}
            activeCorner={view.activeCorner}
          />
          </div>
        </div>
      </section>

      {#if view.hasCornerSpeeds}
        <section
          class="panel flex max-h-[70vh] min-h-0 flex-col overflow-hidden lg:col-start-2 lg:row-start-3 lg:max-h-none"
          aria-label="Corner speeds"
        >
          <CornerSpeedsTable
            rows={view.cornerRows}
            laps={view.cornerLaps}
            activeCorner={view.activeCorner}
            onSelectCorner={view.selectCorner}
            onHoverCorner={view.hoverCorner}
          />
        </section>
      {/if}
    </main>
  {/if}
</div>
