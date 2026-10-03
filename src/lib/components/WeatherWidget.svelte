<script lang="ts">
	import type { WeatherSummary } from "$lib/types";
	import { cn } from "$lib/utils";

	interface Props {
		weather: WeatherSummary | null | undefined;
		badge?: string;
		badgeColor?: string;
		label?: string;
		class?: string;
	}

	let { weather, badge, badgeColor, label, class: className = "" }: Props = $props();

	function round1(n: number | null | undefined): string {
		if (n == null) return "–";
		return n.toFixed(1);
	}
</script>

{#if weather}
<div class={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 font-mono text-[10px] text-on-surface-muted shrink-0 bg-surface-raised/40", className)}>
	{#if badge}
		<span
			class="inline-flex h-4 min-w-4 px-1 items-center justify-center rounded text-[9px] font-bold text-black shrink-0"
			style="background-color: {badgeColor || 'var(--color-primary, #e10600)'};"
		>
			{badge}
		</span>
	{/if}
	{#if label}
		<span class="font-bold text-on-surface text-[10px]">{label}</span>
	{/if}

	<!-- Conditions flag -->
	{#if weather.rainfall}
		<span class="inline-flex items-center gap-1 text-blue-400 font-bold uppercase tracking-wider">
			<span class="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
			Wet
		</span>
	{:else}
		<span class="inline-flex items-center gap-1 text-amber-400 font-bold uppercase tracking-wider">
			<span class="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
			Dry
		</span>
	{/if}

	<span title="Air temperature">
		<span class="text-on-surface-muted">Air</span>
		<span class="text-on-surface ml-1">{round1(weather.air_temp)}°C</span>
	</span>

	<span title="Track temperature">
		<span class="text-on-surface-muted">Track</span>
		<span class="text-on-surface ml-1">{round1(weather.track_temp)}°C</span>
	</span>

	<span title="Relative humidity">
		<span class="text-on-surface-muted">Humidity</span>
		<span class="text-on-surface ml-1">{round1(weather.humidity)}%</span>
	</span>

	{#if weather.wind_speed != null}
		<span title="Wind speed">
			<span class="text-on-surface-muted">Wind</span>
			<span class="text-on-surface ml-1">{round1(weather.wind_speed)} m/s</span>
		</span>
	{/if}
</div>
{/if}
