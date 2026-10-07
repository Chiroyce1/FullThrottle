<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { slide } from "svelte/transition";
  import SEO from "$lib/components/SEO.svelte";
  import TrackMap from "$lib/components/TrackMap.svelte";
  import type {
    ChartHighlight,
    ChartSeries,
    CornerApexMarker,
    CornerApexDriver,
  } from "$lib/components/SyncedTelemetryChart.svelte";
  import { Button } from "$lib/components/ui/button";
  import ModeToggle from "$lib/components/ModeToggle.svelte";
  import { settings } from "$lib/settings";
  import {
    LICO_THROTTLE_THRESHOLD,
    LICO_MIN_DISTANCE,
    LICO_COLOR,
  } from "$lib/constants";
  import SlotRow from "./SlotRow.svelte";
  import LapStats from "./LapStats.svelte";
  import TelemetryCharts from "./TelemetryCharts.svelte";
  import TelemetryEmptyState from "./TelemetryEmptyState.svelte";
  import CornerSpeedsTable from "./CornerSpeedsTable.svelte";
  import { computeCornerSpeeds } from "$lib/telemetry/corner-speeds";
  import { loadTrackCorners, type TrackCorner } from "$lib/track-corners";
  import type { ValidLap } from "$lib/types";

  import { TelemetryState, type YearEntry } from "./state";
  import { rowAtDist, buildSpeedDeltaSegmentsN } from "./telemetry-utils";
  import { alignLapToReference, type LapAlignment } from "$lib/telemetry/align";
  import type { SampleRate } from "$lib/TelemetryEngine.svelte";

  let years = $state<YearEntry[]>([]);
  let innerWidth = $state(1024);
  let selectorsExpanded = $state(true);
  let sidebarWidth = $state(272); // px — default ~md:w-68
  let isResizing = $state(false);
  // Mobile-only tab navigation (desktop keeps the side-by-side layout)
  let mobileTab = $state<"setup" | "charts">("setup");

  function startResize(e: PointerEvent) {
    e.preventDefault();
    isResizing = true;
    const startX = e.clientX;
    const startW = sidebarWidth;

    function onMove(ev: PointerEvent) {
      // dragging left (negative delta) = wider sidebar (capped strictly at 50/50 split)
      const delta = startX - ev.clientX;
      const maxW = Math.floor((innerWidth - 48) * 0.5);
      const minW = Math.min(200, maxW);
      sidebarWidth = Math.max(minW, Math.min(maxW, startW + delta));
    }
    function onUp() {
      isResizing = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  onMount(() => {
    const isMobile = window.innerWidth < 768;
    selectorsExpanded = !isMobile;

    fetch("/metadata.json")
      .then((r) => r.json() as Promise<{ years: YearEntry[] }>)
      .then((d) => {
        years = d.years;
        tm.init(settings.dataFrequency as SampleRate, !isMobile);
      });

    const onPageHide = () => tm.dispose();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  });

  const tm = new TelemetryState(() => years);
  onDestroy(() => tm.dispose());

  let xDomain = $state<[number, number] | null>(null);
  let hoverDist = $state<number | null>(null);

  async function loadData() {
    if (!tm.canLoadData || tm.isLoading) return;
    // On mobile, immediately switch to the charts tab so the user sees instant feedback
    if (innerWidth < 768) {
      mobileTab = "charts";
    }
    hoverDist = null;
    xDomain = null;
    await tm.load(settings.dataFrequency);
    // Ensure we are on the charts tab if data loaded
    if (innerWidth < 768 && tm.slots.some((s) => s.hasLoaded)) {
      mobileTab = "charts";
    }
  }

  let trackCorners = $state<TrackCorner[]>([]);
  let lastCornerLocation = $state("");
  let showCorners = $state(true);
  let showCornerSpeeds = $state(true);
  let showMap = $state(true);

  $effect(() => {
    const rd = tm.roundData(0);
    const location = rd?.location || "";
    if (location === lastCornerLocation) return;
    lastCornerLocation = location;

    if (!location) {
      trackCorners = [];
      return;
    }

    loadTrackCorners(location).then((data) => {
      trackCorners = data?.corners ?? [];
    });
  });

  const allSeries = $derived<ChartSeries[]>(
    tm.slots
      .map((_, sid) => ({
        data: alignedData(sid),
        color: tm.color(sid),
        label: tm.driverTla(sid),
      }))
      .filter((s) => s.data.length > 0),
  );

  // ── Lap alignment ────────────────────────────────────────────────────
  // Lap slices start at slightly different physical points per driver
  // (sampling phase, dropouts at the line, misassigned boundaries in race
  // data). Overlaying raw slices compares different pieces of tarmac, so
  // every non-reference lap is shift-aligned to the reference lap by
  // maximizing speed-trace correlation. Corner speeds don't need this:
  // trough-snapping measures each driver at their own real apex.
  const alignedLaps = $derived.by(() => {
    const raw = tm.slots.map((_, sid) => tm.lapData(sid));
    const refIdx = raw.findIndex((d) => d.length >= 2);
    return raw.map((data, sid) => {
      if (data.length < 2 || sid === refIdx || refIdx < 0) {
        return { rows: data, alignment: null as LapAlignment | null };
      }
      const { rows, alignment } = alignLapToReference(raw[refIdx], data);
      return { rows, alignment };
    });
  });

  function alignedData(sid: number) {
    return alignedLaps[sid]?.rows ?? [];
  }

  // Laps whose traces barely correlate even after shifting (pit laps,
  // broken slices) — flag instead of showing fake-precision overlays.
  const weakAlignments = $derived(
    alignedLaps
      .map((a, sid) => ({ sid, alignment: a.alignment }))
      .filter(
        (x): x is { sid: number; alignment: LapAlignment } =>
          x.alignment !== null && !x.alignment.confident,
      ),
  );

  const allLico = $derived.by<ChartHighlight[]>(() => {
    const out: ChartHighlight[] = [];
    for (const data of allSeries.map((s) => s.data)) {
      let cur: ChartHighlight | null = null;
      for (const row of data) {
        const isLico =
          (row.throttle || 0) < LICO_THROTTLE_THRESHOLD && !row.brake;
        if (isLico) {
          const d = row.distance ?? 0;
          if (!cur)
            cur = { start: d, end: d, color: LICO_COLOR, label: "LiCO" };
          else cur.end = d;
        } else if (cur) {
          if (cur.end - cur.start > LICO_MIN_DISTANCE) out.push(cur);
          cur = null;
        }
      }
      if (cur && cur.end - cur.start > LICO_MIN_DISTANCE) out.push(cur);
    }
    return out;
  });

  const speedDeltaSegments = $derived.by(() => {
    const datasets = tm.slots
      .map((_, sid) => ({ data: alignedData(sid), color: tm.color(sid) }))
      .filter((d) => d.data.length >= 2);

    if (datasets.length < 2) return [];
    return buildSpeedDeltaSegmentsN(datasets);
  });

  const hudRows = $derived(
    tm.slots.map((_, sid) => rowAtDist(alignedData(sid), hoverDist)),
  );
  const slotTlas = $derived(tm.slots.map((_, sid) => tm.driverTla(sid)));

  const activeDots = $derived.by(() => {
    if (hoverDist === null) return [];

    const samples = tm.slots
      .map((_, sid) => {
        const data = alignedData(sid);
        const row = rowAtDist(data, hoverDist);
        if (!row || !Number.isFinite(row.x) || !Number.isFinite(row.y))
          return null;
        if (row.x === 0 && row.y === 0) return null;
        return { sid, row, speed: row.speed ?? 0 };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    if (samples.length === 0) return [];

    const winner = samples.reduce(
      (fastest, s) => (s.speed > fastest.speed ? s : fastest),
      samples[0],
    );
    const speeds = samples.map((s) => s.speed);
    const speedGap = Math.round(Math.max(...speeds) - Math.min(...speeds));

    const label =
      samples.length === 1 || speedGap === 0
        ? tm.driverTla(winner.sid)
        : `${tm.driverTla(winner.sid)} +${speedGap}km/h`;

    return [
      {
        id: "hover-cursor",
        label,
        x: winner.row.x,
        y: winner.row.y,
        z: winner.row.z,
        color: "#ffffff",
      },
    ];
  });

  // ── Per-slot selected lap data (for LapStats) ───────────────────────

  // Grab the ValidLap object for a slot's currently selected lap from metadata.
  function selectedLapData(sid: number): ValidLap | null {
    const slot = tm.slots[sid];
    if (!slot?.driver || !slot.lap || !slot.meta) return null;
    const driverMeta = slot.meta.drivers[slot.driver];
    if (!driverMeta?.valid_laps) return null;
    return driverMeta.valid_laps.find((l: ValidLap) => l.lap_number === slot.lap) ?? null;
  }

  const lapStatsSlots = $derived(
    tm.slots.map((_, sid) => ({
      tla: tm.driverTla(sid),
      color: tm.color(sid),
      lap: selectedLapData(sid),
    })),
  );

  // ── Add Driver button ────────────────────────────────────────────────

  const addDriverLabel = $derived(
    tm.addDriverFeedback === "added" ? "Added" : "Add Driver",
  );

  const addDriverClass = $derived.by(() => {
    const base =
      "h-8 border px-3 font-mono text-xs font-black tracking-widest uppercase transition-all duration-200";
    if (tm.addDriverFeedback === "added")
      return `${base} border-green-500 bg-green-500/15 text-green-400`;
    return `${base} border-divider bg-surface text-on-surface hover:border-primary hover:bg-primary/10 hover:text-primary`;
  });
  const loadButtonClass = $derived.by(() => {
    const base =
      "h-8 border px-5 font-mono text-xs font-black tracking-widest uppercase transition-all disabled:opacity-40";
    if (tm.needsReloadAny) {
      return `${base} border-amber-400 bg-amber-400 text-black hover:bg-transparent hover:text-amber-400 animate-pulse`;
    }
    return `${base} border-primary bg-primary text-primary-foreground hover:bg-transparent hover:text-primary`;
  });

  // ── Corner speeds computation per slot ─────────────────────────────
  const slotCornerSpeeds = $derived(
    tm.slots.map((_, sid) => {
      const data = tm.lapData(sid);
      if (data.length === 0 || trackCorners.length === 0) {
        return {
          tla: tm.driverTla(sid),
          color: tm.color(sid),
          speeds: [],
        };
      }
      return {
        tla: tm.driverTla(sid),
        color: tm.color(sid),
        speeds: computeCornerSpeeds(trackCorners, data),
      };
    }),
  );

  // ── Apex markers: minimum speed points across drivers for chart display ─
  const apexMarkers = $derived.by<CornerApexMarker[]>(() => {
    if (trackCorners.length === 0 || slotCornerSpeeds.length === 0) return [];
    return trackCorners
      .map((c) => {
        const drivers: CornerApexDriver[] = [];
        for (const [si, slot] of slotCornerSpeeds.entries()) {
          const sp = slot.speeds.find(
            (s) => s.corner === c.number && s.letter === (c.letter || ""),
          );
          if (sp && sp.minSpeed !== null && sp.minSpeedDist !== null) {
            // Corner speeds are measured per-lap; shift the marker into the
            // aligned chart frame so dots land on the overlaid traces.
            const shift = alignedLaps[si]?.alignment?.offsetM ?? 0;
            drivers.push({
              tla: slot.tla,
              color: slot.color,
              speed: sp.minSpeed,
              distance: sp.minSpeedDist + shift,
              isFastest: false,
            });
          }
        }
        if (drivers.length > 0) {
          const maxSpeed = Math.max(...drivers.map((d) => d.speed));
          for (const d of drivers) {
            if (Math.round(d.speed) === Math.round(maxSpeed)) {
              d.isFastest = true;
            }
          }
        }
        return {
          corner: c.number,
          letter: c.letter || "",
          label: c.letter ? `${c.number}${c.letter}` : `${c.number}`,
          drivers,
        };
      })
      .filter((ca) => ca.drivers.length > 0);
  });

  // ── Active corner: derived from hover distance on telemetry charts ─
  // When the user scrubs along the charts, find which corner zone they're in
  const CORNER_PROXIMITY = 120; // meters — how close hoverDist must be to a corner
  const activeCorner = $derived.by<number | null>(() => {
    if (hoverDist === null || trackCorners.length === 0) return null;
    let closest: TrackCorner | null = null;
    let closestDist = Infinity;
    for (const c of trackCorners) {
      const d = Math.abs(c.distance - hoverDist);
      if (d < closestDist) {
        closestDist = d;
        closest = c;
      }
    }
    return closest && closestDist <= CORNER_PROXIMITY ? closest.number : null;
  });

  const activeCornerData = $derived.by(() => {
    if (activeCorner == null) return null;
    const corner = trackCorners.find((c) => c.number === activeCorner);
    if (!corner) return null;
    const speeds = slotCornerSpeeds
      .map((s) => {
        const cs = s.speeds.find((sp) => sp.corner === corner.number);
        return {
          tla: s.tla,
          color: s.color,
          minSpeed: cs?.minSpeed ?? null,
        };
      })
      .filter((s): s is { tla: string; color: string; minSpeed: number } => s.minSpeed !== null);
    if (speeds.length === 0) return null;
    const maxSpeed = Math.max(...speeds.map((s) => s.minSpeed));
    return {
      corner,
      speeds: speeds.map((s) => ({
        ...s,
        isFastest: Math.round(s.minSpeed) === Math.round(maxSpeed),
        deltaVsFastest: Math.round(s.minSpeed - maxSpeed),
      })),
    };
  });

  function handleSelectCorner(corner: TrackCorner) {
    const pad = 200;
    const start = Math.max(0, corner.distance - pad);
    const end = corner.distance + pad;
    xDomain = [start, end];
    hoverDist = corner.distance;
  }

  function handleHoverCorner(corner: TrackCorner | null) {
    hoverDist = corner ? corner.distance : null;
  }
</script>

<SEO route="telemetry" />

<svelte:window bind:innerWidth />

<div
  class="flex h-screen max-h-screen w-full flex-col bg-surface text-foreground overflow-hidden"
  class:select-none={isResizing}
  style={isResizing ? "cursor:col-resize" : ""}
>
  <!-- ── HEADER ──────────────────────────────────────────────────────── -->
  <header class="shrink-0 bg-surface">
    <!-- Top bar -->
    <div
      class="flex flex-col md:flex-row md:items-center justify-between border-b border-divider px-4 py-2.5 gap-3 md:gap-0"
    >
      <div
        class="text-xl font-bold text-primary flex justify-between md:justify-start gap-4 items-center"
      >
        <a href="/">FullThrottle</a>
        <ModeToggle />
      </div>

      <div class="hidden md:flex flex-wrap items-center gap-2">

        <Button
          onclick={loadData}
          disabled={!tm.canLoadData || tm.isLoading}
          title={tm.loadHint || "Load telemetry for the selected drivers"}
          class={loadButtonClass}
        >
          {#if tm.isLoading}
            <div class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-1.5"></div>
            Loading…
          {:else}
            Load Data
          {/if}
        </Button>
        <Button
          onclick={() => tm.addSlot()}
          variant="outline"
          class={addDriverClass}>{addDriverLabel}</Button
        >
        <Button
          onclick={() => {
            tm.reset();
            hoverDist = null;
            xDomain = null;
          }}
          variant="outline"
          class="h-8 border-divider bg-surface px-3 font-mono text-xs font-black tracking-widest text-on-surface-subtle uppercase transition-colors hover:border-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
          >Reset</Button
        >
      </div>
    </div>

    <!-- Slot rows toggle (desktop only) -->
    <button
      class="hidden w-full md:flex items-center gap-2 px-4 py-1 text-[10px] font-mono font-bold tracking-wider uppercase text-on-surface-subtle hover:text-on-surface transition-colors border-b border-divider"
      onclick={() => (selectorsExpanded = !selectorsExpanded)}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        class:rotate-180={selectorsExpanded}
        class="transition-transform shrink-0"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      <span>Config</span>
      {#if !selectorsExpanded && slotTlas.length > 0}
        <span class="text-on-surface-muted font-normal normal-case tracking-normal text-[11px]"
          >{slotTlas.filter(Boolean).join(" vs ")}</span
        >
      {/if}
    </button>

    <!-- Slot rows (desktop only — mobile uses the Setup tab) -->
    {#if selectorsExpanded}
      <div
        class="hidden md:block max-h-[42vh] overflow-y-auto custom-scrollbar"
        transition:slide={{ duration: 200 }}
      >
        {#each tm.slots as slot, sid}
          <SlotRow
            {slot}
            {sid}
            {years}
            laps={tm.driverLaps(sid)}
            color={tm.color(sid)}
            isLoaded={slot.hasLoaded}
            isLast={sid === tm.slots.length - 1}
            isOnly={tm.slots.length === 1}
            onremove={() => tm.removeSlot(sid)}
            ontrackchange={(y, r) => tm.setTrack(slot.id, y, r)}
            onsessionchange={(s) => tm.setSession(slot.id, s)}
            ondriverchange={(d) => tm.setDriver(slot.id, d)}
            onlapchange={(l) => tm.setLap(slot.id, l)}
          />
        {/each}
      </div>
    {/if}
  </header>

  <!-- ── Mobile tab bar ─────────────────────────────────────────────── -->
  {#if innerWidth < 768}
    <div
      class="flex shrink-0 items-center bg-surface border-b border-divider"
      role="tablist"
      aria-label="Telemetry sections"
    >
      <button
        role="tab"
        aria-selected={mobileTab === "setup"}
        onclick={() => (mobileTab = "setup")}
        class="h-9 flex-1 font-mono text-[11px] font-black tracking-widest uppercase transition-colors border-b-2 {mobileTab ===
        'setup'
          ? 'border-primary text-on-surface'
          : 'border-transparent text-on-surface-subtle'}"
      >
        Setup
      </button>
      <button
        role="tab"
        aria-selected={mobileTab === "charts"}
        onclick={() => (mobileTab = "charts")}
        class="h-9 flex-1 font-mono text-[11px] font-black tracking-widest uppercase transition-colors border-b-2 {mobileTab ===
        'charts'
          ? 'border-primary text-on-surface'
          : 'border-transparent text-on-surface-subtle'}"
      >
        Charts
      </button>
    </div>
  {/if}

  <!-- ── CHARTS + MAP ─────────────────────────────────────────────────── -->
  {#if innerWidth >= 768}
  <main class="hidden md:flex min-h-0 flex-1 flex-row gap-3 p-3">
    {#if tm.loadFeedback === "loading" || tm.isLoading}
      <div
        class="flex flex-1 items-center justify-center rounded-xl bg-surface py-48"
      >
        <div class="flex flex-col items-center gap-4">
          <div
            class="h-10 w-10 animate-spin rounded-full border-2 border-divider border-t-primary"
          ></div>
          <p
            class="font-mono text-xs tracking-[0.3em] text-on-surface-subtle uppercase"
          >
            Loading telemetry…
          </p>
        </div>
      </div>
    {:else if allSeries.length > 0}
      <!-- ── Charts column ──────────────────────────────────────────── -->
      <div
        class="custom-scrollbar h-full min-h-0 w-full md:flex-1 overflow-y-auto bg-surface transition-opacity duration-200"
        class:opacity-60={tm.isLoading}
      >
        <LapStats slots={lapStatsSlots} {hudRows} />

        {#if weakAlignments.length > 0}
          <p
            class="border-b border-amber-400/30 bg-amber-400/10 px-4 py-1 font-mono text-[10px] tracking-wider text-amber-400 uppercase"
          >
            Low alignment confidence ({weakAlignments
              .map((w) => tm.driverTla(w.sid))
              .join(", ")}) — traces may not line up
          </p>
        {/if}

        <!-- Chart toolbar -->
        <div
          class="flex shrink-0 items-center justify-between border-b border-divider px-3 py-1"
        >
          <div class="flex items-center gap-1.5">
            <button
              onclick={() => (showCorners = !showCorners)}
              class="h-7 px-2 rounded-sm border font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors {showCorners
                ? 'border-border bg-surface-raised text-foreground'
                : 'border-border/40 bg-transparent text-muted-foreground hover:text-foreground'}"
            >
              Corners
            </button>
            <button
              onclick={() => (showCornerSpeeds = !showCornerSpeeds)}
              class="h-7 px-2 rounded-sm border font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors {showCornerSpeeds
                ? 'border-border bg-surface-raised text-foreground'
                : 'border-border/40 bg-transparent text-muted-foreground hover:text-foreground'}"
            >
              Speeds
            </button>

          </div>
          <button
            onclick={() => {
              xDomain = null;
            }}
            disabled={!xDomain}
            class="h-7 px-2 rounded-sm border border-divider font-mono text-[10px] font-semibold tracking-wider text-on-surface-subtle uppercase disabled:opacity-30"
          >
            Reset zoom
          </button>
        </div>

        <TelemetryCharts
          series={allSeries}
          highlights={allLico}
          {xDomain}
          hoverX={hoverDist}
          onZoom={(d) => {
            xDomain = d;
          }}
          onHover={(x) => {
            hoverDist = x;
          }}
          corners={showCorners ? trackCorners : []}
          apexMarkers={(showCorners || showCornerSpeeds) ? apexMarkers : []}
          {activeCorner}
        />


      </div>

      <!-- Drag handle -->
      <div
        role="separator"
        aria-label="Resize sidebar"
        onpointerdown={startResize}
        class="hidden md:flex w-1.5 shrink-0 cursor-col-resize self-stretch items-center justify-center group"
      >
        <div
          class="h-full w-px bg-divider transition-colors group-hover:bg-primary {isResizing
            ? 'bg-primary'
            : ''}"
        ></div>
      </div>

      <!-- ── Right sidebar: Spatial & Corner Intelligence ─────────── -->
      <div
        class="w-full shrink-0 flex flex-col min-h-0 overflow-hidden bg-surface border border-divider"
        style={innerWidth >= 768
          ? `width:${sidebarWidth}px; max-width:50%;`
          : ""}
      >
        <!-- Track map -->
        <div
          class="flex flex-col bg-surface overflow-hidden relative shrink-0 transition-all {showCornerSpeeds && trackCorners.length > 0 && slotCornerSpeeds.some(s => s.speeds.length > 0)
            ? 'h-[40vh] max-h-[380px] min-h-[220px]'
            : 'flex-1 h-full'}"
        >
          <div class="relative w-full h-full">
            <TrackMap
              trackPath={tm.trackPath}
              {activeDots}
              speedDeltaMode={tm.slots.length > 1 &&
                tm.lapData(0).length > 0 &&
                tm.lapData(1).length > 0}
              {speedDeltaSegments}
              rotation={0}
              showRotationGUI={false}
              showLabels={false}
              corners={showCorners ? trackCorners : []}
              {activeCorner}
              onSelectCorner={handleSelectCorner}
              onHoverCorner={handleHoverCorner}
            />

            <!-- Floating Corner Speed HUD pill -->
            {#if activeCornerData}
              <div
                class="pointer-events-none absolute top-2.5 left-2.5 z-10 flex items-center gap-2 rounded-md border border-divider/80 bg-surface/90 px-2.5 py-1.5 shadow-lg backdrop-blur-md"
              >
                <span class="font-mono text-xs font-black text-foreground">
                  T{activeCornerData.corner.letter ? `${activeCornerData.corner.number}${activeCornerData.corner.letter}` : activeCornerData.corner.number}
                </span>
                <div class="h-3 w-px bg-divider"></div>
                <div class="flex items-center gap-2.5">
                  {#each activeCornerData.speeds as sp}
                    <div class="flex items-center gap-1 font-mono text-[10px]">
                      <span class="h-1.5 w-1.5 rounded-full" style="background-color: {sp.color}"></span>
                      <span class="font-bold" style="color: {sp.color}">{sp.tla}</span>
                      <span class="tabular-nums {sp.isFastest ? 'font-bold text-foreground' : 'text-on-surface-muted'}">{Math.round(sp.minSpeed)}</span>
                      {#if !sp.isFastest && sp.deltaVsFastest < 0}
                        <span class="font-mono text-[9px] text-on-surface-subtle tabular-nums">
                          ({sp.deltaVsFastest})
                        </span>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        </div>

        <!-- Corner speeds table (below map) -->
        {#if showCornerSpeeds && trackCorners.length > 0 && slotCornerSpeeds.some(s => s.speeds.length > 0)}
          <div class="flex-1 min-h-0 overflow-hidden border-t border-divider flex flex-col bg-surface">
            <CornerSpeedsTable
              corners={trackCorners}
              slots={slotCornerSpeeds}
              {activeCorner}
              onSelectCorner={handleSelectCorner}
              onHoverCorner={handleHoverCorner}
            />
          </div>
        {/if}
      </div>
    {:else}
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
    {/if}
  </main>
  {:else}
  <!-- ── Mobile panes ─────────────────────────────────────────────────── -->
  <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
    {#if mobileTab === "setup"}
      <div class="flex-1 overflow-y-auto">
        <div
          class="flex items-center justify-between border-b border-divider px-3 py-1.5"
        >
          <span
            class="font-mono text-[11px] font-bold tracking-widest text-on-surface-subtle uppercase"
          >
            Drivers ({tm.slots.length})
          </span>
          <button
            onclick={() => tm.addSlot()}
            title="Add driver"
            aria-label="Add driver"
            class="h-9 w-9 rounded-md border border-divider bg-surface-raised font-mono text-lg font-black leading-none text-on-surface"
          >
            +
          </button>
        </div>
        {#each tm.slots as slot, sid}
          <SlotRow
            {slot}
            {sid}
            {years}
            laps={tm.driverLaps(sid)}
            color={tm.color(sid)}
            isLoaded={slot.hasLoaded}
            isLast={sid === tm.slots.length - 1}
            isOnly={tm.slots.length === 1}
            onremove={() => tm.removeSlot(sid)}
            ontrackchange={(y, r) => tm.setTrack(slot.id, y, r)}
            onsessionchange={(s) => tm.setSession(slot.id, s)}
            ondriverchange={(d) => tm.setDriver(slot.id, d)}
            onlapchange={(l) => tm.setLap(slot.id, l)}
          />
        {/each}
        <div class="p-3">
          <p
            class="text-center font-mono text-[10px] tracking-widest text-on-surface-subtle uppercase"
          >
            Up to 4 drivers can be compared
          </p>
        </div>
      </div>
    {:else}
      {#if tm.loadFeedback === "loading" || tm.isLoading}
        <div class="flex flex-1 items-center justify-center py-24">
          <div class="flex flex-col items-center gap-4">
            <div
              class="h-10 w-10 animate-spin rounded-full border-2 border-divider border-t-primary"
            ></div>
            <p
              class="font-mono text-xs tracking-[0.3em] text-on-surface-subtle uppercase"
            >
              Loading telemetry…
            </p>
          </div>
        </div>
      {:else if allSeries.length > 0}
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden w-full max-w-full">
          <div
            class="flex shrink-0 items-center justify-between border-b border-divider px-3 py-1"
          >
            <div class="flex items-center gap-1.5">
              <button
                onclick={() => (showMap = !showMap)}
                class="h-7 px-2 rounded-sm border font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors {showMap
                  ? 'border-border bg-surface-raised text-foreground'
                  : 'border-border/40 bg-transparent text-muted-foreground'}"
              >
                Map
              </button>
              <button
                onclick={() => (showCorners = !showCorners)}
                class="h-7 px-2 rounded-sm border font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors {showCorners
                  ? 'border-border bg-surface-raised text-foreground'
                  : 'border-border/40 bg-transparent text-muted-foreground'}"
              >
                Corners
              </button>
              <button
                onclick={() => (showCornerSpeeds = !showCornerSpeeds)}
                class="h-7 px-2 rounded-sm border font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors {showCornerSpeeds
                  ? 'border-border bg-surface-raised text-foreground'
                  : 'border-border/40 bg-transparent text-muted-foreground'}"
              >
                Speeds
              </button>
            </div>
            <button
              onclick={() => {
                xDomain = null;
              }}
              disabled={!xDomain}
              class="h-7 px-2 rounded-sm border border-divider font-mono text-[10px] font-semibold tracking-wider text-on-surface-subtle uppercase disabled:opacity-30"
            >
              Reset zoom
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full">
            <!-- Pinned: stats stay visible while charts scroll -->
            <div class="sticky top-0 z-20 bg-surface">
              <LapStats slots={lapStatsSlots} {hudRows} />
              {#if weakAlignments.length > 0}
                <p
                  class="border-b border-amber-400/30 bg-amber-400/10 px-3 py-1 font-mono text-[10px] tracking-wider text-amber-400 uppercase"
                >
                  Low alignment confidence ({weakAlignments
                    .map((w) => tm.driverTla(w.sid))
                    .join(", ")}) — traces may not line up
                </p>
              {/if}
            </div>

            <!-- Track map: centered on page, half height -->
            {#if showMap}
              <div
                class="h-[50vh] min-h-[300px] w-full shrink-0 border-b border-divider/50 bg-surface flex items-center justify-center relative"
              >
                <TrackMap
                  trackPath={tm.trackPath}
                  {activeDots}
                  speedDeltaMode={tm.slots.length > 1 &&
                    tm.lapData(0).length > 0 &&
                    tm.lapData(1).length > 0}
                  {speedDeltaSegments}
                  rotation={0}
                  showRotationGUI={false}
                  showLabels={false}
                  corners={showCorners ? trackCorners : []}
                  {activeCorner}
                  onSelectCorner={handleSelectCorner}
                  onHoverCorner={handleHoverCorner}
                />

                <!-- Floating Corner Speed HUD pill (Mobile) -->
                {#if activeCornerData}
                  <div
                    class="pointer-events-none absolute top-2.5 left-2.5 z-10 flex items-center gap-2 rounded-md border border-divider/80 bg-surface/90 px-2 py-1 shadow-lg backdrop-blur-md"
                  >
                    <span class="font-mono text-xs font-black text-foreground">
                      T{activeCornerData.corner.letter ? `${activeCornerData.corner.number}${activeCornerData.corner.letter}` : activeCornerData.corner.number}
                    </span>
                    <div class="h-3 w-px bg-divider"></div>
                    <div class="flex items-center gap-2">
                      {#each activeCornerData.speeds as sp}
                        <div class="flex items-center gap-1 font-mono text-[9px]">
                          <span class="h-1.5 w-1.5 rounded-full" style="background-color: {sp.color}"></span>
                          <span class="font-bold" style="color: {sp.color}">{sp.tla}</span>
                          <span class="font-semibold text-foreground">{Math.round(sp.minSpeed)}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            <TelemetryCharts
              series={allSeries}
              highlights={allLico}
              {xDomain}
              hoverX={hoverDist}
              onZoom={(d) => {
                xDomain = d;
              }}
              onHover={(x) => {
                hoverDist = x;
              }}
              corners={showCorners ? trackCorners : []}
              apexMarkers={(showCorners || showCornerSpeeds) ? apexMarkers : []}
              {activeCorner}
            />

            {#if showCornerSpeeds && trackCorners.length > 0}
              <CornerSpeedsTable
                corners={trackCorners}
                slots={slotCornerSpeeds}
                {activeCorner}
                onSelectCorner={handleSelectCorner}
                onHoverCorner={handleHoverCorner}
              />
            {/if}
          </div>
        </div>
      {:else}
        <div class="flex-1 overflow-y-auto p-3">
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
      {/if}
    {/if}
  </main>
  <!-- ── Mobile bottom action bar (only on setup or when selection changed) ── -->
  {#if mobileTab === "setup" || tm.needsReloadAny}
    <div
      class="shrink-0 border-t border-divider bg-surface/95 px-3 pt-2 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {#if !tm.isLoading && tm.needsReloadAny}
        <p
          class="mb-1.5 text-center font-mono text-[10px] tracking-widest text-amber-500 uppercase animate-pulse"
        >
          Selection changed — reload to update
        </p>
      {/if}
      <div class="flex">
        <button
          onclick={loadData}
          disabled={!tm.canLoadData || tm.isLoading}
          class="h-10 flex-1 inline-flex items-center justify-center gap-2 rounded-sm border font-mono text-xs font-black tracking-widest uppercase transition-all disabled:opacity-40 {tm.needsReloadAny
            ? 'border-amber-400 bg-amber-400 text-black animate-pulse'
            : 'border-primary bg-primary text-primary-foreground'}"
        >
          {#if tm.isLoading}
            <div
              class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></div>
            Loading…
          {:else}
            {mobileTab === "setup" ? "Load Telemetry" : "Reload Telemetry"}
          {/if}
        </button>
      </div>
    </div>
  {/if}
  {/if}
</div>

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--divider);
    border-radius: 2px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--surface-overlay);
  }
</style>
