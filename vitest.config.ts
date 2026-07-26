import {defineConfig} from 'vitest/config';
import path from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'source'),
    },
  },

  define: {
    __DEV__: true,
    __TARGET_BROWSER__: JSON.stringify('chrome'),
    __APP_VERSION__: JSON.stringify('3.0.0'),
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    // This filesystem writes AppleDouble sidecars next to every file.
    exclude: ['**/node_modules/**', '**/._*'],
  },
});
