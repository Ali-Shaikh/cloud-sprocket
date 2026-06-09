import "@cloudscape-design/global-styles/index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Gallery from "./dev/Gallery";
import { ThemeProvider } from "./lib/theme";
import "./styles/theme.css";
import "./styles.css";

// Dev-only: render the design-system gallery at #gallery without disturbing the app.
const Root = window.location.hash === "#gallery" ? Gallery : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </React.StrictMode>,
);
