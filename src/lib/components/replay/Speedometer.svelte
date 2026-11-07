<script lang="ts">
	import * as d3 from "d3";
	import { Tween } from "svelte/motion";
	import { linear } from "svelte/easing";
	import { settings } from "$lib/settings";
	import type { TelemetryFrameRow } from "$lib/types";

	/** Speed arc with throttle/brake pedal arcs, gear and RPM. */
	let { telemetry, id }: { telemetry: TelemetryFrameRow | undefined; id: string } = $props();

	const speed = $derived(telemetry?.speed ?? 0);
	const gear = $derived(telemetry?.n_gear ?? 0);
	const rpm = $derived(telemetry?.rpm ?? 0);
	const throttle = $derived(telemetry?.throttle ?? 0);
	const brake = $derived.by(() => {
		const raw = telemetry?.brake ?? 0;
		if (typeof raw === "boolean") return raw ? 100 : 0;
		const val = Number(raw);
		return val > 0 && val <= 1 ? val * 100 : val;
	});

	const smoothSpeed = new Tween(0, { duration: 100, easing: linear });
	const smoothRpm = new Tween(0, { duration: 100, easing: linear });
	const smoothThrottle = new Tween(0, { duration: 100, easing: linear });
	const smoothBrake = new Tween(0, { duration: 100, easing: linear });

	// Tween across ~85% of one sample interval so the gauge stays smooth at
	// any sample rate without lagging behind the data.
	const tweenDuration = $derived(Math.round((1000 / (settings.dataFrequency || 8)) * 0.85));

	$effect(() => {
		smoothSpeed.set(speed, { duration: settings.speedInterpolation ? tweenDuration : 0 });
		smoothRpm.set(rpm, { duration: tweenDuration });
		smoothThrottle.set(throttle, { duration: settings.throttleInterpolation ? tweenDuration : 0 });
		smoothBrake.set(brake, { duration: settings.brakeInterpolation ? tweenDuration : 0 });
	});

	// ── Geometry (viewBox 160×120) ──────────────────────────────────────
	const cx = 80;
	const cy = 85;
	const MAX_SPEED = 360;

	const speedRadius = 65;
	const speedStartDeg = 145;
	const speedEndDeg = 395;
	const speedArcLen = (speedRadius * (speedEndDeg - speedStartDeg) * Math.PI) / 180;

	const pedalRadius = 52;
	const pedalSweepDeg = 124;
	const pedalArcLen = (pedalRadius * pedalSweepDeg * Math.PI) / 180;

	function arc(r: number, startDeg: number, endDeg: number, anticlockwise = false) {
		const p = d3.path();
		p.arc(cx, cy, r, (startDeg * Math.PI) / 180, (endDeg * Math.PI) / 180, anticlockwise);
		return p.toString();
	}

	const speedPath = arc(speedRadius, speedStartDeg, speedEndDeg);
	const throttlePath = arc(pedalRadius, speedStartDeg, speedStartDeg + pedalSweepDeg);
	const brakePath = arc(pedalRadius, speedEndDeg, speedEndDeg - pedalSweepDeg, true);
	const brakeLabelPath = arc(pedalRadius, speedEndDeg - pedalSweepDeg, speedEndDeg);

	const ticks = [50, 100, 150, 200, 250, 300, 350].map((tick) => {
		const a = ((speedStartDeg + (tick / MAX_SPEED) * (speedEndDeg - speedStartDeg)) * Math.PI) / 180;
		return { tick, x: cx + speedRadius * Math.cos(a), y: cy + speedRadius * Math.sin(a) };
	});

	const offset = (len: number, value: number, max: number) =>
		len - (len * Math.min(value, max)) / max;
</script>

<div class="relative mx-auto aspect-4/3 w-full max-w-[17rem]">
	<svg viewBox="0 0 160 120" class="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
		<path d={speedPath} fill="none" stroke="var(--border-strong)" stroke-width="10" />
		<path
			d={speedPath}
			fill="none"
			stroke="#3b82f6"
			stroke-width="10"
			stroke-dasharray={speedArcLen}
			stroke-dashoffset={offset(speedArcLen, smoothSpeed.current, MAX_SPEED)}
		/>
		{#each ticks as t (t.tick)}
			<text
				x={t.x}
				y={t.y + 2}
				font-size="5"
				font-weight="600"
				text-anchor="middle"
				alignment-baseline="central"
				fill="var(--muted-foreground)"
				class="font-mono">{t.tick}</text
			>
		{/each}

		<path id="thr-{id}" d={throttlePath} fill="none" stroke="var(--border-strong)" stroke-width="10" />
		<path
			d={throttlePath}
			fill="none"
			stroke="#22c55e"
			stroke-width="10"
			stroke-dasharray={pedalArcLen}
			stroke-dashoffset={offset(pedalArcLen, smoothThrottle.current, 100)}
		/>
		<text dy="2" font-size="5.5" font-weight="600" fill="var(--foreground)" class="pointer-events-none font-sans">
			<textPath href="#thr-{id}" startOffset="50%" text-anchor="middle">Throttle</textPath>
		</text>

		<path d={brakePath} fill="none" stroke="var(--border-strong)" stroke-width="10" />
		<path id="brk-{id}" d={brakeLabelPath} fill="none" stroke="none" />
		<path
			d={brakePath}
			fill="none"
			stroke="#dc2626"
			stroke-width="10"
			stroke-dasharray={pedalArcLen}
			stroke-dashoffset={offset(pedalArcLen, smoothBrake.current, 100)}
		/>
		<text dy="2" font-size="5.5" font-weight="600" fill="var(--foreground)" class="pointer-events-none font-sans">
			<textPath href="#brk-{id}" startOffset="50%" text-anchor="middle">Brake</textPath>
		</text>
	</svg>

	<div class="absolute top-[68%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
		<span class="font-mono text-5xl leading-none font-semibold tracking-tight text-foreground tabular-nums">
			{Math.round(smoothSpeed.current)}
		</span>
		<span class="text-xs text-muted-foreground">km/h</span>
		<span class="mt-1 flex items-baseline gap-1">
			<span class="font-mono text-2xl leading-none font-semibold text-foreground tabular-nums"
				>{gear === 0 ? "N" : gear === -1 ? "R" : gear || "N"}</span
			>
			<span class="text-xs text-muted-foreground">gear</span>
		</span>
		<span class="mt-1 font-mono text-xs tabular-nums {smoothRpm.current > 11000 ? 'text-red-500' : 'text-muted-foreground'}">
			{Math.round(smoothRpm.current)} rpm
		</span>
	</div>
</div>
