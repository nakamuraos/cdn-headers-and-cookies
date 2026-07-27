import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@/styles/global.css"
import { Popup } from "./Popup"

const container = document.getElementById("popup-root")

if (!container) {
  throw new Error("Could not find the popup root container")
}

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
