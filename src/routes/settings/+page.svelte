<script lang="ts">
	import SEO from "$lib/components/SEO.svelte";
	import SearchableSelect from "$lib/components/SearchableSelect.svelte";
	import { Separator } from "$lib/components/ui/separator";
	import { Button } from "$lib/components/ui/button";
	import { settings, LICO_SENSITIVITY_OPTIONS } from "$lib/settings";
	import { browser } from "$app/environment";

	// ── Reactive local mirrors of the settings ─────────────────────────────
	let speedInterp = $state(browser ? settings.speedInterpolation : true);
	let throttleInterp = $state(browser ? settings.throttleInterpolation : true);
	let brakeInterp = $state(browser ? settings.brakeInterpolation : true);
	let dataFreq = $state(browser ? settings.dataFrequency.toString() : "4");
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

<SEO route="settings" />

<main class="mx-auto w-full max-w-3xl flex-1 px-4 py-16 md:px-8 md:py-24">
	<!-- Page header -->
	<div class="mb-10">
		<h1
			class="mb-2 text-5xl font-black tracking-tighter text-primary uppercase"
		>
			Settings
		</h1>
		<p class="font-mono text-sm text-muted-foreground uppercase tracking-wider">
			Customise telemetry display preferences
		</p>
	</div>

	<Separator class="mb-10 opacity-20" />

	<!-- ── Data Quality & Memory ────────────────────────────────────────── -->
	<section class="mb-10">
		<div class="mb-5">
			<h2 class="text-sm font-bold text-primary uppercase">
				Data Quality &amp; Memory
			</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Select the telemetry refresh rate (Hz). Lower levels run smoother on
				older devices, 8 Hz has full resolution but uses more memory.
			</p>
		</div>

		<div
			class="flex items-center justify-between rounded-lg border border-divider bg-surface-raised/60 px-4 py-3.5 sm:px-5 sm:py-4"
		>
			<div class="flex flex-col gap-0.5">
				<span class="text-sm font-bold text-on-surface">Telemetry Frequency</span>
				<span class="font-mono text-xs text-muted-foreground">
					Applies to both Replay and Telemetry pages
				</span>
			</div>

			<SearchableSelect
				bind:value={dataFreq}
				options={DATA_FREQ_OPTIONS}
				placeholder={`${dataFreq} Hz`}
				searchPlaceholder="Search frequency..."
				triggerClass="w-24 rounded-md border-divider bg-surface text-on-surface transition-all hover:border-red-600/50"
				contentClass="rounded-md border-divider bg-surface"
			/>
		</div>
	</section>

	<Separator class="mb-10 opacity-20" />

	<!-- ── Replay Telemetry ─────────────────────────────────────────────── -->
	<section class="mb-10">
		<div class="mb-5">
			<h2 class="text-sm font-bold text-primary uppercase">
				Replay — Telemetry Interpolation
			</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				When enabled, the animated gauges on the replay page smoothly
				interpolate between raw telemetry values.
			</p>
		</div>

		<div class="flex flex-col gap-3">
			<!-- Speed interpolation -->
			<div
				class="flex items-center justify-between rounded-lg border border-divider bg-surface-raised/60 px-4 py-3.5 sm:px-5 sm:py-4"
			>
				<div class="flex flex-col gap-0.5">
					<span class="text-sm font-bold text-on-surface">Speed Interpolation</span>
					<span class="font-mono text-xs text-muted-foreground">
						Smooth the speed display between frames
					</span>
				</div>
				<!-- Pill toggle -->
				<div class="flex shrink-0 overflow-hidden rounded-md border border-divider bg-surface">
					<button
						class="px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors {speedInterp ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (speedInterp = true)}
					>On</button>
					<button
						class="px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors {!speedInterp ? 'bg-surface-overlay text-foreground' : 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (speedInterp = false)}
					>Off</button>
				</div>
			</div>

			<!-- Throttle interpolation -->
			<div
				class="flex items-center justify-between rounded-lg border border-divider bg-surface-raised/60 px-4 py-3.5 sm:px-5 sm:py-4"
			>
				<div class="flex flex-col gap-0.5">
					<span class="text-sm font-bold text-on-surface">Throttle Interpolation</span>
					<span class="font-mono text-xs text-muted-foreground">
						Smooth the throttle gauge between frames
					</span>
				</div>
				<div class="flex shrink-0 overflow-hidden rounded-md border border-divider bg-surface">
					<button
						class="px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors {throttleInterp ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (throttleInterp = true)}
					>On</button>
					<button
						class="px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors {!throttleInterp ? 'bg-surface-overlay text-foreground' : 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (throttleInterp = false)}
					>Off</button>
				</div>
			</div>

			<!-- Brake interpolation -->
			<div
				class="flex items-center justify-between rounded-lg border border-divider bg-surface-raised/60 px-4 py-3.5 sm:px-5 sm:py-4"
			>
				<div class="flex flex-col gap-0.5">
					<span class="text-sm font-bold text-on-surface">Brake Interpolation</span>
					<span class="font-mono text-xs text-muted-foreground">
						Smooth the brake gauge between frames
					</span>
				</div>
				<div class="flex shrink-0 overflow-hidden rounded-md border border-divider bg-surface">
					<button
						class="px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors {brakeInterp ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (brakeInterp = true)}
					>On</button>
					<button
						class="px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider transition-colors {!brakeInterp ? 'bg-surface-overlay text-foreground' : 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (brakeInterp = false)}
					>Off</button>
				</div>
			</div>
		</div>
	</section>

	<Separator class="mb-10 opacity-20" />

	<!-- ── LiCO ─────────────────────────────────────────────────────────── -->
	<section class="mb-10">
		<div class="mb-5">
			<h2 class="text-sm font-bold text-primary uppercase">
				LiCO — Lift and Coast Detection
			</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Segments where throttle is below this threshold and the driver is not
				braking are highlighted as LiCO (Lift and Coast) events.
			</p>
		</div>

		<div
			class="flex items-center justify-between rounded-lg border border-divider bg-surface-raised/60 px-4 py-3.5 sm:px-5 sm:py-4"
		>
			<div class="flex flex-col gap-0.5">
				<span class="text-sm font-bold text-on-surface">Throttle Sensitivity</span>
				<span class="font-mono text-xs text-muted-foreground">
					Maximum throttle % to classify a segment as LiCO
				</span>
			</div>

			<SearchableSelect
				bind:value={licoSensitivity}
				options={licoOptions}
				placeholder={`${licoSensitivity}%`}
				searchPlaceholder="Search sensitivity..."
				triggerClass="w-24 rounded-md border-divider bg-surface text-on-surface transition-all hover:border-red-600/50"
				contentClass="rounded-md border-divider bg-surface"
			/>
		</div>
	</section>

	<Separator class="mb-10 opacity-20" />

	<!-- ── Reset ─────────────────────────────────────────────────────────── -->
	<div class="flex justify-end">
		<Button
			variant="outline"
			onclick={resetAll}
			class="border-divider bg-transparent font-mono text-sm font-bold tracking-widest text-muted-foreground uppercase transition-colors hover:border-foreground/40 hover:text-foreground"
		>
			Reset to Defaults
		</Button>
	</div>
</main>
