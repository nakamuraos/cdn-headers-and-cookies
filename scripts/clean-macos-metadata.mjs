/**
 * Removes the AppleDouble sidecars (`._name`) and `.DS_Store` files that macOS
 * writes on volumes without native extended-attribute support. Store listings
 * reject archives that contain them.
 *
 * Exported for the build config, which strips them while packing; run as the
 * last step of a build it sweeps the repository, which also catches the sidecar
 * the filesystem creates for the archive itself after the bundler process has
 * let go of it.
 */
import { existsSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"
import process from "node:process"

/** Directories not worth walking: not ours to clean, and large. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"])

/** @param {string} name */
export const isMacOSMetadata = (name) => name.startsWith("._") || name === ".DS_Store"

/**
 * @param {string} dir
 * @param {{recursive?: boolean}} [options]
 */
export const removeMacOSMetadata = (dir, { recursive = true } = {}) => {
  if (!existsSync(dir)) return

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.resolve(dir, entry.name)

    if (isMacOSMetadata(entry.name)) {
      rmSync(entryPath, { force: true, recursive: true })
    } else if (recursive && entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
      removeMacOSMetadata(entryPath)
    }
  }
}

if (process.argv[1] === import.meta.filename) {
  removeMacOSMetadata(path.resolve(import.meta.dirname, ".."))
}
