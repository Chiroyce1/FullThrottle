<script lang="ts">
	import type {
		TelemetryFrameRow,
		DriverMeta,
		QualiPhaseEntry,
		SectorStatus,
	} from "$lib/types";
	import { type SessionMode, formatSectorTime, getDriverAbbreviation } from "$lib/utils";
	import CompoundBadge from "$lib/components/CompoundBadge.svelte";

	const {
		drivers = [],
		focusedDriver = "",
		sessionMode = "race",
		qualifyingData = {},
		onSelect,
	} = $props<{
		drivers: Array<{
			id: string;
			row: TelemetryFrameRow;
			meta: DriverMeta | null | undefined;
		}>;
		focusedDriver: string;
		sessionMode?: SessionMode;
		qualifyingData?: Record<string, QualiPhaseEntry>;
		onSelect: (id: string) => void;
	}>();

	const isQualifying = $derived(sessionMode === "qualifying");
	const isTimedSession = $derived(sessionMode === "timed");

	function driverName(meta: DriverMeta | null | undefined, id: string): string {
		if (meta?.last_name) return meta.last_name.toUpperCase();
		if (meta?.abbreviation) return meta.abbreviation.toUpperCase();
		if (meta?.name) {
			const token = meta.name.split(" ").pop() ?? meta.name;
			return token.toUpperCase();
		}
		return id.toUpperCase();
	}

	function driverShortName(meta: DriverMeta | null | undefined, id: string): string {
		return getDriverAbbreviation(meta, id).slice(0, 3);
	}

	function highestPhase(entry: QualiPhaseEntry | undefined): string {
		if (!entry) return "";
		if (entry.q3 !== null) return "Q3";
		if (entry.q2 !== null) return "Q2";
		return "Q1";
	}

	function formatLapTime(seconds: number | null | undefined): string {
		if (!seconds || isNaN(seconds) || seconds === 0) return "---";
		const mins = Math.floor(seconds / 60);
		const secs = (seconds % 60).toFixed(3).padStart(6, "0");
		return mins > 0 ? `${mins}:${secs}` : secs;
	}

	function getSectorColor(state: SectorStatus | undefined): string {
		if (state === "purple") return "bg-purple-500";
		if (state === "green") return "bg-green-500";
		if (state === "yellow") return "bg-yellow-500";
		return "bg-surface-overlay border border-divider";
	}

	function getSectorTimeClass(state: SectorStatus | undefined): string {
		if (state === "purple") return "text-purple-700 dark:text-purple-300";
		if (state === "green") return "text-emerald-700 dark:text-green-400";
		if (state === "yellow") return "text-amber-800 dark:text-yellow-300";
		return "text-on-surface";
	}
</script>

<div
	class="flex h-full w-full flex-col overflow-hidden rounded-lg border border-divider bg-surface"
