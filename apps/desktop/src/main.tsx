// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProviders } from "./components/app-providers";
import Gallery from "./dev/Gallery";
import "./styles/theme.css";

// Dev-only: render the design-system gallery at #gallery without disturbing the app.
const Root = window.location.hash === "#gallery" ? Gallery : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProviders>
      <Root />
    </AppProviders>
  </React.StrictMode>,
);
