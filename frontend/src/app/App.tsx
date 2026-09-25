import { useCallback, useEffect, useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AddProject } from "@/features/projects/AddProject";
import { GlobalEvents } from "@/features/events/GlobalEvents";
import { Overview } from "@/features/overview/Overview";
import { GlobalSettings } from "@/features/settings/GlobalSettings";
import { Workspace } from "@/features/workspace/Workspace";
import { AppSidebar } from "./AppSidebar";
import { Topbar } from "./Topbar";
import type { ProjectContext } from "./types";
import { useWorkspaceData } from "./useWorkspaceData";

export function App() {
  const { states, connected, loaded, error, health, refresh } = useWorkspaceData();
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const route = useLocation();
  const updateProjectContext = useCallback((context: ProjectContext) => setProjectContext(context), []);
  useEffect(() => {
    if (!/^\/projects\/[^/]+$/.test(route.pathname)) setProjectContext(null);
    setSearchOpen(false);
  }, [route.pathname]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const page = document.querySelector("main.page");
    const motion = getComputedStyle(document.documentElement);
    const animation = page?.animate([{ opacity: 0.5, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: parseFloat(motion.getPropertyValue("--duration-fast")), easing: motion.getPropertyValue("--ease-smooth-out").trim() });
    return () => animation?.cancel();
  }, [route.pathname]);
  const openEvents = states.flatMap((state) => state.events).filter((event) => !event.recovered).length;
  const selectedProjectId = route.pathname.match(/^\/projects\/([^/]+)$/)?.[1] || null;
  return (
    <SidebarProvider open={railOpen} onOpenChange={setRailOpen} className="app-shell" style={{ "--sidebar-width": "254px" } as React.CSSProperties}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Skip to content</a>
      <AppSidebar projectCount={states.length} openEvents={openEvents} />
      <SidebarInset id="main-content" tabIndex={-1} className="min-w-0 bg-background [&>.page]:w-full">
        <Topbar states={states} connected={connected} health={health} projectContext={projectContext} selectedProjectId={selectedProjectId} searchOpen={searchOpen} onSearchOpenChange={setSearchOpen} />
        {error && (
          <Alert variant="destructive" className="mx-4 mt-4 w-auto md:mx-8">
            <AlertDescription className="flex items-center justify-between gap-3">{error}<Button size="sm" variant="outline" onClick={refresh}>Retry</Button></AlertDescription>
          </Alert>
        )}
        {!loaded ? (
          <div className="p-8 text-sm text-muted-foreground">Loading your workspace…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Overview states={states} />} />
            <Route path="/projects" element={<Overview states={states} projectOnly />} />
            <Route path="/projects/:id" element={<Workspace connected={connected} onContextChange={updateProjectContext} />} />
            <Route path="/projects/new" element={<AddProject />} />
            <Route path="/events" element={<GlobalEvents states={states} />} />
            <Route path="/settings" element={<GlobalSettings states={states} />} />
            <Route path="*" element={<div className="p-8 text-sm text-muted-foreground">Page not found. <Link className="text-brand underline" to="/">Return to overview</Link></div>} />
          </Routes>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
