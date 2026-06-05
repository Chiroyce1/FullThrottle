<script lang="ts">
	import { goto } from "$app/navigation";
	import SearchableSelect from "$lib/components/SearchableSelect.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent } from "$lib/components/ui/card";
	import CardHeader from "./ui/card/card-header.svelte";
	import type {
		YearEntry,
		RoundEntry,
		SessionEntry,
	} from "$lib/metadata-types";
	import { latestYear, latestRound, latestSession } from "$lib/metadata-types";

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

	const selectedYearLabel = $derived(selectedYear || "Year");
	const selectedRoundLabel = $derived(activeRoundData?.name || "Select Round");
	const selectedSessionLabel = $derived(
		activeRoundData?.sessions.find(
			(s: SessionEntry) => s.code === selectedSession,
		)?.label || "Session",
	);

	const yearOptions = $derived(
		years.map((y: YearEntry) => ({
			value: y.year.toString(),
			label: y.year.toString(),
		})),
	);
	const roundOptions = $derived(
		(activeYearData?.rounds || []).map((r: RoundEntry) => ({
			value: r.round.toString(),
			label: r.name,
			keywords: `${r.location || ""} ${r.country || ""}`,
			rightLabel: (r.location || r.country || "").toUpperCase(),
		})),
	);
	const sessionOptions = $derived(
		(activeRoundData?.sessions || []).map((s: SessionEntry) => ({
			value: s.code,
			label: s.label,
			keywords: s.code,
		})),
	);
</script>

<div class="w-full scroll-mt-[100px]" id="session-picker">
	<Card
		class="mx-auto max-w-3xl overflow-hidden rounded-xl border border-divider bg-surface shadow-xl py-18"
	>
		<CardHeader>
			<div class="mt-4 flex flex-col items-center text-center">
				<h2
					class="mb-2 text-2xl font-black tracking-tighter text-on-surface uppercase md:text-4xl"
				>
					Session <span class="text-primary">replay</span>
				</h2>
				<p
					class="font-mono text-xs font-bold tracking-wide text-on-surface-muted uppercase"
				>
					Full replay with driver telemetry and track map for any session
				</p>
			</div>
		</CardHeader>
		<CardContent class="p-5 md:p-6">
			<div class="grid grid-cols-1 items-end gap-3 md:grid-cols-4 md:gap-4">
				<div class="flex flex-col gap-2">
					<SearchableSelect
						bind:value={selectedYear}
						options={yearOptions}
						placeholder={selectedYearLabel}
						searchPlaceholder="Search year..."
						triggerClass="h-10 w-full rounded-md border-divider bg-surface-raised text-on-surface transition-all hover:border-red-600/50 focus:ring-1 focus:ring-red-600"
						contentClass="rounded-md border-divider bg-surface"
					/>
				</div>

				<div class="flex flex-col gap-2 md:col-span-2">
					<SearchableSelect
						bind:value={selectedRound}
						options={roundOptions}
						placeholder={selectedRoundLabel}
						searchPlaceholder="Search round..."
						triggerClass="h-10 w-full rounded-md border-divider bg-surface-raised text-on-surface transition-all hover:border-red-600/50 focus:ring-1 focus:ring-red-600"
						contentClass="max-h-80 rounded-md border-divider bg-surface"
						listClass="max-h-80"
					/>
				</div>

				<div class="flex flex-col gap-2">
					<SearchableSelect
						bind:value={selectedSession}
						options={sessionOptions}
						placeholder={selectedSessionLabel}
						searchPlaceholder="Search session..."
						triggerClass="h-10 w-full rounded-md border-divider bg-surface-raised text-on-surface transition-all hover:border-red-600/50 focus:ring-1 focus:ring-red-600"
						contentClass="rounded-md border-divider bg-surface"
					/>
				</div>
			</div>

			<div class="mt-5 flex justify-center">
				<Button
					onclick={handleNavigate}
					disabled={!selectedSession}
					class="group relative h-10 border border-primary bg-primary px-4 text-xs font-black tracking-wide text-primary-foreground uppercase transition-all duration-200 hover:bg-transparent hover:text-primary"
				>
					<div class="relative z-10 flex items-center gap-3">
						<span class="text-xs">Launch Replay</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="transition-transform group-hover:translate-x-1"
							><path d="m9 18 6-6-6-6" /></svg
						>
					</div>
				</Button>
			</div>
		</CardContent>
	</Card>
</div>
