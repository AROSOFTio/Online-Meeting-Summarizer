"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import NotificationCenter from "./NotificationCenter";
import Sidebar from "./Sidebar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
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
    return <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6]"><div className="flex flex-col items-center"><div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-700 border-t-transparent"/><p className="mt-4 text-sm font-medium text-gray-600">Loading Starlight Summarizer...</p></div></div>;
  }
  if (!user || user.must_change_password) return null;

  return <div className="flex min-h-screen bg-[#f3f4f6]">
    <Sidebar />
    <main className="flex min-w-0 flex-1 flex-col pt-16 lg:pt-0">
      <div className="mx-auto w-full max-w-7xl p-3 sm:p-5 lg:p-8">
        <div className="mb-3 flex justify-end"><NotificationCenter /></div>
        {toast && <div className="fixed right-4 top-4 z-[100] max-w-sm rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-semibold text-green-800 shadow-lg">{toast}</div>}
        {children}
      </div>
    </main>
  </div>;
}

export default DashboardLayout;
