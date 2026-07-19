"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  PlusCircle,
  Mic,
  Calendar,
  FileText,
  BookOpen,
  CheckSquare,
  BarChart2,
  Users,
  ShieldAlert,
  Settings,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X
} from "lucide-react";

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === "admin";

  const navigationItems = [
    { name: "Overview", path: "/dashboard", icon: LayoutDashboard, adminOnly: false },
    { name: "New Meeting", path: "/meetings/new", icon: PlusCircle, adminOnly: false },
    { name: "Live Recorder", path: "/meetings/record", icon: Mic, adminOnly: false },
    { name: "Meetings", path: "/meetings", icon: Calendar, adminOnly: false },
    { name: "Transcripts", path: "/transcripts", icon: FileText, adminOnly: false },
    { name: "Summaries", path: "/summaries", icon: BookOpen, adminOnly: false },
    { name: "Action Items", path: "/action-items", icon: CheckSquare, adminOnly: false },
    { name: "Reports", path: "/reports", icon: BarChart2, adminOnly: false },
    { name: "Staff", path: "/staff", icon: Users, adminOnly: true },
    { name: "Audit Logs", path: "/audit-logs", icon: ShieldAlert, adminOnly: true },
    { name: "System Settings", path: "/settings", icon: Settings, adminOnly: true },
    { name: "Help", path: "/help", icon: HelpCircle, adminOnly: false },
  ];

  const visibleItems = navigationItems.filter(item => !item.adminOnly || isAdmin);

  const sidebarWidth = isCollapsed ? "w-20" : "w-64";

  return (
    <>
      {/* Mobile Top Header */}
      <header className="lg:hidden h-16 bg-[#1e40af] text-white flex items-center justify-between px-4 z-40 fixed top-0 left-0 right-0">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-white text-blue-700 flex items-center justify-center rounded font-bold">
            S
          </div>
          <span className="font-semibold text-sm tracking-wide">STARLIGHT SUMMARIZER</span>
        </div>
        <button
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="text-white hover:text-gray-200 focus:outline-none"
        >
          {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 bg-white border-r border-[#e5e7eb] flex flex-col z-50 transition-all duration-300 lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:block"
        } ${sidebarWidth}`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#e5e7eb] bg-white">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-9 h-9 bg-blue-700 text-white flex items-center justify-center rounded font-bold shrink-0">
              S
            </div>
            {!isCollapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-xs text-gray-900 leading-none">STARLIGHT SEC</span>
                <span className="text-[10px] text-gray-500 font-medium">SUMMARIZER</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 focus:outline-none"
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleItems.map(item => {
            const isActive = pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={() => setIsMobileOpen(false)}
                className={`group flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-medium transition-colors relative ${
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
                title={isCollapsed ? item.name : undefined}
              >
                <Icon size={18} className={isActive ? "text-blue-700" : "text-gray-400 group-hover:text-gray-600"} />
                {!isCollapsed && <span>{item.name}</span>}

                {/* Collapsed Tooltip */}
                {isCollapsed && (
                  <div className="absolute left-16 scale-0 rounded bg-gray-900 p-2 text-xs font-semibold text-white shadow-md transition-all duration-100 group-hover:scale-100 z-50 whitespace-nowrap">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info & Logout */}
        <div className="p-3 border-t border-[#e5e7eb] bg-gray-50 shrink-0">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {user.full_name}
                </span>
                <span className="text-xs text-gray-500 capitalize truncate">
                  {user.role}
                </span>
              </div>
            )}
            <button
              onClick={() => logout()}
              className="p-2 rounded hover:bg-gray-200 text-gray-500 hover:text-red-600 transition-colors focus:outline-none"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      
      {/* Spacer to push content right on desktop */}
      <div className={`hidden lg:block shrink-0 transition-all duration-300 ${sidebarWidth}`} />
    </>
  );
}
