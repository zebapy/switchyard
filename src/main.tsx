import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import { router } from "./router";
import "./styles.css";

// Disable the native webview right-click menu app-wide. It exposes browser
// chrome (Reload, Inspect, Back/Forward) that makes no sense in a desktop app.
// Allowed where a real menu belongs: terminals (xterm paste/copy), editable
// text fields, and anything that opts in with `data-native-context-menu`.
// base-ui ContextMenu triggers handle their own contextmenu event at the
// target before it bubbles here, so their custom menus still open.
const NATIVE_CONTEXT_MENU = '.terminal-pane, input, textarea, [contenteditable="true"], [data-native-context-menu]';
document.addEventListener("contextmenu", (event) => {
  const target = event.target as Element | null;
  if (target?.closest(NATIVE_CONTEXT_MENU)) return;
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
