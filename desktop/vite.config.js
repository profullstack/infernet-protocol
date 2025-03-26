import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath, URL } from 'url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '$components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '$stores': fileURLToPath(new URL('./src/stores', import.meta.url)),
      '$lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
      '$assets': fileURLToPath(new URL('./src/assets', import.meta.url))
    }
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
