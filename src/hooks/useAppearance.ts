import { useEffect } from "react"
import type { Settings } from "@/types"

/**
 * Stamps skin and resolved theme onto the document element, which is what the
 * token blocks in global.css key off. The system preference is resolved here
 * rather than in CSS so that an explicit choice always wins.
 */
export function useAppearance(settings: Settings): void {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.skin = settings.skin

    // The classic skin recreates a light-only interface.
    if (settings.skin === "classic") {
      root.dataset.theme = "light"
      return undefined
    }

    if (settings.theme !== "system") {
      root.dataset.theme = settings.theme
      return undefined
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = (): void => {
      root.dataset.theme = query.matches ? "dark" : "light"
    }

    apply()
    query.addEventListener("change", apply)

    return () => query.removeEventListener("change", apply)
  }, [settings.skin, settings.theme])
}
