import "./tokens.css";
import React from "react";
import ReactDOM from "react-dom/client";
import FarewellPage from "./FarewellPage.jsx";
import { SUNSET_MODE } from "./sunset.js";

const root = ReactDOM.createRoot(document.getElementById("root"));

// While the sunset flag is on, App.jsx stays in the repo but the import
// below is dead code, so the production build does not ship the app.
// Set SUNSET_MODE to false in sunset.js and rebuild to mount it again.
if (SUNSET_MODE) {
  root.render(
    <React.StrictMode>
      <FarewellPage />
    </React.StrictMode>
  );
} else {
  import("./App.jsx").then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
}

// Register PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Partiqule SW registered:', reg.scope))
      .catch(err => console.log('SW registration failed:', err));
  });
}

