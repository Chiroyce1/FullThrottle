/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  ssr: {
    noExternal: ["bits-ui"],
  },
  test: {
    // Playwright specs live in tests/visual and are run by `test:visual`
    include: ["src/**/*.test.ts"],
  },
});
