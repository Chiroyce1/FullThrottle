/**
 * Fades an element in the first time it scrolls into view.
 *
 * Only elements still below the fold when the page loads are hidden, and
 * only once JavaScript runs, so server-rendered HTML (and crawlers) always
 * see everything and nothing above the fold flickers. Does nothing for
 * prefers-reduced-motion. `delay` (ms) staggers items in a group.
 */
export function reveal(node: HTMLElement, delay = 0) {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	if (node.getBoundingClientRect().top < window.innerHeight) return;

	node.classList.add("reveal");
	if (delay) node.style.transitionDelay = `${delay}ms`;

	const observer = new IntersectionObserver(
		([entry]) => {
			if (!entry.isIntersecting) return;
			node.classList.add("revealed");
			observer.disconnect();
		},
		{ rootMargin: "0px 0px -8% 0px" },
	);
	observer.observe(node);

	return { destroy: () => observer.disconnect() };
}
