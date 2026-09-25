import { Link, NavLink, useLocation } from "react-router-dom";
import { Bell, Info, Layers, LayoutDashboard, PanelLeft, Settings as SettingsIcon } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { Mark } from "@/components/Mark";
import { ThemeSwitcher } from "@/theme";
import { strings } from "@/types";

const items = [
  { to: "/", label: strings.overview, Icon: LayoutDashboard, end: true },
  { to: "/projects", label: strings.projects, Icon: Layers, end: false },
  { to: "/events", label: strings.events, Icon: Bell, end: false },
  { to: "/settings", label: strings.settings, Icon: SettingsIcon, end: false },
];

export function AppSidebar({ projectCount, openEvents }: { projectCount: number; openEvents: number }) {
  const { isMobile, open, setOpenMobile, toggleSidebar } = useSidebar();
  const { pathname } = useLocation();
  const counts: Record<string, number | undefined> = { "/projects": projectCount, "/events": openEvents || undefined };
  const close = () => setOpenMobile(false);
  return (
    <Sidebar variant="floating" collapsible="icon" className="sidebar">
      <SidebarHeader className="px-3.5 pt-6 pb-[30px] group-data-[collapsible=icon]:px-2">
        <Link to="/" onClick={close} className="flex h-[35px] items-center gap-[9px] px-2 font-heading text-[23px] font-extrabold text-foreground group-data-[collapsible=icon]:px-0">
          <Mark />
          <span className="group-data-[collapsible=icon]:hidden">{strings.brand}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3.5 py-0 group-data-[collapsible=icon]:px-2">
          <SidebarGroupContent>
            <nav aria-label={isMobile ? "Mobile navigation" : "Main navigation"}>
              <SidebarMenu className="gap-[7px]">
                {items.map(({ to, label, Icon, end }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild tooltip={label} isActive={end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)} className="h-[46px] gap-3 rounded-[10px] border border-transparent px-3 text-sm text-subtle-foreground data-active:border-brand-border data-active:bg-brand-subtle data-active:font-normal data-active:text-foreground [&_svg]:size-[18px] data-active:[&_svg]:text-brand">
                      <NavLink to={to} end={end} aria-label={label} onClick={close}><Icon /><span>{label}</span></NavLink>
                    </SidebarMenuButton>
                    {counts[to] !== undefined && <SidebarMenuBadge className="top-1/2! right-3 h-auto min-w-0 -translate-y-1/2 rounded bg-secondary px-1.5 py-0.5 text-[11px] font-normal text-subtle-foreground">{counts[to]}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2.5 px-3.5 pt-2 pb-[18px] group-data-[collapsible=icon]:px-2">
        {isMobile && <ThemeSwitcher />}
        <div className="flex items-center gap-[9px] px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden"><Info className="size-3.5" />About Agentwin</div>
        <div className="flex items-center gap-[9px] rounded-[10px] border bg-glass px-2 pt-[13px] pb-3.5 group-data-[collapsible=icon]:hidden">
          <Mark className="size-6" />
          <div className="text-xs leading-tight"><strong className="block text-[13px] text-foreground">Agentwin MVP</strong><span className="text-muted-foreground">Every system.<br />Its own agent.</span></div>
        </div>
        {!isMobile && (
          <SidebarMenu className="border-t pt-2">
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleSidebar} tooltip={open ? "Collapse navigation" : "Expand navigation"} aria-label={open ? "Collapse navigation" : "Expand navigation"} aria-expanded={open} className="h-10 gap-2 px-2 text-[13px] text-subtle-foreground">
                <PanelLeft /><span>Collapse navigation</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
