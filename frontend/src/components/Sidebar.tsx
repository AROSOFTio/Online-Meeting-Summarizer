"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar, CheckSquare, ChevronLeft, ChevronRight, LayoutDashboard, LogOut,
  Menu, PlusCircle, Settings, Users, X,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface PublicBranding {
  product_name: string;
  product_mark_url: string;
  organization_name: string;
  organization_logo_url: string;
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const brandingQuery = useQuery<PublicBranding>({
    queryKey: ["public-branding"],
    queryFn: () => apiRequest("/api/settings/branding"),
    staleTime: 5 * 60 * 1000,
  });
  if (!user) return null;

  const branding = brandingQuery.data || {
    product_name: "ConveneCore",
    product_mark_url: "/convenecore-mark.svg",
    organization_name: "Organization",
    organization_logo_url: "/api/settings/logo",
  };
  const isAdmin = user.role === "admin";
  const canEdit = isAdmin || user.role === "minute_secretary";
  const items = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard, show: true },
    { name: "Meetings", path: "/meetings", icon: Calendar, show: true },
    { name: "Action Items", path: "/action-items", icon: CheckSquare, show: true },
    { name: "Staff", path: "/staff", icon: Users, show: isAdmin },
    { name: "Settings", path: "/settings", icon: Settings, show: isAdmin },
  ].filter((item) => item.show);
  const desktopWidth = collapsed ? "lg:w-20" : "lg:w-64";
  const spacerWidth = collapsed ? "lg:w-20" : "lg:w-64";

  return <>
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between bg-blue-800 px-4 text-white lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={branding.product_mark_url} alt="ConveneCore" className="h-10 w-10 rounded-lg bg-white object-contain p-0.5" />
        <div className="min-w-0"><div className="truncate text-sm font-extrabold">{branding.product_name}</div><div className="truncate text-[9px] tracking-widest text-blue-100">{branding.organization_name}</div></div>
      </div>
      <button onClick={() => setMobileOpen((value) => !value)} className="rounded p-2 hover:bg-white/10" aria-label="Toggle navigation">{mobileOpen ? <X size={24}/> : <Menu size={24}/>}</button>
    </header>

    {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

    <aside className={`fixed bottom-0 left-0 top-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-slate-200 bg-white transition-all duration-300 lg:translate-x-0 ${desktopWidth} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={branding.product_mark_url} alt="ConveneCore" className="h-11 w-11 shrink-0 object-contain" />
          {!collapsed && <div className="min-w-0"><div className="truncate text-sm font-extrabold text-blue-950">{branding.product_name}</div><div className="text-[9px] font-semibold tracking-[0.14em] text-slate-500">MEETING INTELLIGENCE</div></div>}
        </div>
        <button onClick={() => setCollapsed((value) => !value)} className="hidden rounded p-1 text-slate-500 hover:bg-slate-100 lg:block" aria-label="Collapse sidebar">{collapsed ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>}</button>
      </div>

      {!collapsed && <div className="mx-3 mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src={branding.organization_logo_url} alt={branding.organization_name} className="h-9 w-9 shrink-0 rounded bg-white object-contain" />
        <div className="min-w-0"><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Workspace</div><div className="truncate text-xs font-bold text-slate-800">{branding.organization_name}</div></div>
      </div>}

      {canEdit && <div className="p-3 pb-1"><Link href="/create-meeting" onClick={() => setMobileOpen(false)} title={collapsed ? "New Meeting" : undefined} className={`flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-3 text-sm font-extrabold text-white hover:bg-blue-800 ${collapsed ? "px-2" : ""}`}><PlusCircle size={18}/>{!collapsed && <span>New Meeting</span>}</Link></div>}

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">{items.map((item) => {
        const active = pathname === item.path || (item.path === "/meetings" && pathname.startsWith("/meetings/"));
        const Icon = item.icon;
        return <Link key={item.path} href={item.path} onClick={() => setMobileOpen(false)} title={collapsed ? item.name : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}><Icon size={18}/>{!collapsed && <span>{item.name}</span>}</Link>;
      })}</nav>

      <div className="border-t border-slate-200 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2">{!collapsed && <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-900">{user.full_name}</div><div className="truncate text-xs capitalize text-slate-500">{user.role.replace("_", " ")}</div></div>}<button onClick={() => logout()} title="Log out" className="rounded p-2 text-slate-500 hover:bg-slate-200 hover:text-red-600"><LogOut size={18}/></button></div></div>
    </aside>
    <div className={`hidden shrink-0 transition-all duration-300 lg:block ${spacerWidth}`} />
  </>;
}
