import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { SessionGate } from "./session-gate.js";
import "./tokens.css";

export function startCms(ticket: string | undefined): void {
  const root = document.getElementById("root");
  if (root === null) return;
  createRoot(root).render(<StrictMode><SessionGate ticket={ticket} /></StrictMode>);
}