>
	<div
		class="flex shrink-0 items-center justify-between border-b border-divider bg-surface-raised/40 px-3 py-2 sm:py-1.5"
	>
		<h3
			class="font-mono text-xs font-bold tracking-widest text-on-surface-muted uppercase"
		>
			{isQualifying
				? "Qualifying Order"
				: isTimedSession
					? "Session Order"
					: "Live Timing"}
		</h3>
	</div>

	<div class="no-scrollbar w-full flex-1 space-y-0.5 overflow-y-auto p-1">
		{#each drivers as { id, row, meta }, index}
			{@const qualiEntry = qualifyingData?.[id]}
			{@const phase = highestPhase(qualiEntry)}

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="group flex cursor-pointer items-center rounded-md p-2 transition-colors {focusedDriver ===
				id
					? 'bg-surface-overlay'
					: 'hover:bg-surface-raised/50'}"
				onclick={() => onSelect(id)}
				role="button"
				tabindex="0"
			>
				<div class="flex w-20 sm:w-36 shrink-0 items-center gap-1.5 sm:gap-2">
					<span
						class="w-4 shrink-0 text-center font-mono text-xs font-bold text-on-surface-subtle"
					>
						{isQualifying
							? meta?.pos && meta.pos > 0
								? meta.pos
								: index + 1
							: isTimedSession
								? index + 1
								: (row.position ?? meta?.pos ?? "-")}
					</span>

					<div
						class="h-6 w-1.5 shrink-0 rounded-full"
						style="background-color: {meta?.color || '#fff'};"
					></div>

					<div class="flex min-w-0 flex-col">
						<span
							class="truncate font-mono text-sm sm:text-md ml-0.5 sm:ml-1 font-black text-on-surface"
						>
							<span class="sm:hidden">{driverShortName(meta, id)}</span>
							<span class="hidden sm:inline">{driverName(meta, id)}</span>
						</span>
						<div class="mt-0.5 flex items-center gap-1">
							{#if isQualifying && phase}
								<span
									class="rounded-sm px-1 font-mono text-[9px] font-black
                                    {phase === 'Q3'
										? 'border border-green-500/50 bg-green-500/20 text-emerald-700 dark:text-green-400'
										: phase === 'Q2'
											? 'border border-yellow-500/50 bg-yellow-500/20 text-amber-800 dark:text-yellow-400'
											: 'border border-on-surface-subtle/30 bg-surface-overlay text-on-surface-subtle'}"
									>{phase}</span
								>
							{:else if row.drs > 8}
								<span
									class="w-max rounded-sm border border-green-500/50 bg-green-500/20 px-1 font-mono text-[9px] font-black tracking-widest text-emerald-700 dark:text-green-400"
									>DRS</span
								>
							{/if}
						</div>
					</div>
				</div>

				<div
					class="ml-1 flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-6 text-right"
				>
					{#if sessionMode === "race" && row.position === 0 && row.distance > 0}
						<span
							class="font-mono text-[10px] font-bold tracking-widest text-on-surface-subtle"
							>RETIRED</span
						>
					{:else if isQualifying && qualiEntry}
						<div
							class="flex min-w-15 flex-col items-end justify-center gap-0.5"
						>
							{#if qualiEntry.q3 !== null}
								<div class="flex items-center gap-1.5">
									<span class="text-[8px] font-bold text-emerald-700 dark:text-green-500">Q3</span>
									<span class="font-mono text-[10px] font-bold text-emerald-700 dark:text-green-400"
										>{formatLapTime(qualiEntry.q3)}</span
									>
								</div>
							{:else if qualiEntry.q2 !== null}
								<div class="flex items-center gap-1.5">
									<span class="text-[8px] font-bold text-amber-800 dark:text-yellow-500">Q2</span>
									<span class="font-mono text-[10px] text-amber-800 dark:text-yellow-400"
										>{formatLapTime(qualiEntry.q2)}</span
									>
								</div>
							{:else if qualiEntry.q1 !== null}
								<div class="flex items-center gap-1.5">
									<span class="text-[8px] font-bold text-on-surface-subtle"
										>Q1</span
									>
									<span class="font-mono text-[10px] text-on-surface-muted"
										>{formatLapTime(qualiEntry.q1)}</span
									>
								</div>
							{/if}
						</div>
					{:else}
						{#if sessionMode === "race"}
							<div class="flex shrink-0 gap-5">
								<div class="flex w-11 flex-col items-end justify-center">
									{#if index === 0}
										<span
											class="font-mono text-sm font-bold tracking-widest text-on-surface"
											>GAP</span
										>
									{:else if row.gap_to_leader !== undefined}
										<span class="font-mono text-xs text-on-surface">
											+{row.gap_to_leader.toFixed(3)}
										</span>
									{/if}
								</div>
								<div class="flex w-11 flex-col items-end justify-center">
									{#if index === 0}
										<span
											class="font-mono text-sm font-bold tracking-widest text-on-surface"
											>INT</span
										>
									{:else if row.time_gap !== undefined}
										<span class="font-mono text-xs font-bold text-on-surface">
											+{row.time_gap.toFixed(3)}
										</span>
									{/if}
								</div>
							</div>
						{/if}

						<div class="flex min-w-0 items-center gap-1.5 sm:gap-4">
							<div
								class="flex min-w-16 sm:min-w-18 flex-col items-end justify-center gap-0.5"
							>
								{#if row._cached_best_lap}
									<div class="flex items-center gap-1.5">
										<span class="text-[8px] font-bold text-on-surface-subtle"
											>BEST</span
										>
										<span
											class="font-mono text-[10px] {row._is_purple
												? 'font-bold text-purple-700 dark:text-purple-400'
												: 'text-on-surface-muted'}"
										>
											{formatLapTime(row._cached_best_lap)}
										</span>
									</div>
								{/if}
								{#if row._cached_last_lap}
									<div class="flex items-center gap-1.5">
										<span class="text-[8px] font-bold text-on-surface-subtle"
											>LAST</span
										>
										<span class="font-mono text-[10px] text-on-surface-muted">
											{formatLapTime(row._cached_last_lap)}
										</span>
									</div>
								{/if}
								{#if !row._cached_best_lap && !row._cached_last_lap}
									<span class="font-mono text-[10px] text-on-surface-subtle"
										>---</span
									>
								{/if}
							</div>

							{#if row._cached_best_lap || row._cached_last_lap || row._sector1_state !== "none"}
								<div
									class="flex min-w-0 sm:min-w-32 shrink-0 flex-col items-end gap-0.5 sm:gap-1"
								>
									<div class="flex items-center justify-end gap-0.5 sm:gap-1">
										<div
											class="h-1.5 w-8 sm:w-9 rounded-[1px] {getSectorColor(
												row._sector1_state,
											)}"
										></div>
										<div
											class="h-1.5 w-8 sm:w-9 rounded-[1px] {getSectorColor(
												row._sector2_state,
											)}"
										></div>
										<div
											class="h-1.5 w-8 sm:w-9 rounded-[1px] {getSectorColor(
												row._sector3_state,
											)}"
										></div>
									</div>
									<div class="flex items-center justify-end gap-0.5 sm:gap-1">
										<span
											class="w-8 sm:w-9 px-0.5 py-px text-center font-mono text-[8.5px] sm:text-[9px] font-black tabular-nums {getSectorTimeClass(
												row._sector1_state,
											)}"
										>
											{formatSectorTime(row._sector1_time)}
										</span>
										<span
											class="w-8 sm:w-9 px-0.5 py-px text-center font-mono text-[8.5px] sm:text-[9px] font-black tabular-nums {getSectorTimeClass(
												row._sector2_state,
											)}"
										>
											{formatSectorTime(row._sector2_time)}
										</span>
										<span
											class="w-8 sm:w-9 px-0.5 py-px text-center font-mono text-[8.5px] sm:text-[9px] font-black tabular-nums {getSectorTimeClass(
												row._sector3_state,
											)}"
										>
											{formatSectorTime(row._sector3_time)}
										</span>
									</div>
								</div>
							{/if}
						</div>

						<div class="flex w-12 sm:w-14 shrink-0 flex-col items-end gap-0.5">
							<span
								class="flex items-center gap-1 font-mono text-[9px] text-on-surface"
							>
								<CompoundBadge compound={row.compound || "UNKNOWN"} size={22} />
								{#if row.tyre_life !== undefined}
									<span
										class="font-mono text-[9px] font-bold text-on-surface-muted tabular-nums"
										>{row.tyre_life}L</span
									>
								{/if}
							</span>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
