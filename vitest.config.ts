import react from "@vitejs/plugin-react"
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },

  define: {
    __DEV__: true,
    __TARGET_BROWSER__: JSON.stringify("chrome"),
    __APP_VERSION__: JSON.stringify("3.0.0"),
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    // This filesystem writes AppleDouble sidecars next to every file.
    exclude: ["**/node_modules/**", "**/._*"],
  },
})
