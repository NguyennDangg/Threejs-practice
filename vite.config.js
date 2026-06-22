import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "./",
  resolve: {
    dedupe: ["three"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        day01: resolve(__dirname, "day-01-rotating-cube/index.html"),
        day01Project: resolve(__dirname, "day01-project/index.html"),
        day02: resolve(__dirname, "day-02-orbitctrl-datgui/index.html"),
        day03: resolve(__dirname, "day-03-lighting-materials/index.html"),
        day04: resolve(__dirname, "day-04-gltf-hdr/index.html"),
        day05: resolve(__dirname, "day-05-modern-api/index.html"),
        day06: resolve(__dirname, 'day-06-glsl-fundamentals/index.html'),
        day06a: resolve(__dirname, "day-06-glsl-fundamentals/06a-shapes.html"),
        day06b: resolve(__dirname, "day-06-glsl-fundamentals/06b-patterns.html"),
        day06c: resolve(__dirname, "day-06-glsl-fundamentals/06c-radar.html"),
        day06d: resolve(__dirname, "day-06-glsl-fundamentals/06d-animated.html"),
        day06e: resolve(__dirname, "day-06-glsl-fundamentals/06e-song.html"),
        day06f: resolve(__dirname, "day-06-glsl-fundamentals/06f-diamond.html"),
        day06g: resolve(__dirname, "day-06-glsl-fundamentals/06g-gradient-warp.html"),
        day07: resolve(__dirname, "day-07/index.html"),
        day07a: resolve(__dirname, "day-07/07a-shear-only.html"),
      },
    },
  },
});
