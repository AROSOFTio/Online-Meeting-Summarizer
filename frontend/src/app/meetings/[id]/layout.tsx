"use client";

import React from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface MeetingState { id:number; status:"draft"|"processing"|"completed"|"failed"; }

export default function MeetingSectionLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const meetingId = Number(params.id);
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "minute_secretary";
  const { data } = useQuery<MeetingState>({
    queryKey:["meeting-start-state",meetingId],
    queryFn:()=>apiRequest(`/api/meetings/${meetingId}`),
    enabled:Boolean(canEdit && Number.isInteger(meetingId) && meetingId > 0),
  });
  const showStart = canEdit && data?.status === "draft" && !pathname.endsWith("/live");

  return <>{children}{showStart && <Link href={`/meetings/${meetingId}/live`} className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-extrabold text-white shadow-xl hover:bg-blue-800"><Play size={17} fill="currentColor"/>Start Meeting</Link>}</>;
}
