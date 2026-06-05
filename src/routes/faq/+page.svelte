<script lang="ts">
	import Separator from "$lib/components/ui/separator/separator.svelte";
</script>

<svelte:head>
	<title>FullThrottle - FAQ</title>
	<meta
		name="description"
		content="Frequently Asked Questions about FullThrottle, including data sources, feature explanations, and project roadmap."
	/>
</svelte:head>

<div class="mx-auto max-w-4xl px-8 py-24">
	<div>
		<h1 class="mb-4 text-6xl font-black text-primary uppercase">FAQ</h1>
	</div>

	<Separator class="my-8" />

	<div class="flex flex-col gap-12">
		<div class="flex flex-col gap-3">
			<h3 class="text-xl font-bold text-foreground uppercase">
				Where does the data come from?
			</h3>
			<p class="leading-relaxed text-on-surface-muted">
				All data is sourced from <strong
					><a href="https://docs.fastf1.dev/" class="text-foreground underline"
						>FastF1</a
					></strong
				>, which pulls official timing and telemetry data directly from F1's
				live timing feeds and historical archives.
			</p>
		</div>

		<div class="flex flex-col gap-3">
			<h3 class="text-xl font-bold text-foreground uppercase">
				How do I use the telemetry charts?
			</h3>
			<p class="leading-relaxed text-on-surface-muted">
				Simply <strong>hover</strong> over any chart to see the synchronized
				data across all graphs and the track map. You can <strong>zoom</strong>
				by clicking and dragging on a section of the chart. Double-click the chart
				to <strong>reset</strong> the zoom.
			</p>
		</div>

		<div class="flex flex-col gap-3">
			<h3 class="text-xl font-bold text-foreground uppercase">
				What is "LiCO"?
			</h3>
			<p class="leading-relaxed text-on-surface-muted">
				<strong>Lift and Coast</strong> is a technique used by drivers to manage
				battery recharging or tyre temperatures. On our charts, segments where
				the driver is off the throttle ({"<20%"}) and not braking are
				highlighted as LiCO events.
			</p>
		</div>

		<div class="mt-4 flex flex-col gap-3">
			<h3 class="text-xl font-bold text-foreground uppercase">
				Is this official?
			</h3>
			<p class="text-sm leading-relaxed text-on-surface-muted italic">
				No. FullThrottle is a non-commercial project. This platform is not
				associated with the Formula 1 group of companies, Liberty Media, or
				Formula One Management. F1, FORMULA ONE, FORMULA 1, FIA FORMULA ONE
				WORLD CHAMPIONSHIP, GRAND PRIX and related marks are trade marks of
				Formula One Licensing B.V.
			</p>
		</div>

		<div class="mt-4 flex flex-col gap-3">
			<h3 class="text-xl font-bold text-foreground uppercase">
				Is this open source?
			</h3>
			<p class="text-sm leading-relaxed text-on-surface-muted">
				Yes, licensed under AGPLv3 <a
					class="text-primary hover:underline"
					href="https://github.com/chiroyce1/fullthrottle">here</a
				>.
			</p>
		</div>
	</div>
</div>
