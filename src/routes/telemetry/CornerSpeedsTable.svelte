<script lang="ts">
	import type { TrackCorner } from "$lib/track-corners";
	import type { CornerSpeed } from "$lib/telemetry/corner-speeds";

	export interface SlotCornerData {
		tla: string;
		color: string;
		speeds: CornerSpeed[];
	}

	interface Props {
		corners: TrackCorner[];
		slots: SlotCornerData[];
		activeCorner?: number | null;
		onSelectCorner?: (corner: TrackCorner) => void;
		onHoverCorner?: (corner: TrackCorner | null) => void;
	}

	let {
		corners,
		slots,
		activeCorner = null,
		onSelectCorner,
		onHoverCorner,
	}: Props = $props();

	// Filter slots with loaded telemetry
	const activeSlots = $derived(
		slots.filter((s) => s.speeds.some((cs) => cs.minSpeed !== null)),
	);

	// Map: corner key -> slot index -> CornerSpeed
	const speedMap = $derived.by(() => {
		const map = new Map<string, Map<number, CornerSpeed>>();
		for (let sIdx = 0; sIdx < slots.length; sIdx++) {
			const s = slots[sIdx];
			for (const cs of s.speeds) {
				const key = `${cs.corner}_${cs.letter}`;
				if (!map.has(key)) map.set(key, new Map());
				map.get(key)!.set(sIdx, cs);
			}
		}
		return map;
	});

	// Quick stats: corner wins per driver
	const quickStats = $derived.by(() => {
		if (activeSlots.length < 2) return null;
		const wins: Record<number, number> = {};
		for (let i = 0; i < slots.length; i++) wins[i] = 0;
		let ties = 0;

		for (const c of corners) {
			const key = `${c.number}_${c.letter}`;
			const slotSpeeds = speedMap.get(key);
			if (!slotSpeeds) continue;
			let bestVal = -Infinity;
			let bestIdx = -1;
			let isTie = false;
			for (let i = 0; i < slots.length; i++) {
				const cs = slotSpeeds.get(i);
				if (!cs || cs.minSpeed === null) continue;
				const rounded = Math.round(cs.minSpeed);
				if (rounded > bestVal) {
					bestVal = rounded;
					bestIdx = i;
					isTie = false;
				} else if (rounded === bestVal && bestVal > -Infinity) {
					isTie = true;
				}
			}
			if (isTie) ties++;
			else if (bestIdx >= 0) wins[bestIdx] = (wins[bestIdx] ?? 0) + 1;
		}
		return { wins, ties };
	});

	// Always natural track order (Turn 1 -> Turn 2 -> ...)
	const sortedCorners = $derived(
		[...corners].sort(
			(a, b) => a.number - b.number || (a.letter || "").localeCompare(b.letter || ""),
		),
	);

	// Find the max absolute delta between Slot 0 and Slot 1 for bar scaling
	const maxAbsDelta = $derived.by(() => {
		if (activeSlots.length < 2) return 1;
		let max = 1;
		for (const c of corners) {
			const key = `${c.number}_${c.letter}`;
			const s0 = speedMap.get(key)?.get(0)?.minSpeed;
			const s1 = speedMap.get(key)?.get(1)?.minSpeed;
			if (s0 != null && s1 != null) {
				const abs = Math.abs(s1 - s0);
				if (abs > max) max = abs;
			}
		}
		return max;
	});

	function fmtSpd(val: number | null | undefined): string {
		if (val == null || !Number.isFinite(val)) return "–";
		return `${Math.round(val)}`;
	}
</script>

