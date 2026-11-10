<script lang="ts">
	import SEO from "$lib/components/SEO.svelte";

	const link =
		"text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground";
</script>

<SEO route="faq" />

{#snippet item(question: string, answer: import("svelte").Snippet)}
	<div class="grid gap-2 border-t border-border py-6 sm:grid-cols-[16rem_1fr] sm:gap-8">
		<h2 class="font-medium text-foreground">{question}</h2>
		<div class="text-muted-foreground">{@render answer()}</div>
	</div>
{/snippet}

<main class="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
	<p class="eyebrow">Help</p>
	<h1 class="display mt-2 mb-10 text-display-sm text-foreground sm:text-display-md">FAQ</h1>

	{#snippet data()}
		Recent sessions come from <a href="https://openf1.org" class={link}>OpenF1</a>, a free,
		community-run API for Formula 1 timing and telemetry, used under
		<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" class={link}>CC BY-NC-SA 4.0</a>.
		Earlier sessions were built with <a href="https://docs.fastf1.dev/" class={link}>FastF1</a>,
		the open-source Python library for F1's live timing feeds. Neither is affiliated with
		Formula 1, and neither is FullThrottle.
	{/snippet}
	{@render item("Where does the data come from?", data)}

	{#snippet charts()}
		Hover any chart to see synced values across every chart and the track map. Click and
		drag to <span class="text-foreground">zoom</span>; double-click to
		<span class="text-foreground">reset</span>.
	{/snippet}
	{@render item("How do I use the telemetry charts?", charts)}

	{#snippet lico()}
		<span class="text-foreground">Lift and coast</span> is when a driver comes off the
		throttle before braking, to save fuel or energy or manage tyres. A lift below the
		throttle threshold (20% by default, adjustable in
		<a href="/settings" class={link}>settings</a>) that coasts at least 60 m into a braking
		zone is highlighted as LiCO. Coasting through a corner between brake and throttle isn't.
	{/snippet}
	{@render item('What is "LiCO"?', lico)}

	{#snippet official()}
		No. FullThrottle is a non-commercial project, not associated with the Formula 1 group
		of companies, Liberty Media or Formula One Management. F1, Formula One, Formula 1,
		FIA Formula One World Championship, Grand Prix and related marks are trade marks of
		Formula One Licensing B.V.
	{/snippet}
	{@render item("Is this official?", official)}

	{#snippet oss()}
		Yes, under AGPLv3. The source is
		<a href="https://github.com/chiroyce1/fullthrottle" class={link}>on GitHub</a>.
	{/snippet}
	{@render item("Is this open source?", oss)}
</main>
