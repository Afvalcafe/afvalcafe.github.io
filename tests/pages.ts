import { readdirSync } from 'node:fs';

// Zelfde ontdekking als vite.config.ts: elke .html in de hoofdmap is een pagina.
export const pages = readdirSync('.').filter((f) => f.endsWith('.html'));
