import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'extensions/jaldi-cod-form/assets',
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, 'app/storefront/index.jsx'),
      name: 'JaldiCODForm',
      fileName: () => 'jaldi-cod-form.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') {
            return 'jaldi-cod-form.css';
          }
          return assetInfo.name;
        },
      },
    },
  },
});
