<script lang="ts">
	import * as d3 from "d3";
	import SyncedTelemetryChart from "$lib/components/SyncedTelemetryChart.svelte";
	import CompoundBadge from "$lib/components/CompoundBadge.svelte";
	import { Tween } from "svelte/motion";
	import { linear } from "svelte/easing";
	import { settings } from "$lib/settings";
	import type {
		TelemetryFrameRow,
		TelemetryRow,
		DriverMeta,
		SessionInfo,
		SectorStatus,
	} from "$lib/types";
	import type { NearbyDriverInfo } from "$lib/replay/replay-utils";
	import { formatSectorTime, formatSessionTime } from "$lib/utils";

	let {
		telemetry,
		meta,
		driverId,
		globalTime = 0,
		leaderLap = 1,
		totalLaps,
		sessionInfo,
		year,
		round,
		compact = false,
		lapData = [],
		carAheadInfo = null,
		carBehindInfo = null,
		showOnlySelectedOnMap = $bindable(false),
		showCornersOnMap = $bindable(false),
	} = $props<{
		telemetry: TelemetryFrameRow | undefined;
		meta: DriverMeta | null;
		driverId: string;
		globalTime?: number;
		leaderLap?: number;
		totalLaps?: number;
		sessionInfo?: SessionInfo;
		year?: string;
		round?: string;
		compact?: boolean;
		lapData?: TelemetryRow[];
		carAheadInfo?: NearbyDriverInfo | null;
		carBehindInfo?: NearbyDriverInfo | null;
		showOnlySelectedOnMap?: boolean;
		showCornersOnMap?: boolean;
	}>();

	// One knob to resize the whole speedometer without touching layout classes.
	const SPEEDOMETER_SIZE_MULTIPLIER = 0.82;
	const COMPACT_GAUGE_BASE_REM = 21;
	const STANDARD_GAUGE_BASE_REM = 18;

	// TLA Derivation
	let tlaId = $derived.by(() => {
		if (meta?.name) {
			const nameParts = meta.name.split(" ");
			const lastName = nameParts[nameParts.length - 1];
			return lastName.slice(0, 3).toUpperCase();
		}
		return driverId;
	});

	let showSpeedTrace = $state(false);
	let xDomain = $state<[number, number] | null>(null);
	let hoverX = $state<number | null>(null);

	const lapStartDistance = $derived(lapData[0]?.distance ?? 0);
	const lapDistanceData = $derived(
		lapData.map((row: TelemetryRow) => ({
			...row,
			distance: (row.distance ?? 0) - lapStartDistance,
		})),
	);
	const playheadDistance = $derived.by(() => {
		if (lapDistanceData.length === 0) return null;

		const targetTime = telemetry?.session_time ?? globalTime;
		if (!Number.isFinite(targetTime)) return null;

		let best = lapDistanceData[0];
		for (let i = 1; i < lapDistanceData.length; i++) {
			const row = lapDistanceData[i];
			if (row.session_time >= targetTime) {
				const prev = lapDistanceData[i - 1];
				best =
					targetTime - prev.session_time > row.session_time - targetTime
						? row
						: prev;
				break;
			}
			best = row;
		}

		return Math.max(0, best.distance ?? 0);
	});

	$effect(() => {
		lapData;
		xDomain = null;
		hoverX = null;
	});

	const color = $derived(meta?.color || "#ffffff");
	const speed = $derived(telemetry?.speed ?? telemetry?.Speed ?? 0);
	const gear = $derived(telemetry?.n_gear ?? telemetry?.Gear ?? 0);
	const rpm = $derived(telemetry?.rpm ?? telemetry?.RPM ?? 0);
	const throttle = $derived(telemetry?.throttle ?? telemetry?.Throttle ?? 0);
	const _rawBrake = $derived(telemetry?.brake ?? telemetry?.Brake ?? 0);
	const brake = $derived.by(() => {
		if (typeof _rawBrake === "boolean") return _rawBrake ? 100 : 0;
		const val = Number(_rawBrake);
		return val > 0 && val <= 1 ? val * 100 : val;
	});

	const smoothSpeed = new Tween(0, { duration: 100, easing: linear });
	const smoothRpm = new Tween(0, { duration: 100, easing: linear });
	const smoothThrottle = new Tween(0, { duration: 100, easing: linear });
	const smoothBrake = new Tween(0, { duration: 100, easing: linear });

	$effect(() => {
		smoothSpeed.set(speed, { duration: settings.speedInterpolation ? 100 : 0 });
		smoothRpm.set(rpm, { duration: 100 });
		smoothThrottle.set(throttle, {
			duration: settings.throttleInterpolation ? 100 : 0,
		});
		smoothBrake.set(brake, { duration: settings.brakeInterpolation ? 100 : 0 });
	});

	const formatLapTime = (seconds: number | null | undefined): string => {
		if (!seconds || isNaN(seconds) || seconds === 0) return "---";
		const mins = Math.floor(seconds / 60);
		const secs = (seconds % 60).toFixed(3).padStart(6, "0");
		return mins > 0 ? `${mins}:${secs}` : secs;
	};

	function getSectorColor(state: SectorStatus | undefined): string {
		if (state === "purple") return "bg-purple-500";
		if (state === "green") return "bg-green-500";
		if (state === "yellow") return "bg-yellow-500";
		return "bg-surface-overlay border border-divider";
	}

	const bestLap = $derived(telemetry?._cached_best_lap ?? null);
	const lastLap = $derived(telemetry?._cached_last_lap ?? null);
	const currentLap = $derived(telemetry?._cached_current_lap ?? null);
	const driverName = $derived(meta?.broadcast_name || meta?.name || tlaId);
	const positionDisplay = $derived(telemetry?.position ?? meta?.pos ?? null);
	const fallbackCarAhead = $derived.by(() => {
		if (!positionDisplay || positionDisplay <= 1) return "LEADER";
		return `P${positionDisplay - 1}`;
	});
	const distAhead = $derived(
		carAheadInfo?.distanceToFocused ??
			telemetry?.distance_to_driver_ahead ??
			null,
	);
	const carAhead = $derived(carAheadInfo?.tla ?? fallbackCarAhead);
	const carAheadColor = $derived(carAheadInfo?.color ?? "#ffffff");
	const carBehind = $derived(carBehindInfo?.tla ?? "---");
	const carBehindColor = $derived(carBehindInfo?.color ?? "#ffffff");
	const gaugeMaxWidth = $derived.by(() => {
		const maxWidthRem = compact
			? COMPACT_GAUGE_BASE_REM * SPEEDOMETER_SIZE_MULTIPLIER
			: STANDARD_GAUGE_BASE_REM * SPEEDOMETER_SIZE_MULTIPLIER;
		return `${maxWidthRem.toFixed(2)}rem`;
	});
	const compound = $derived(telemetry?.compound ?? "UNKNOWN");

	// Arc & Gauge Math
	const cx = 80;
	const cy = 85;

	// Speed Arc
	const speedRadius = 65;
	const speedStartDeg = 145;
	const speedEndDeg = 395;
	const speedArcLen =
		(speedRadius * (speedEndDeg - speedStartDeg) * Math.PI) / 180;

	// Pedal Arcs
	const pedalRadius = 52;
	const pedalSweepDeg = 124;
	const thrStartDeg = speedStartDeg;
	const thrEndDeg = speedStartDeg + pedalSweepDeg;

	const brkEndDeg = speedEndDeg;
	const brkStartDeg = speedEndDeg - pedalSweepDeg;
	const pedalArcLen = (pedalRadius * pedalSweepDeg * Math.PI) / 180;

	const createArc = (
		r: number,
		startDeg: number,
		endDeg: number,
		anticlockwise = false,
	) => {
		const p = d3.path();
		p.arc(
			cx,
			cy,
			r,
			startDeg * (Math.PI / 180),
			endDeg * (Math.PI / 180),
			anticlockwise,
		);
		return p.toString();
	};

	const speedBgPath = createArc(speedRadius, speedStartDeg, speedEndDeg);
	const thrBgPath = createArc(pedalRadius, thrStartDeg, thrEndDeg);
	const brkBgPath = createArc(pedalRadius, brkEndDeg, brkStartDeg, true);
	const brkTextPath = createArc(pedalRadius, brkStartDeg, brkEndDeg, false);
