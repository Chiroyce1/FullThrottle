#!/usr/bin/env node
/**
 * UI guardrails: fails when markup drifts from the design system
 * (rules documented at the top of src/routes/layout.css).
 * Vendored shadcn primitives in src/lib/components/ui are exempt.
 *
 *   bun run lint:ui
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const EXEMPT = [join("src", "lib", "components", "ui")];
const MAX_PAGE_LINES = 300;

const RULES = [
	{ re: /\btext-\[\d+(\.\d+)?px\]/, msg: "hard-coded text size; use text-2xs…text-lg (11px floor)" },
	{ re: /\b(bg|text|border|fill|stroke|ring|from|to)-\[#[0-9a-fA-F]{3,8}\]/, msg: "raw hex colour; use a theme token" },
	{ re: /\bfont-black\b/, msg: "font-black is outside the type scale; use font-medium/semibold/bold" },
	{ re: /\btracking-(widest|\[0\.\d+em\])/, msg: "wide tracking is reserved for .eyebrow" },
	{ re: /\buppercase\b/, msg: "uppercase is reserved for .eyebrow and .display" },
	{ re: /\b(bg|text|border|ring)-(surface|on-surface|divider)\b|var\(--(surface|on-surface|divider)/, msg: "legacy token; use background/card/muted/border/foreground" },
];

function* svelteFiles(dir) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) yield* svelteFiles(path);
		else if (name.endsWith(".svelte")) yield path;
	}
}

const problems = [];
for (const file of svelteFiles(SRC)) {
	const rel = relative(ROOT, file);
	if (EXEMPT.some((e) => rel.startsWith(e))) continue;
	const lines = readFileSync(file, "utf8").split("\n");

	lines.forEach((line, i) => {
		for (const { re, msg } of RULES) {
			if (re.test(line)) problems.push(`${rel}:${i + 1}  ${msg}\n    ${line.trim().slice(0, 120)}`);
		}
	});

	if (rel.includes(join("src", "routes")) && rel.endsWith("+page.svelte") && lines.length > MAX_PAGE_LINES) {
		problems.push(
			`${rel}  ${lines.length} lines (max ${MAX_PAGE_LINES}): move logic into a view class and regions into components`,
		);
	}
}

if (problems.length > 0) {
	console.error(`lint:ui found ${problems.length} problem(s):\n`);
	console.error(problems.join("\n"));
	process.exit(1);
}
console.log("lint:ui ok");
