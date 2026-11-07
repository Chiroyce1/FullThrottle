<script lang="ts">
	import type { WeatherSummary } from "$lib/types";

	let { weather }: { weather: WeatherSummary | null | undefined } = $props();

	const r1 = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(1));
</script>

{#if weather}
	<div class="flex items-center gap-x-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
		<span class="flex items-center gap-1.5 font-sans {weather.rainfall ? 'text-sky-500' : 'text-amber-500'}">
			<span class="h-1.5 w-1.5 rounded-full bg-current"></span>
			{weather.rainfall ? "Wet" : "Dry"}
		</span>
		<span title="Air temperature">Air <span class="text-foreground">{r1(weather.air_temp)}°C</span></span>
		<span title="Track temperature">Track <span class="text-foreground">{r1(weather.track_temp)}°C</span></span>
		<span title="Relative humidity">Hum <span class="text-foreground">{r1(weather.humidity)}%</span></span>
		{#if weather.wind_speed != null}
			<span title="Wind speed">Wind <span class="text-foreground">{r1(weather.wind_speed)} m/s</span></span>
		{/if}
	</div>
{:else}
	<span class="text-xs text-muted-foreground">Track conditions unavailable</span>
{/if}
