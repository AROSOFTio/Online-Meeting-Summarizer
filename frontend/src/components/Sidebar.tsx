"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar, CheckSquare, ChevronLeft, ChevronRight, LayoutDashboard, LogOut,
  Menu, Mic, PlusCircle, Settings, Users, X,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!user) return null;

  const isAdmin = user.role === "admin";
  const canEdit = isAdmin || user.role === "minute_secretary";
  const items = [
    { name: "Overview", path: "/dashboard", icon: LayoutDashboard, show: true },
    { name: "Schedule & Invite", path: "/create-meeting", icon: PlusCircle, show: canEdit },
    { name: "Record / Upload", path: "/meetings/new", icon: Mic, show: canEdit },
    { name: "Join Meeting", path: "/join-meeting", icon: Users, show: true },
    { name: "Meetings", path: "/meetings", icon: Calendar, show: true },
    { name: "Action Items", path: "/action-items", icon: CheckSquare, show: true },
    { name: "Staff", path: "/staff", icon: Users, show: isAdmin },
    { name: "System Settings", path: "/settings", icon: Settings, show: isAdmin },
  ].filter((item) => item.show);
  const desktopWidth = collapsed ? "lg:w-20" : "lg:w-64";
  const spacerWidth = collapsed ? "lg:w-20" : "lg:w-64";

  return <>
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between bg-blue-800 px-4 text-white lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}<img src="/logo.svg" alt="Starlight S.S" className="h-10 w-10 rounded bg-white object-contain p-0.5" />
        <div className="min-w-0"><div className="truncate text-xs font-bold">STARLIGHT S.S</div><div className="text-[9px] tracking-widest text-blue-100">RISE AND SHINE</div></div>
      </div>
      <button onClick={() => setMobileOpen((value) => !value)} className="rounded p-2 hover:bg-white/10" aria-label="Toggle navigation">{mobileOpen ? <X size={24}/> : <Menu size={24}/>}</button>
    </header>
    {mobileOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}
    <aside className={`fixed bottom-0 left-0 top-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-gray-200 bg-white transition-all duration-300 lg:translate-x-0 ${desktopWidth} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src="/logo.svg" alt="Starlight S.S" className="h-11 w-11 shrink-0 object-contain" />
          {!collapsed && <div className="min-w-0"><div className="truncate text-xs font-extrabold text-blue-900">STARLIGHT S.S</div><div className="text-[9px] font-semibold tracking-[0.14em] text-gray-500">MEETING SUMMARIZER</div></div>}
        </div>
        <button onClick={() => setCollapsed((value) => !value)} className="hidden rounded p-1 text-gray-500 hover:bg-gray-100 lg:block">{collapsed ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>}</button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">{items.map((item) => {
        const active = pathname === item.path || (item.path === "/meetings" && pathname.startsWith("/meetings/"));
        const Icon = item.icon;
        return <Link key={item.path} href={item.path} onClick={() => setMobileOpen(false)} title={collapsed ? item.name : undefined} className={`flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium ${active ? "bg-blue-50 text-blue-800" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}><Icon size={18}/>{!collapsed && <span>{item.name}</span>}</Link>;
      })}</nav>
      <div className="border-t border-gray-200 bg-gray-50 p-3"><div className="flex items-center justify-between gap-2">{!collapsed && <div className="min-w-0"><div className="truncate text-sm font-semibold text-gray-900">{user.full_name}</div><div className="truncate text-xs capitalize text-gray-500">{user.role.replace("_", " ")}</div></div>}<button onClick={() => logout()} title="Log out" className="rounded p-2 text-gray-500 hover:bg-gray-200 hover:text-red-600"><LogOut size={18}/></button></div></div>
    </aside>
    <div className={`hidden shrink-0 transition-all duration-300 lg:block ${spacerWidth}`} />
  </>;
}
