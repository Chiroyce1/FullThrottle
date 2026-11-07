<script lang="ts">
	/** Accessible on/off switch. */
	let { checked = $bindable(false), label }: { checked?: boolean; label: string } = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	onclick={() => (checked = !checked)}
	class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {checked
		? 'bg-primary'
		: 'bg-border-strong'}"
>
	<span
		class="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform {checked
			? 'translate-x-4.5'
			: 'translate-x-0.5'}"
	></span>
</button>
