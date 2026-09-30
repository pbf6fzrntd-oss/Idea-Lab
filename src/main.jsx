import React from "react";
import ReactDOM from "react-dom/client";
import AccessGate from "./AccessGate.jsx";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AccessGate><App /></AccessGate>
  </React.StrictMode>
);
