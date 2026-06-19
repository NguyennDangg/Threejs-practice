import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        day01: resolve(__dirname, 'day-01-rotating-cube/index.html'),
        day01Project: resolve(__dirname, 'day01-project/index.html'),
        day02: resolve(__dirname, 'day-02-orbitctrl-datgui/index.html'),
        day03: resolve(__dirname, 'day-03-lighting-materials/index.html'),
        day04: resolve(__dirname, 'day-04-gltf-hdr/index.html')
      }
    }
  }
});