<script lang="ts">
	import SEO from "$lib/components/SEO.svelte";
	import SearchableSelect from "$lib/components/SearchableSelect.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Switch } from "$lib/components/app";
	import { settings, LICO_SENSITIVITY_OPTIONS } from "$lib/settings";
	import { browser } from "$app/environment";

	// ── Reactive local mirrors of the settings ─────────────────────────────
	let speedInterp = $state(browser ? settings.speedInterpolation : true);
	let throttleInterp = $state(browser ? settings.throttleInterpolation : true);
	let brakeInterp = $state(browser ? settings.brakeInterpolation : true);
	let dataFreq = $state(browser ? settings.dataFrequency.toString() : "8");
	let licoSensitivity = $state(
		browser ? settings.licoThrottleSensitivity.toString() : "15",
	);

	// Keep settings class in sync whenever local state changes
	$effect(() => {
		if (!browser) return;
		settings.speedInterpolation = speedInterp;
	});
	$effect(() => {
		if (!browser) return;
		settings.throttleInterpolation = throttleInterp;
	});
	$effect(() => {
		if (!browser) return;
		settings.brakeInterpolation = brakeInterp;
	});
	$effect(() => {
		if (!browser) return;
		const v = parseInt(dataFreq, 10);
		if (v === 2 || v === 4 || v === 8) settings.dataFrequency = v;
	});
	$effect(() => {
		if (!browser) return;
		const v = parseInt(licoSensitivity, 10);
		if (!isNaN(v)) settings.licoThrottleSensitivity = v;
	});

	function resetAll() {
		settings.resetAll();
		speedInterp = settings.speedInterpolation;
		throttleInterp = settings.throttleInterpolation;
		brakeInterp = settings.brakeInterpolation;
		dataFreq = settings.dataFrequency.toString();
		licoSensitivity = settings.licoThrottleSensitivity.toString();
	}

	const licoOptions = LICO_SENSITIVITY_OPTIONS.map((n) => ({
		value: n.toString(),
		label: `${n}%`,
	}));

	const DATA_FREQ_OPTIONS = [
		{ value: "2", label: "2 Hz" },
		{ value: "4", label: "4 Hz" },
		{ value: "8", label: "8 Hz" },
	];
</script>

{#snippet row(title: string, description: string, control: import("svelte").Snippet)}
	<div class="flex items-center justify-between gap-6 px-4 py-3.5">
		<div class="min-w-0">
			<div class="text-sm font-medium text-foreground">{title}</div>
			<div class="text-xs text-muted-foreground">{description}</div>
		</div>
		{@render control()}
	</div>
{/snippet}

{#snippet group(title: string, description: string, rows: import("svelte").Snippet)}
	<section class="flex flex-col gap-3">
		<div>
			<h2 class="text-base font-medium text-foreground">{title}</h2>
			<p class="mt-1 text-sm text-muted-foreground">{description}</p>
		</div>
		<div class="panel divide-y divide-border">{@render rows()}</div>
	</section>
{/snippet}

{#snippet selectControl(value: string, options: { value: string; label: string }[], onchange: (v: string) => void)}
	<SearchableSelect
		{value}
		{onchange}
		{options}
		placeholder={options.find((o) => o.value === value)?.label ?? value}
		searchPlaceholder="Search…"
		triggerClass="h-8 w-24 border-border bg-background text-sm font-normal text-foreground"
		contentClass="border-border bg-popover"
	/>
{/snippet}

<SEO route="settings" />

<main class="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
	<header>
		<p class="eyebrow">Preferences</p>
		<h1 class="display mt-2 text-display-sm text-foreground sm:text-display-md">Settings</h1>
		<p class="mt-2 text-muted-foreground">Saved in this browser.</p>
	</header>

	{#snippet dataRows()}
		{#snippet freq()}
			{@render selectControl(dataFreq, DATA_FREQ_OPTIONS, (v) => (dataFreq = v))}
		{/snippet}
		{@render row("Telemetry frequency", "Applies to replay and telemetry", freq)}
	{/snippet}
	{@render group(
		"Data quality",
		"Lower rates run smoother on older devices; 8 Hz is full resolution but uses more memory.",
		dataRows,
	)}

	{#snippet interpRows()}
		{#snippet speedSw()}<Switch label="Speed interpolation" bind:checked={speedInterp} />{/snippet}
		{#snippet throttleSw()}<Switch label="Throttle interpolation" bind:checked={throttleInterp} />{/snippet}
		{#snippet brakeSw()}<Switch label="Brake interpolation" bind:checked={brakeInterp} />{/snippet}
		{@render row("Speed", "Smooth the speed readout between frames", speedSw)}
		{@render row("Throttle", "Smooth the throttle arc between frames", throttleSw)}
		{@render row("Brake", "Smooth the brake arc between frames", brakeSw)}
	{/snippet}
	{@render group(
		"Replay gauges",
		"Interpolate the speedometer between raw telemetry samples.",
		interpRows,
	)}

	{#snippet licoRows()}
		{#snippet sens()}
			{@render selectControl(licoSensitivity, licoOptions, (v) => (licoSensitivity = v))}
		{/snippet}
		{@render row("Throttle threshold", "Maximum throttle % that counts as lifting", sens)}
	{/snippet}
	{@render group(
		"Lift and coast",
		"Stretches below this throttle with no braking are highlighted as LiCO on telemetry charts.",
		licoRows,
	)}

	<div class="flex justify-end">
		<Button variant="secondary" onclick={resetAll}>Reset to defaults</Button>
	</div>
</main>
