import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Plugin to copy CSS file to assets
const copyCssPlugin = () => ({
  name: 'copy-css',
  closeBundle() {
    const srcCss = path.resolve(__dirname, 'app/storefront/styles.css');
    const destCss = path.resolve(__dirname, 'extensions/preventify/assets/preventify.css');

    if (fs.existsSync(srcCss)) {
      fs.copyFileSync(srcCss, destCss);
      console.log('✓ Copied styles.css to preventify.css');
    } else {
      console.warn('⚠ Warning: styles.css not found at', srcCss);
    }
  }
});

export default defineConfig({
  plugins: [react(), copyCssPlugin()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'extensions/preventify/assets',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'app/storefront/index.jsx'),
      name: 'Preventify',
      fileName: () => 'preventify.js',
      formats: ['iife'],
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
});
