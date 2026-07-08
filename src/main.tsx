import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import { useUiStore } from "./stores/ui";
import "./styles.css";

// The standard chrome and the Zen layout are each lazy so only one whole
// interface's module graph loads — flipping zenMode swaps which is mounted.
const StandardApp = lazy(() => import("./StandardApp").then((m) => ({ default: m.StandardApp })));
const ZenApp = lazy(() => import("./zen/ZenApp").then((m) => ({ default: m.ZenApp })));

function Root() {
  const zenMode = useUiStore((s) => s.zenMode);
  return <Suspense fallback={null}>{zenMode ? <ZenApp /> : <StandardApp />}</Suspense>;
}

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
    <Root />
  </React.StrictMode>,
);
