<script lang="ts">
	import { page } from "$app/state";
	import { onDestroy } from "svelte";
	import type { PageData } from "./$types";
	import SEO from "$lib/components/SEO.svelte";
	import AppHeader from "$lib/components/AppHeader.svelte";
	import { LoadingState, Notice } from "$lib/components/app";
	import DriverPanel from "$lib/components/replay/DriverPanel.svelte";
	import LapTraces from "$lib/components/replay/LapTraces.svelte";
	import Leaderboard from "$lib/components/replay/Leaderboard.svelte";
	import MapPanel from "$lib/components/replay/MapPanel.svelte";
	import Speedometer from "$lib/components/replay/Speedometer.svelte";
	import Transport from "$lib/components/replay/Transport.svelte";
	import { ReplayView } from "$lib/replay/replay-view.svelte";

	let { data }: { data: PageData } = $props();

	const view = new ReplayView(() => page.params);
	const engine = view.engine;

	if (typeof window !== "undefined") {
		window.addEventListener("pagehide", view.teardown);
		onDestroy(() => window.removeEventListener("pagehide", view.teardown));
	}
	onDestroy(view.teardown);

	/** Width at which the page becomes a fixed three-column workspace. */
	const DESKTOP = 1280;
	let innerWidth = $state(DESKTOP);
	const isDesktop = $derived(innerWidth >= DESKTOP);
</script>

<SEO replay={data?.sessionMeta} />

<svelte:window bind:innerWidth />

<div class="flex min-h-dvh flex-col bg-background text-foreground xl:h-dvh xl:overflow-hidden">
	<AppHeader variant="compact">
		{#snippet breadcrumb()}
			<span class="text-foreground">{page.params.year} · {view.sessionName}</span>
		{/snippet}
	</AppHeader>

	<main class="flex min-h-0 flex-1 flex-col gap-3 p-3">
		{#if view.telemetryIssue}
			<Notice class="rounded-md border">
				{view.telemetryIssue.message ||
					`Telemetry data has known issues for ${view.telemetryIssue.name || "this session"}.`}
			</Notice>
		{/if}

		{#if engine.isLoading}
			<LoadingState label="Loading session…" class="panel" />
		{:else if view.hasData}
			<Transport {view} />

			<!--
				One layout for every size. DOM order is the narrow-screen order
				(driver, map, lap traces, leaderboard). From xl: leaderboard down
				the left, map in the middle, driver + speedometer on the right,
				lap traces under both.
			-->
			<section
				class="grid grid-cols-1 gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,36rem)_minmax(0,1fr)_19rem] xl:grid-rows-[minmax(0,1fr)_minmax(15rem,40%)]"
			>
				{#if view.focusedDriver}
					<div
						class="grid gap-3 sm:grid-cols-2 xl:col-start-3 xl:row-start-1 xl:flex xl:min-h-0 xl:flex-col xl:overflow-y-auto"
					>
						<DriverPanel {view} />
						<div class="panel flex items-center justify-center px-3 py-4 xl:flex-1">
							<Speedometer telemetry={view.focusedTelemetry} id={view.focusedDriver} />
						</div>
					</div>
				{/if}

				<div class="aspect-square max-h-[70vh] w-full sm:aspect-video xl:col-start-2 xl:row-start-1 xl:aspect-auto xl:max-h-none xl:min-h-0">
					<MapPanel {view} />
				</div>

				{#if view.focusedDriver}
					<div class="xl:col-span-2 xl:col-start-2 xl:row-start-2 xl:min-h-0">
						<LapTraces {view} fill={isDesktop} />
					</div>
				{/if}

				<div class="h-[70vh] min-h-0 xl:col-start-1 xl:row-span-2 xl:row-start-1 xl:h-auto">
					<Leaderboard
						drivers={view.leaderboard}
						focusedDriver={view.focusedDriver}
						sessionMode={view.sessionMode}
						qualifyingData={engine.metadata?.qualifying}
						onSelect={view.focus}
					/>
				</div>
			</section>
		{:else}
			<div class="panel flex flex-1 items-center justify-center py-24">
				<p class="text-sm text-muted-foreground">Session data not available</p>
			</div>
		{/if}
	</main>
</div>
