/**
 * Regenerates the extension icons from the source logo.
 *
 * The logo is wider than it is tall, while extension icons must be square, so
 * it is fitted to a transparent square canvas rather than stretched. Run after
 * changing logo.png: `npm run icons`.
 */
import path from "node:path"
import process from "node:process"
import sharp from "sharp"

const ROOT = path.resolve(import.meta.dirname, "..")
const ICONS = path.join(ROOT, "src", "public", "assets", "icons")
// Kept outside the copied public directory so it does not ship in the build.
const SOURCE = path.join(ROOT, "assets", "logo.png")

/** The sizes the manifest declares, for the toolbar, menus and the store. */
const SIZES = [16, 32, 48, 128]

/**
 * A hair of breathing room only. The logo is far wider than it is tall, so a
 * square canvas already leaves it short of the vertical edges; spending more
 * on padding costs legibility at 16px, where the mark is smallest.
 */
const PADDING = 0.02

// Any transparent margin in the source would compound with that padding.
const trimmed = await sharp(SOURCE).trim().png().toBuffer()
const { width, height } = await sharp(trimmed).metadata()
if (!width || !height) throw new Error("Could not read the logo dimensions")

const side = Math.max(width, height)
const canvas = Math.round(side / (1 - PADDING * 2))

// One square master, downscaled per size so every icon shares the same framing.
const master = await sharp({
  create: {
    width: canvas,
    height: canvas,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: trimmed, gravity: "center" }])
  .png()
  .toBuffer()

for (const size of SIZES) {
  const out = path.join(ICONS, `favicon-${size}.png`)

  await sharp(master)
    .resize(size, size, { kernel: "lanczos3", fit: "contain" })
    .png({ compressionLevel: 9, palette: size <= 48 })
    .toFile(out)

  process.stdout.write(`favicon-${size}.png\n`)
}

process.stdout.write(`from ${width}x${height} logo on a ${canvas}px square canvas\n`)
