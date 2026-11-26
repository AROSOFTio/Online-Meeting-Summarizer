"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import PageHero from "./PageHero";
import { useAuth } from "@/context/AuthContext";
import NotificationCenter from "./NotificationCenter";
import Sidebar from "./Sidebar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const section = pathname === "/dashboard" ? "Your meeting workspace" : pathname === "/create-meeting" ? "Plan your next meeting" : pathname === "/meetings" ? "Meeting records" : pathname.endsWith("/live") ? "Live meeting workspace" : pathname.endsWith("/invite") ? "Meeting invitations" : pathname.startsWith("/meetings/") ? "Meeting documentation" : pathname === "/staff" ? "People and access" : pathname === "/action-items" ? "Decisions into action" : pathname === "/settings" ? "Organization administration" : pathname === "/subscription" ? "Workspace management" : "MinuteSeal workspace";
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
    else if (!isLoading && user?.must_change_password) router.replace("/change-password");
  }, [user, isLoading, router]);

  useEffect(() => {
    const originalAlert = window.alert;
    window.alert = (message?: unknown) => {
      setToast(String(message ?? "Done"));
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 4500);
    };
    return () => {
      window.alert = originalAlert;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6]"><div className="flex flex-col items-center"><div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-700 border-t-transparent"/><p className="mt-4 text-sm font-medium text-gray-600">Loading MinuteSeal...</p></div></div>;
  }
  if (!user || user.must_change_password) return null;

  return <div className="flex min-h-screen bg-[#f3f4f6]">
    <Sidebar />
    <main className="flex min-w-0 flex-1 flex-col pt-16 lg:pt-0">
      <div className="mx-auto w-full max-w-7xl p-3 sm:p-5 lg:p-8">
        <div className="mb-3 flex justify-end"><NotificationCenter /></div>
        {toast && <div className="fixed right-4 top-4 z-[100] max-w-sm rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-semibold text-green-800 shadow-lg">{toast}</div>}
        <div className="mb-5 overflow-hidden rounded-md"><PageHero title={section} eyebrow="MinuteSeal" compact heading="p"/></div>
        {children}
      </div>
    </main>
  </div>;
}

export default DashboardLayout;
