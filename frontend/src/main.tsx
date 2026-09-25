import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@xyflow/react/dist/style.css";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./index.css";
import { ThemeProvider } from "./theme";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider><App /></ThemeProvider>
  </BrowserRouter>,
);