</script>

<div
	class={`flex w-full flex-col gap-0 overflow-hidden ${compact ? "bg-background" : "rounded-lg border border-divider bg-surface shadow-xl"}`}
>
	{#if !compact}
		<!-- Top Bar: Event Info, Session Clock & Lap Count -->
		<div
			class="flex items-center justify-between border-b border-divider bg-surface-raised/60 px-6 py-3"
		>
			<!-- Event Info -->
			<div class="flex shrink-0 items-center gap-4">
				<h1
					class="text-sm font-bold tracking-wider text-on-surface uppercase md:text-base"
				>
					{#if sessionInfo}
						{sessionInfo.name}
						<span class="ml-1 text-red-600">{sessionInfo.type}</span>
					{:else}
						Full<span class="text-on-surface-muted">Throttle</span>
						<span class="text-red-600">Telemetry</span>
					{/if}
				</h1>
				{#if year && round}
					<div class="hidden gap-2 md:flex">
						<span
							class="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-[10px] text-on-surface uppercase"
							>{year}</span
						>
						<span
							class="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-[10px] text-on-surface uppercase"
							>Rnd {round}</span
						>
						<span
							class="rounded border border-red-900/50 bg-red-900/40 px-1.5 py-0.5 font-mono text-[10px] text-red-500 uppercase"
							>REPLAY</span
						>
					</div>
				{/if}
			</div>

			<!-- Timing & Laps -->
			<div class="flex shrink-0 items-center gap-6">
				<div class="flex items-baseline gap-2">
					<span
						class="font-mono text-[10px] font-bold tracking-widest text-on-surface-subtle uppercase"
						>TIME</span
					>
					<span class="font-mono text-base font-bold text-on-surface"
						>{formatSessionTime(globalTime)}</span
					>
				</div>
				<div class="flex items-baseline gap-2">
					<span
						class="font-mono text-[10px] font-bold tracking-widest text-on-surface-subtle uppercase"
						>LAP</span
					>
					<span class="font-mono text-base font-bold text-on-surface">
						{leaderLap}
						{#if totalLaps}
							<span class="text-on-surface-subtle">/{totalLaps}</span>
						{/if}
					</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Main Telemetry Data Row -->
	<div
		class={`flex items-center justify-between gap-4 ${compact ? "flex-col py-1 md:flex-row md:items-stretch" : "flex-col p-4 md:flex-row"}`}
	>
		{#if !compact}
			<!-- Driver Identity -->
			<div class="flex min-w-35 shrink-0 items-center gap-3">
				<div
					class="h-8 w-1.5 rounded-full"
					style="background-color: {color};"
				></div>
				<div class="flex flex-col justify-center">
					<div class="flex w-full items-center gap-3">
						<span
							class="font-mono text-2xl leading-none font-black tracking-widest text-on-surface"
						>
							{tlaId}
						</span>
						<span
							class="mt-0.5 font-mono text-lg font-bold text-on-surface-muted"
						>
							{driverId}
						</span>
					</div>
					<div class="flex items-center gap-2 mt-1 font-mono text-[11px]">
						<span class="font-bold text-on-surface"
							>P{positionDisplay ?? "-"}</span
						>
						{#if telemetry?.time_gap !== undefined && positionDisplay !== 1}
							<span class="text-on-surface-muted"
								>+{telemetry.time_gap.toFixed(3)}</span
							>
						{/if}
						{#if telemetry?.gap_to_leader !== undefined && Math.abs(telemetry.gap_to_leader - (telemetry.time_gap ?? 0)) > 0.001 && positionDisplay !== 1}
							<span class="text-on-surface-subtle text-[9px]"
								>LDR +{telemetry.gap_to_leader.toFixed(3)}</span
							>
						{/if}
					</div>
				</div>
			</div>
		{:else}
			<!-- Compact Driver Info Table -->
			<div class="w-full md:w-1/2 md:self-stretch md:pr-2">
				<div
					class="flex h-full flex-col rounded-md border border-divider bg-surface-raised/40 p-3"
				>
					<div
						class="flex items-center justify-between gap-2 border-b border-divider pb-2"
					>
						<div class="flex items-center gap-2">
							<div
								class="h-7 w-1.5 rounded-full"
								style="background-color: {color};"
							></div>
							<div class="flex items-baseline gap-2">
								<span
									class="font-mono text-xl font-black tracking-wider text-on-surface"
									>{tlaId}</span
								>
								<span
									class="font-mono text-xs font-semibold text-on-surface-muted"
									>{driverName}</span
								>
							</div>
						</div>
						<div class="ml-auto flex items-center gap-3">
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									bind:checked={showOnlySelectedOnMap}
									class="h-3.5 w-3.5 cursor-pointer rounded border border-divider bg-surface-overlay"
								/>
								<span
									class="font-mono text-[9px] font-bold tracking-widest text-on-surface-subtle uppercase"
									>Hide others</span
								>
							</label>
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									bind:checked={showCornersOnMap}
									class="h-3.5 w-3.5 cursor-pointer rounded border border-divider bg-surface-overlay"
								/>
								<span
									class="font-mono text-[9px] font-bold tracking-widest text-on-surface-subtle uppercase"
									>{showCornersOnMap ? "Corners ON" : "Corners OFF"}</span
								>
							</label>
						</div>
					</div>

					<div class="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
						<div>
							<div
								class="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase"
							>
								Car #
							</div>
							<div class="font-mono font-bold text-foreground">#{driverId}</div>
						</div>
						<div>
							<div
								class="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase"
							>
								Pos
							</div>
							<div class="font-mono font-bold text-foreground">
								{positionDisplay ? `P${positionDisplay}` : "---"}
							</div>
						</div>
						<div>
							<div
								class="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase"
							>
								Compound
							</div>
							<div class="flex items-center gap-2 font-mono text-foreground">
								<CompoundBadge {compound} size={32} />
								<span>{telemetry.tyre_life} laps</span>
							</div>
						</div>
						<div>
							<div
								class="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase"
							>
								Ahead
							</div>
							<div class="flex items-baseline gap-1.5">
								<div
									class="font-mono font-bold leading-tight"
									style={`color: ${carAheadColor};`}
								>
									{carAhead}
								</div>
								{#if telemetry?.time_gap !== undefined && telemetry.position !== 1}
									<div class="font-mono text-[9px] text-on-surface-muted">
										+{telemetry.time_gap.toFixed(3)}
									</div>
								{/if}
							</div>
						</div>
						<div>
							<div
								class="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase"
							>
								Behind
							</div>
							<div class="flex items-baseline gap-1.5">
								<div
									class="font-mono font-bold leading-tight"
									style={`color: ${carBehindColor};`}
								>
									{carBehind}
								</div>
								{#if carBehindInfo?.row?.time_gap !== undefined}
									<div class="font-mono text-[9px] text-on-surface-muted">
										+{carBehindInfo.row.time_gap.toFixed(3)}
									</div>
								{/if}
							</div>
						</div>
						<div>
							<div
								class="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase"
							>
								Lap
							</div>
							<div class="font-mono text-foreground">
								{telemetry?.lap_number || leaderLap}
							</div>
						</div>
					</div>

					<div class="mt-3 border-t border-divider pt-2">
						<button
							class="flex w-full items-center justify-between transition-colors hover:opacity-90"
							onclick={() => (showSpeedTrace = !showSpeedTrace)}
						>
							<span
								class="font-mono text-[10px] font-bold tracking-widest text-on-surface-subtle uppercase"
								>Speed Trace</span
							>
							<div class="flex items-center gap-3">
								{#if bestLap && bestLap > 0}
									<div class="flex items-center gap-1">
										<span class="text-[8px] font-bold text-on-surface-subtle"
											>BEST</span
										>
										<span
											class="font-mono text-[10px] font-bold {telemetry?._is_purple
												? 'text-purple-400'
												: 'text-on-surface-muted'}"
										>
											{formatLapTime(bestLap)}
										</span>
									</div>
								{/if}
								{#if currentLap && currentLap > 0}
									<div class="flex items-center gap-1">
										<span class="text-[8px] font-bold text-on-surface-subtle"
											>CURRENT</span
										>
										<span class="font-mono text-[10px] text-on-surface-muted">
											{formatLapTime(currentLap)}
										</span>
									</div>
								{/if}
								{#if lastLap && lastLap > 0 && lastLap !== bestLap}
									<div class="hidden items-center gap-1 sm:flex">
										<span class="text-[8px] font-bold text-on-surface-subtle"
											>PREV</span
										>
										<span class="font-mono text-[10px] text-on-surface-muted">
											{formatLapTime(lastLap)}
										</span>
									</div>
								{/if}
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="text-on-surface-subtle transition-transform duration-200"
									style="transform: rotate({showSpeedTrace
										? '180deg'
										: '0deg'})"
								>
									<polyline points="6 9 12 15 18 9" />
								</svg>
							</div>
						</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Unified F1 Telemetry Dashboard -->
		<div
			class={`py-4 flex w-full items-center justify-center ${compact ? "md:w-1/2 md:justify-center md:pl-2" : "flex-1 border-l border-divider pl-0 md:pl-6"}`}
		>
			<div
				class={`relative flex aspect-4/3 w-full items-center justify-center overflow-visible ${compact ? "-mt-4 md:-mt-6" : ""}`}
				style={`max-width: ${gaugeMaxWidth};`}
			>
				<!-- Background SVGs -->
				<svg
					viewBox="0 0 160 120"
					class="absolute inset-0 h-full w-full overflow-visible"
				>
					<!-- Outer Speed Arc -->
					<path
						d={speedBgPath}
						fill="none"
						class="stroke-surface-overlay"
						stroke-width="10"
					/>
					<!-- Speed Arc Fill -->
					<path
						d={speedBgPath}
						fill="none"
						stroke="#3b82f6"
						stroke-width="10"
						// stroke-linecap="round"
						stroke-dasharray={speedArcLen}
						stroke-dashoffset={speedArcLen -
							(speedArcLen * Math.min(smoothSpeed.current, 360)) / 360}
					/>

					<!-- Speed Markers (Now drawn Over the Fill) -->
					{#each [50, 100, 150, 200, 250, 300, 350] as tick}
						{@const angle =
							(speedStartDeg + (tick / 360) * (speedEndDeg - speedStartDeg)) *
							(Math.PI / 180)}
						{@const tx = cx + speedRadius * Math.cos(angle)}
						{@const ty = cy + speedRadius * Math.sin(angle)}
						<text
							x={tx}
							y={ty + 2}
							class="fill-foreground text-[5px] font-mono font-bold"
							text-anchor="middle"
							alignment-baseline="central"
						>
							{tick}
						</text>
					{/each}

					<!-- Left Bar: Throttle (Green) -->
					<path
						id="thrPath-{driverId}"
						d={thrBgPath}
						fill="none"
						class="stroke-surface-overlay"
						stroke-width="10"
					/>
					<path
						d={thrBgPath}
						fill="none"
						stroke="#22c55e"
						stroke-width="10"
						// stroke-linecap="round"
						stroke-dasharray={pedalArcLen}
						stroke-dashoffset={pedalArcLen -
							(pedalArcLen * Math.min(smoothThrottle.current, 100)) / 100}
					/>
					<text
						dy="2"
						class="fill-foreground z-50 text-[6px] font-bold font-mono tracking-widest uppercase pointer-events-none"
					>
						<textPath
							href="#thrPath-{driverId}"
							startOffset="50%"
							text-anchor="middle"
							class=""
						>
							THROTTLE
						</textPath>
					</text>

					<!-- Right Bar: Brake (Red) -->
					<path
						id="brkPath-{driverId}"
						d={brkBgPath}
						fill="none"
						class="stroke-surface-overlay"
						stroke-width="10"
					/>
					<path
						id="brkTextPath-{driverId}"
						d={brkTextPath}
						fill="none"
						stroke="none"
					/>
					<path
						d={brkBgPath}
						fill="none"
						stroke="#dc2626"
						stroke-width="10"
						// stroke-linecap="round"
						stroke-dasharray={pedalArcLen}
						stroke-dashoffset={pedalArcLen -
							(pedalArcLen * Math.min(smoothBrake.current, 100)) / 100}
					/>
					<text
						dy="2"
						class="fill-foreground z-50 text-[6px] font-bold font-mono tracking-widest uppercase pointer-events-none"
					>
						<textPath
							href="#brkTextPath-{driverId}"
							startOffset="50%"
							text-anchor="middle"
						>
							BRAKE
						</textPath>
					</text>
				</svg>

				<!-- Central HUD Text -->
				<div
					class={`mt-2 absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center ${compact ? "top-[66%]" : "top-[71%]"}`}
				>
					<!-- Speed Output -->
					<div
						class={`mt-2 text-5xl font-black leading-none tabular-nums tracking-tighter text-on-surface drop-shadow-lg`}
					>
						{Math.round(smoothSpeed.current)}
					</div>
					<p class="text-xs text-muted-foreground">km/h</p>
					<!-- Gear & Units Output -->
					<div class="mt-0 flex items-baseline gap-1 md:mt-1">
						<span
							class={`${compact ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl"} font-black leading-none tabular-nums tracking-tight text-on-surface drop-shadow-md`}
							>{gear === 0 ? "N" : gear === -1 ? "R" : gear || "N"}</span
						>
						<span
							class={`text-xs font-mono font-bold leading-none tracking-tightest text-on-surface-subtle uppercase`}
							>GEAR</span
						>
					</div>
					<!-- RPM numerical -->
					<div
						class={`${compact ? "text-[11px] md:text-xs" : "text-xs md:text-sm"} mt-1 flex items-center gap-1 rounded-full  px-3 py-1 font-mono tracking-tightest text-on-surface-overlay uppercase font-semibold`}
					>
						<span
							class={smoothRpm.current > 11000
								? "font-bold text-red-500"
								: "text-on-surface"}>{Math.round(smoothRpm.current)}</span
						>
						RPM
					</div>
				</div>
			</div>
		</div>
	</div>

	{#if !compact}
		<!-- Speed Trace Toggle -->
		<button
			class="flex w-full items-center justify-between border-t border-divider bg-surface/50 px-4 py-1.5 transition-colors hover:bg-surface-raised/50"
			onclick={() => (showSpeedTrace = !showSpeedTrace)}
		>
			<span
				class="font-mono text-[10px] font-bold tracking-widest text-on-surface-subtle uppercase"
				>Speed Trace</span
			>
			<div class="flex items-center gap-4">
				{#if telemetry?._sector1_state && telemetry._sector1_state !== "none"}
					<div class="mr-2 flex flex-col items-center gap-0">
						<div class="flex items-center gap-0.5">
							<div
								class="h-1.5 w-6 {getSectorColor(telemetry._sector1_state)}"
							></div>
							<div
								class="h-1.5 w-6 {getSectorColor(telemetry._sector2_state)}"
							></div>
							<div
								class="h-1.5 w-6 {getSectorColor(telemetry._sector3_state)}"
							></div>
						</div>
						<div
							class="flex items-center gap-0.5 font-mono text-[8px] font-bold text-on-surface-subtle"
						>
							<span class="w-6 text-center"
								>{formatSectorTime(telemetry._sector1_time)}</span
							>
							<span class="w-6 text-center"
								>{formatSectorTime(telemetry._sector2_time)}</span
							>
							<span class="w-6 text-center"
								>{formatSectorTime(telemetry._sector3_time)}</span
							>
						</div>
					</div>
				{/if}
				{#if bestLap && bestLap > 0}
					<div class="flex items-center gap-1.5">
						<span class="text-[8px] font-bold text-on-surface-subtle">BEST</span
						>
						<span
							class="font-mono text-[11px] font-bold {telemetry?._is_purple
								? 'text-purple-400'
								: 'text-on-surface-muted'}"
						>
							{formatLapTime(bestLap)}
						</span>
					</div>
				{/if}
				{#if currentLap && currentLap > 0}
					<div class="flex items-center gap-1.5">
						<span class="text-[8px] font-bold text-on-surface-subtle"
							>CURRENT</span
						>
						<span class="font-mono text-[11px] text-on-surface-muted">
							{formatLapTime(currentLap)}
						</span>
					</div>
				{/if}
				{#if lastLap && lastLap > 0 && lastLap !== bestLap}
					<div class="flex items-center gap-1.5">
						<span class="text-[8px] font-bold text-on-surface-subtle">PREV</span
						>
						<span class="font-mono text-[11px] text-on-surface-muted">
							{formatLapTime(lastLap)}
						</span>
					</div>
				{/if}
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-on-surface-subtle transition-transform duration-200"
					style="transform: rotate({showSpeedTrace ? '180deg' : '0deg'})"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</div>
		</button>
	{/if}

	{#if showSpeedTrace && lapData.length > 0}
		<div
			class={`w-full px-4 ${compact ? "bg-background" : "border-t border-divider bg-surface/50"}`}
		>
			<SyncedTelemetryChart
				series={[{ data: lapDistanceData, color, label: tlaId }]}
				yAccessor={(d) => (d.speed as number) || 0}
				xAccessor={(d) => d.distance ?? 0}
				label="Speed"
				unit="km/h"
				{xDomain}
				onZoom={(domain) => (xDomain = domain)}
				hoverX={hoverX ?? playheadDistance}
				onHover={(x) => (hoverX = x)}
				yDomain={[0, 350]}
				yTicks={[100, 200, 300]}
				height={120}
			/>
		</div>
	{/if}
</div>
