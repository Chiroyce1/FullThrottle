<script lang="ts">
	import type {
		TelemetryFrameRow,
		DriverMeta,
		QualiPhaseEntry,
		SectorStatus,
	} from "$lib/types";
	import { type SessionMode, formatSectorTime } from "$lib/utils";
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

	// UPDATED: Removed .slice(0, 3) to show full names
	function driverName(meta: DriverMeta | null | undefined, id: string): string {
		if (meta?.last_name) return meta.last_name.toUpperCase();
		if (meta?.abbreviation) return meta.abbreviation.toUpperCase();
		if (meta?.name) {
			const token = meta.name.split(" ").pop() ?? meta.name;
			return token.toUpperCase();
		}
		return id.toUpperCase();
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
		if (state === "purple") return "text-purple-200";
		if (state === "green") return "text-green-200";
		if (state === "yellow") return "text-yellow-100";
		return "text-on-surface";
	}
</script>

<div
	class="flex h-full w-full flex-col overflow-hidden rounded-lg border border-divider bg-surface shadow-xl"
>
	<div
		class="flex shrink-0 items-center border-b border-divider bg-surface-raised px-4 py-3"
	>
		<h3
			class="text-xs font-bold tracking-widest text-on-surface-muted uppercase"
		>
			{isQualifying
				? "Qualifying Order"
				: isTimedSession
					? "Session Order"
					: "Live Timing"}
		</h3>
	</div>

	<div class="no-scrollbar w-full flex-1 space-y-0.5 overflow-y-auto p-1 mb-12">
		{#each drivers as { id, row, meta }, index}
			{@const qualiEntry = qualifyingData?.[id]}
			{@const phase = highestPhase(qualiEntry)}

			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="group flex cursor-pointer items-center rounded p-2 transition-colors {focusedDriver ===
				id
					? 'border-l-2 border-red-500 bg-surface-overlay'
					: 'border-l-2 border-transparent hover:bg-surface-raised/50'}"
				onclick={() => onSelect(id)}
				role="button"
				tabindex="0"
			>
				<div class="flex w-36 shrink-0 items-center gap-2">
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
							class="truncate font-mono text-md ml-1 font-black text-on-surface transition-colors group-hover:text-red-400"
						>
							{driverName(meta, id)}
						</span>
						<div class="mt-0.5 flex items-center gap-1">
							{#if isQualifying && phase}
								<span
									class="rounded-sm px-1 font-mono text-[9px] font-black
                                    {phase === 'Q3'
										? 'border border-green-500/50 bg-green-500/20 text-green-400'
										: phase === 'Q2'
											? 'border border-yellow-500/50 bg-yellow-500/20 text-yellow-400'
											: 'border border-on-surface-subtle/30 bg-surface-overlay text-on-surface-subtle'}"
									>{phase}</span
								>
							{:else if row.drs > 8}
								<span
									class="w-max rounded-sm border border-green-500/50 bg-green-500/20 px-1 font-mono text-[9px] font-black tracking-widest text-green-700"
									>DRS</span
								>
							{/if}
						</div>
					</div>
				</div>

				<div
					class="ml-1 flex min-w-0 flex-1 items-center justify-end gap-4 sm:gap-6 text-right"
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
									<span class="text-[8px] font-bold text-green-500">Q3</span>
									<span class="font-mono text-[10px] font-bold text-green-400"
										>{formatLapTime(qualiEntry.q3)}</span
									>
								</div>
							{:else if qualiEntry.q2 !== null}
								<div class="flex items-center gap-1.5">
									<span class="text-[8px] font-bold text-yellow-500">Q2</span>
									<span class="font-mono text-[10px] text-yellow-400"
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

						<div class="flex min-w-0 items-center gap-3 sm:gap-4">
							<div
								class="flex min-w-18 flex-col items-end justify-center gap-0.5"
							>
								{#if row._cached_best_lap}
									<div class="flex items-center gap-1.5">
										<span class="text-[8px] font-bold text-on-surface-subtle"
											>BEST</span
										>
										<span
											class="font-mono text-[10px] {row._is_purple
												? 'font-bold text-purple-400'
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
								<div class="flex min-w-32 flex-col items-end gap-1">
									<div class="flex items-center justify-end gap-1">
										<div
											class="h-1.5 w-9 rounded-[1px] {getSectorColor(
												row._sector1_state,
											)}"
										></div>
										<div
											class="h-1.5 w-9 rounded-[1px] {getSectorColor(
												row._sector2_state,
											)}"
										></div>
										<div
											class="h-1.5 w-9 rounded-[1px] {getSectorColor(
												row._sector3_state,
											)}"
										></div>
									</div>
									<div class="flex items-center justify-end gap-1">
										<span
											class="w-9 px-0.5 py-px text-center font-mono text-[9px] font-black tabular-nums {getSectorTimeClass(
												row._sector1_state,
											)}"
										>
											{formatSectorTime(row._sector1_time)}
										</span>
										<span
											class="w-9 px-0.5 py-px text-center font-mono text-[9px] font-black tabular-nums {getSectorTimeClass(
												row._sector2_state,
											)}"
										>
											{formatSectorTime(row._sector2_time)}
										</span>
										<span
											class="w-9 px-0.5 py-px text-center font-mono text-[9px] font-black tabular-nums {getSectorTimeClass(
												row._sector3_state,
											)}"
										>
											{formatSectorTime(row._sector3_time)}
										</span>
									</div>
								</div>
							{/if}
						</div>

						<div class="flex w-14 flex-col items-end gap-0.5">
							<span
								class="flex items-center gap-1 font-mono text-[9px] text-on-surface"
							>
								{#if row.tyre_life !== undefined}
									<span
										class="font-mono text-[9px] font-bold text-on-surface-muted"
										>{row.tyre_life}L</span
									>
								{/if}
								<CompoundBadge compound={row.compound || "UNKNOWN"} size={26} />
							</span>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
