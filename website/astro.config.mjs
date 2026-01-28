import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://proassist.app', // Placeholder - should be updated to actual domain
  output: 'static',
  outDir: '../docs',
  integrations: [icon(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    assets: 'assets',
  },
});
