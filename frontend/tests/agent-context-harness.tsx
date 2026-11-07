// Browser-only fixture. Its test intercepts all API requests and WebSockets.
import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { Workspace } from "../src/features/workspace/Workspace";
import type { ProjectContext } from "../src/app/types";
import { TooltipProvider } from "../src/components/ui/tooltip";
import "../src/index.css";

function Fixture() {
  const [context, setContext] = useState<ProjectContext | null>(null);
  const updateContext = useCallback((next: ProjectContext) => setContext(next), []);
  return <BrowserRouter>
    <nav className="flex gap-4 p-4" aria-label="Fixture projects">
      <Link to="/projects/fixture-a?tab=overview">Fixture A</Link>
      <Link to="/projects/fixture-b?tab=overview">Fixture B</Link>
      <output data-testid="active-context">{context ? `${context.projectId}:${context.mode}` : "loading"}</output>
    </nav>
    <Routes>
      <Route path="/projects/:id" element={<Workspace connected onContextChange={updateContext} />} />
      <Route path="*" element={<Navigate to="/projects/fixture-a?tab=overview" replace />} />
    </Routes>
  </BrowserRouter>;
}

createRoot(document.getElementById("root")!).render(<TooltipProvider><Fixture /></TooltipProvider>);
