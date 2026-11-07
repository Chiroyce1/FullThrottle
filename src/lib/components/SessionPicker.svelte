<script lang="ts">
	import { goto } from "$app/navigation";
	import SessionSelects from "$lib/components/SessionSelects.svelte";
	import { Button } from "$lib/components/ui/button";
	import type {
		YearEntry,
		RoundEntry,
		SessionEntry,
	} from "$lib/metadata/types";
	import { latestYear, latestRound, latestSession } from "$lib/metadata/types";

	const { years = [] } = $props<{ years: YearEntry[] }>();

	// ── Default to latest year → latest round → race (or last session) ───────
	const defaultYear = $derived(latestYear(years));
	const defaultRound = $derived(latestRound(defaultYear));
	const defaultSession = $derived(latestSession(defaultRound));

	let selectedYear = $state<string>("");
	let selectedRound = $state<string>("");
	let selectedSession = $state<string>("");

	$effect(() => {
		if (years.length > 0 && !selectedYear) {
			selectedYear = defaultYear?.year.toString() ?? "";
			selectedRound = defaultRound?.round.toString() ?? "";
			selectedSession = defaultSession?.code ?? "";
		}
	});

	const activeYearData = $derived(
		years.find((y: YearEntry) => y.year.toString() === selectedYear),
	);
	const activeRoundData = $derived(
		activeYearData?.rounds.find(
			(r: RoundEntry) => r.round.toString() === selectedRound,
		),
	);

	// Cascading selection resets
	$effect(() => {
		if (selectedYear && activeYearData) {
			if (
				!activeYearData.rounds.some(
					(r: RoundEntry) => r.round.toString() === selectedRound,
				)
			) {
				const latest = [...activeYearData.rounds].sort(
					(a: RoundEntry, b: RoundEntry) => b.round - a.round,
				)[0];
				selectedRound = latest?.round.toString() ?? "";
				selectedSession = "";
			}
		}
	});

	$effect(() => {
		if (selectedRound && activeRoundData) {
			if (
				!activeRoundData.sessions.some(
					(s: SessionEntry) => s.code === selectedSession,
				)
			) {
				const def =
					activeRoundData.sessions.find((s: SessionEntry) => s.code === "r") ||
					activeRoundData.sessions[activeRoundData.sessions.length - 1];
				selectedSession = def?.code ?? "";
			}
		}
	});

	function sessionUrl(
		year: string,
		round: string,
		sessionCode: string,
	): string {
		const yNum = parseInt(year);
		const rNum = parseInt(round);
		if (rNum === 0) {
			const [testRound, testDay] = sessionCode.split("_");
			if (testRound && testDay)
				return `/replay/${yNum}/${testRound}/${testDay}`;
			return `/replay/${yNum}/${round}/${sessionCode}`;
		}
		return `/replay/${yNum}/${rNum}/${sessionCode}`;
	}

	function handleNavigate() {
		if (selectedYear && selectedRound !== "" && selectedSession) {
			goto(sessionUrl(selectedYear, selectedRound, selectedSession));
		}
	}

	// Most recent rounds of the selected season, for one-click picking
	const recentRounds = $derived(
		[...(activeYearData?.rounds || [])]
			.sort((a: RoundEntry, b: RoundEntry) => b.round - a.round)
			.slice(0, 4),
	);

</script>

<div class="panel w-full" id="session-picker">
	<div class="grid grid-cols-1 items-end gap-3 p-4 sm:p-5 md:grid-cols-[10rem_1fr_12rem_auto]">
		<SessionSelects
			{years}
			year={selectedYear}
			round={selectedRound}
			session={selectedSession}
			onyear={(v) => (selectedYear = v)}
			onround={(v) => (selectedRound = v)}
			onsession={(v) => (selectedSession = v)}
			labelled
			size="md"
			class="contents"
		/>

		<Button onclick={handleNavigate} disabled={!selectedSession} class="h-9 px-4">
			Launch replay
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg
			>
		</Button>
	</div>

	{#if recentRounds.length > 0}
		<div
			class="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-3 sm:px-5"
		>
			<span class="mr-1 text-xs text-muted-foreground">Recent</span>
			{#each recentRounds as r (r.round)}
				{@const active = r.round.toString() === selectedRound}
				<button
					type="button"
					class="rounded-full border px-2.5 py-1 text-xs transition-colors {active
						? 'border-transparent bg-primary-subtle text-primary'
						: 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground'}"
					onclick={() => (selectedRound = r.round.toString())}
				>
					{r.name}
				</button>
			{/each}
		</div>
	{/if}
</div>
