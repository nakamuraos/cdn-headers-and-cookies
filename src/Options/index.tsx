import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/styles/global.css"
import { Options } from "./Options"

const container = document.getElementById("options-root")

if (!container) {
  throw new Error("Could not find the options root container")
}

createRoot(container).render(
  <StrictMode>
    <Options />
  </StrictMode>,
)
