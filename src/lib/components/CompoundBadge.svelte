<script lang="ts">
	import { COMPOUND_COLORS } from "$lib/types";

	const { compound, size = 36 } = $props<{
		compound: string; // e.g. 'SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'
		size?: number;
	}>();

	const color = $derived(
		COMPOUND_COLORS[compound] ?? COMPOUND_COLORS.UNKNOWN ?? "#888",
	);
	const cx = $derived(size / 2);
	const r = $derived(size * 0.39); // radius ≈ 39% of size
	const sw = $derived(Math.max(1.5, size * 0.097)); // stroke-width
	const fs = $derived(Math.max(7, size * 0.3)); // font-size
	const letter = $derived(compound ? compound.charAt(0) : "?");
</script>

<!--
	F1-style compound ring badge.
	30° gaps centered at 6-o'clock (90°) and 12-o'clock (270°).
	SVG angles: 0° = 3-o'clock, clockwise.
	  Gap 1: 75°–105° (6 o'clock)
	  Gap 2: 255°–285° (12 o'clock)
	  Arcs:  0→75 (75°), 105→255 (150°), 285→360 (75°)
	  dasharray: 75 30 150 30 75  (with pathLength=360)
-->
<svg
	width={size}
	height={size}
	viewBox={`0 0 ${size} ${size}`}
	aria-label={compound}
>
	<circle
		{cx}
		cy={cx}
		{r}
		fill="none"
		stroke={color}
		stroke-width={sw}
		stroke-linecap="round"
		pathLength="360"
		stroke-dasharray="75 30 150 30 75"
		stroke-dashoffset="0"
	/>
	<text
		x={cx}
		y={cx - 1}
		dominant-baseline="central"
		text-anchor="middle"
		font-size={fs * 1.3}
		font-weight="800"
		font-family="IBM Plex Sans, system-ui"
		fill={color}>{letter}</text
	>
</svg>
