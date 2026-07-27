import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Popup } from "@/Popup/Popup"
import "@/styles/global.css"

const container = document.getElementById("popup-root")

if (!container) {
  throw new Error("Could not find the panel root container")
}

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
