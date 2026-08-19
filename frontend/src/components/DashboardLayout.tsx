"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import NotificationCenter from "./NotificationCenter";
import Sidebar from "./Sidebar";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [user, isLoading, router]);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f3f4f6]"><div className="flex flex-col items-center"><div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-700 border-t-transparent"/><p className="mt-4 text-sm font-medium text-gray-600">Loading Starlight Summarizer...</p></div></div>;
  }
  if (!user) return null;

  return <div className="flex min-h-screen bg-[#f3f4f6]">
    <Sidebar />
    <main className="flex min-w-0 flex-1 flex-col pt-16 lg:pt-0">
      <div className="mx-auto w-full max-w-7xl p-3 sm:p-5 lg:p-8">
        <div className="mb-3 flex justify-end"><NotificationCenter /></div>
        {children}
      </div>
    </main>
  </div>;
}

export default DashboardLayout;