{#if corners.length > 0 && activeSlots.length > 0}
	<div class="flex flex-col min-h-0 w-full select-none bg-surface">
		<!-- Header: Title + units -->
		<div class="flex items-center justify-between px-3 py-2 border-b border-divider bg-surface-raised/40">
			<span class="font-mono text-[10px] font-black tracking-widest text-on-surface uppercase">
				Corner Speeds
			</span>
			<span class="font-mono text-[9px] text-on-surface-subtle uppercase">
				km/h
			</span>
		</div>

		<!-- Quick stats summary bar: win tally -->
		{#if quickStats}
			<div class="flex items-center justify-center gap-4 px-3 py-1.5 border-b border-divider bg-surface">
				{#each slots as s, idx}
					{#if s.speeds.length > 0 && (quickStats.wins[idx] ?? 0) > 0}
						<span class="flex items-center gap-1.5 text-[10px] font-mono">
							<span class="h-1.5 w-1.5 rounded-full shrink-0" style="background-color: {s.color}"></span>
							<span class="font-bold" style="color: {s.color}">{s.tla}</span>
							<span class="text-on-surface font-semibold">{quickStats.wins[idx]}</span>
						</span>
					{/if}
				{/each}
				{#if quickStats.ties > 0}
					<span class="text-[9px] font-mono text-on-surface-subtle">{quickStats.ties} tied</span>
				{/if}
			</div>
		{/if}

		<!-- Column headers -->
		{#if activeSlots.length === 2}
			<!-- 2-driver comparison header -->
			<div class="grid grid-cols-[44px_1fr_1fr_1.8fr] items-center gap-2 sm:gap-3 px-3 py-1.5 border-b border-divider bg-surface-raised/30 font-mono text-[9px] font-bold text-on-surface-subtle uppercase">
				<span>Turn</span>
				<span class="text-right flex items-center justify-end gap-1">
					<span class="h-1.5 w-1.5 rounded-full" style="background-color: {activeSlots[0].color}"></span>
					<span style="color: {activeSlots[0].color}">{activeSlots[0].tla}</span>
				</span>
				<span class="text-right flex items-center justify-end gap-1">
					<span class="h-1.5 w-1.5 rounded-full" style="background-color: {activeSlots[1].color}"></span>
					<span style="color: {activeSlots[1].color}">{activeSlots[1].tla}</span>
				</span>
				<span class="text-right pr-1">Δ Advantage</span>
			</div>
		{:else if activeSlots.length === 1}
			<!-- 1-driver header -->
			<div class="grid grid-cols-[48px_1fr] items-center gap-2 px-3 py-1 border-b border-divider bg-surface-raised/30 font-mono text-[9px] font-bold text-on-surface-subtle uppercase">
				<span>Turn</span>
				<span class="flex items-center gap-1">
					<span class="h-1 w-1 rounded-full" style="background-color: {activeSlots[0].color}"></span>
					<span style="color: {activeSlots[0].color}">{activeSlots[0].tla}</span>
				</span>
			</div>
		{:else}
			<!-- Multi-driver header (3+ drivers: show highest minimum speed) -->
			<div class="grid grid-cols-[44px_1.2fr_1fr_1fr] items-center gap-2 px-3 py-1.5 border-b border-divider bg-surface-raised/30 font-mono text-[9px] font-bold text-on-surface-subtle uppercase">
				<span>Turn</span>
				<span>Fastest</span>
				<span class="text-right">Top Speed</span>
				<span class="text-right pr-1">Δ Margin</span>
			</div>
		{/if}

		<!-- Scrollable corner rows -->
		<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
			{#each sortedCorners as corner}
				{@const key = `${corner.number}_${corner.letter}`}
				{@const isActive = activeCorner === corner.number}

				<button
					type="button"
					onclick={() => onSelectCorner?.(corner)}
					onmouseenter={() => onHoverCorner?.(corner)}
					onmouseleave={() => onHoverCorner?.(null)}
					class="w-full text-left px-3 py-1.5 border-b border-divider/40 transition-colors cursor-pointer group
						{isActive ? 'bg-surface-overlay border-border' : 'hover:bg-surface-raised'}"
				>
					{#if activeSlots.length === 2}
						{@const cs0 = speedMap.get(key)?.get(0)}
						{@const cs1 = speedMap.get(key)?.get(1)}
						{@const spd0 = cs0?.minSpeed}
						{@const spd1 = cs1?.minSpeed}
						{@const hasBoth = spd0 != null && spd1 != null}
						{@const round0 = spd0 != null ? Math.round(spd0) : null}
						{@const round1 = spd1 != null ? Math.round(spd1) : null}
						{@const isD0Faster = hasBoth && round0! > round1!}
						{@const isD1Faster = hasBoth && round1! > round0!}
						{@const isTie = hasBoth && round0 === round1}
						{@const absDelta = hasBoth ? Math.abs(round0! - round1!) : null}
						{@const barPct = absDelta != null ? Math.max(0, Math.min(100, (absDelta / Math.max(1, maxAbsDelta)) * 100)) : 0}

						<div class="grid grid-cols-[44px_1fr_1fr_1.8fr] items-center gap-2 sm:gap-3">
							<!-- Corner Label -->
							<span
								class="font-mono text-[10px] font-bold tabular-nums transition-colors {isActive ? 'text-on-surface font-black' : 'text-on-surface-muted group-hover:text-on-surface'}"
							>
								T{corner.letter ? `${corner.number}${corner.letter}` : corner.number}
							</span>

							<!-- Driver 0 Speed -->
							<span
								class="font-mono text-[10px] tabular-nums text-right {isD0Faster ? 'text-on-surface font-bold' : 'text-on-surface-muted'}"
							>
								{fmtSpd(spd0)}
							</span>

							<!-- Driver 1 Speed -->
							<span
								class="font-mono text-[10px] tabular-nums text-right {isD1Faster ? 'text-on-surface font-bold' : 'text-on-surface-muted'}"
							>
								{fmtSpd(spd1)}
							</span>

							<!-- Delta Bar + Value -->
							<div class="flex items-center justify-end gap-2 min-w-0 pr-1">
								{#if hasBoth && absDelta != null}
									<!-- Diverging Delta Bar -->
									<div class="relative h-2 flex-1 max-w-28 sm:max-w-36 bg-surface-overlay border border-divider/60 rounded-xs overflow-hidden shrink-0">
										<div class="absolute left-1/2 top-0 bottom-0 w-px bg-divider z-1"></div>
										{#if isD1Faster}
											<!-- Driver 1 is faster: extends right in Driver 1's color -->
											<div
												class="absolute top-0 bottom-0 left-1/2 rounded-r-xs opacity-90 transition-all duration-150"
												style="width: {barPct / 2}%; background-color: {activeSlots[1].color};"
											></div>
										{:else if isD0Faster}
											<!-- Driver 0 is faster: extends left in Driver 0's color -->
											<div
												class="absolute top-0 bottom-0 rounded-l-xs opacity-90 transition-all duration-150"
												style="width: {barPct / 2}%; right: 50%; background-color: {activeSlots[0].color};"
											></div>
										{/if}
									</div>

									<!-- Delta Number: in winning driver color with + advantage -->
									<span
										class="font-mono text-[10px] tabular-nums font-bold w-8 text-right shrink-0"
										style={isD0Faster ? `color: ${activeSlots[0].color}` : isD1Faster ? `color: ${activeSlots[1].color}` : ""}
										class:text-on-surface-subtle={isTie}
									>
										{isTie ? "0" : `+${absDelta}`}
									</span>
								{:else}
									<span class="font-mono text-[10px] text-on-surface-subtle text-right">–</span>
								{/if}
							</div>
						</div>
					{:else if activeSlots.length === 1}
						{@const cs0 = speedMap.get(key)?.get(0)}
						{@const spd0 = cs0?.minSpeed}
						<div class="grid grid-cols-[48px_1fr] items-center gap-2">
							<span
								class="font-mono text-[10px] font-bold tabular-nums transition-colors {isActive ? 'text-on-surface font-black' : 'text-on-surface-muted group-hover:text-on-surface'}"
							>
								T{corner.letter ? `${corner.number}${corner.letter}` : corner.number}
							</span>
							<span class="font-mono text-[10px] font-bold text-on-surface">
								{fmtSpd(spd0)}
							</span>
						</div>
					{:else}
						<!-- 3+ drivers: show which driver had highest min speed -->
						{@const slotSpeeds = activeSlots.map((s, idx) => {
							const cs = speedMap.get(key)?.get(idx);
							return {
								slot: s,
								speed: cs?.minSpeed != null ? Math.round(cs.minSpeed) : null,
							};
						}).filter((s): s is { slot: typeof activeSlots[0]; speed: number } => s.speed !== null)}

						{@const sortedBySpeed = [...slotSpeeds].sort((a, b) => b.speed - a.speed)}
						{@const topDriver = sortedBySpeed[0]}
						{@const runnerUp = sortedBySpeed[1]}
						{@const isTie = sortedBySpeed.length >= 2 && sortedBySpeed[0].speed === sortedBySpeed[1].speed}
						{@const margin = topDriver && runnerUp ? topDriver.speed - runnerUp.speed : 0}

						<div
							class="grid grid-cols-[44px_1.2fr_1fr_1fr] items-center gap-2"
							title={slotSpeeds.map(s => `${s.slot.tla}: ${s.speed} km/h`).join(' | ')}
						>
							<!-- Turn -->
							<span
								class="font-mono text-[10px] font-bold tabular-nums transition-colors {isActive ? 'text-on-surface font-black' : 'text-on-surface-muted group-hover:text-on-surface'}"
							>
								T{corner.letter ? `${corner.number}${corner.letter}` : corner.number}
							</span>

							<!-- Fastest Driver -->
							{#if topDriver}
								{#if isTie}
									<span class="font-mono text-[10px] font-bold text-on-surface-subtle uppercase">
										Tie
									</span>
								{:else}
									<div class="flex items-center gap-1.5 min-w-0">
										<span class="h-2 w-2 rounded-full shrink-0" style="background-color: {topDriver.slot.color}"></span>
										<span class="font-mono text-[11px] font-bold truncate" style="color: {topDriver.slot.color}">
											{topDriver.slot.tla}
										</span>
									</div>
								{/if}

								<!-- Top Apex Speed -->
								<span class="font-mono text-[10px] font-bold text-on-surface tabular-nums text-right">
									{topDriver.speed} km/h
								</span>

								<!-- Margin over 2nd place -->
								<div class="flex items-center justify-end pr-1">
									{#if isTie}
										<span class="font-mono text-[10px] text-on-surface-subtle tabular-nums">–</span>
									{:else if margin > 0}
										<span
											class="font-mono text-[10px] font-bold tabular-nums"
											style="color: {topDriver.slot.color}"
										>
											+{margin}
										</span>
									{:else}
										<span class="font-mono text-[10px] text-on-surface-subtle tabular-nums">0</span>
									{/if}
								</div>
							{:else}
								<span class="col-span-3 font-mono text-[10px] text-on-surface-subtle text-center">–</span>
							{/if}
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</div>
{/if}
