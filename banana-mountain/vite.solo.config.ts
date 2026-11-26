// Solo-Version als EINE HTML-Datei (zum Spielen ohne Server, z. B. als claude.ai-Seite)
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { 'import.meta.env.VITE_SOLO': JSON.stringify('1') },
  build: {
    outDir: 'dist-solo',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
