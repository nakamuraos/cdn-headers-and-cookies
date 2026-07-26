import {defineConfig} from 'vite';
import path from 'node:path';
import process from 'node:process';
import {readFileSync} from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import zipPack from 'vite-plugin-zip-pack';
import checker from 'vite-plugin-checker';
import clean from 'vite-plugin-clean';
import WextManifest from 'vite-plugin-wext-manifest';

import type {Plugin} from 'vite';

export default defineConfig(({mode}) => {
  const isDevelopment = mode !== 'production';
  const sourcePath = path.resolve(__dirname, 'source');
  const destPath = path.resolve(__dirname, 'extension');
  const targetBrowser = process.env.TARGET_BROWSER || 'chrome';

  const outDir = path.resolve(destPath, targetBrowser);
  const zipFileName =
    targetBrowser === 'firefox' ? `${targetBrowser}.xpi` : `${targetBrowser}.zip`;

  return {
    root: sourcePath,

    publicDir: path.resolve(sourcePath, 'public'),

    resolve: {
      alias: {
        '@': sourcePath,
      },
    },

    define: {
      __DEV__: isDevelopment,
      __TARGET_BROWSER__: JSON.stringify(targetBrowser),
      __APP_VERSION__: JSON.stringify(
        (
          JSON.parse(
            readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')
          ) as {version: string}
        ).version
      ),
    },

    plugins: [
      react(),
      tailwindcss(),

      clean({targetFiles: [path.resolve(destPath, zipFileName)]}) as Plugin,

      checker({typescript: {tsconfigPath: './tsconfig.json'}}),

      WextManifest({manifestPath: 'manifest.json', usePackageJSONVersion: true}),

      !isDevelopment &&
        zipPack({
          inDir: outDir,
          outDir: destPath,
          outFileName: zipFileName,
          enableLogging: true,
        }),
    ],

    build: {
      outDir,
      emptyOutDir: !isDevelopment,
      sourcemap: isDevelopment ? 'inline' : false,
      minify: mode === 'production',

      rolldownOptions: {
        input: {
          popup: path.resolve(sourcePath, 'Popup/popup.html'),
          options: path.resolve(sourcePath, 'Options/options.html'),
          background: path.resolve(sourcePath, 'Background/index.ts'),
        },

        output: {
          entryFileNames: 'assets/js/[name].bundle.js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.names?.[0]?.match(/\.css$/)) {
              return 'assets/css/[name]-[hash].css';
            }
            return 'assets/[name]-[hash].[ext]';
          },
          chunkFileNames: 'assets/js/[name]-[hash].chunk.js',

          // Diagnostic statements are stripped by the minifier, so production
          // bundles ship without console output.
          minify:
            mode === 'production' &&
            ({
              compress: {dropConsole: true, dropDebugger: true},
              mangle: true,
              codegen: true,
            } as const),
        },
      },
    },
  };
});
