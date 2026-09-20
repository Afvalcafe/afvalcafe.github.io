import { readdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// Alle .html-pagina's in de hoofdmap worden gebouwd, ook nieuwe.
const pages = readdirSync('.').filter((f) => f.endsWith('.html'));

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: { input: pages },
  },
});
