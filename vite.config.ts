import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'path';
import {defineConfig} from 'vite';
import {webShellPlugin} from './scripts/web-shell-plugin.ts';

export default defineConfig(() => {
  return {
    plugins: [
      ...(process.env.SERVEOS_LEGACY_BUILD==='true'?[legacy({targets:['Chrome >= 100','Edge >= 100','Firefox >= 102','Safari >= 15.4'],modernTargets:['Chrome >= 100','Edge >= 100','Firefox >= 102','Safari >= 15.4'],modernPolyfills:true})]:[]),
      react(), tailwindcss(), webShellPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      strictPort: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
