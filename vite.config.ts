import { defineConfig } from 'vite';

// Alleen de vijverpagina wordt gebouwd; de rest van de site blijft ongewijzigd (zie deploy-workflow).
export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: ['pond.html'],
    },
  },
});
