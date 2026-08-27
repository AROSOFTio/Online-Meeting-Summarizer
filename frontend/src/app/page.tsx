"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/convenecore-mark.svg" alt="ConveneCore" className="h-16 w-16 object-contain" />
        <div className="mt-4 h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
        <p className="mt-3 text-sm font-medium text-gray-600">Loading ConveneCore...</p>
      </div>
    </div>
  );
}
