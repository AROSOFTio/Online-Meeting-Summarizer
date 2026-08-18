"use client";

import React, { Suspense } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MeetingRoom } from "@/components/MeetingRoom";
import { useSearchParams } from "next/navigation";

function MeetingContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "starlight-main";
  const name = searchParams.get("name") || "Session Organizer";

  const participants = [
    { id: 1, name: name, role_title: "Attendee / Presenter", isOrganizer: true, isSpeaking: false },
    { id: 2, name: "Dr. Sarah Akello", role_title: "Board Chair", isOrganizer: false, isSpeaking: false },
    { id: 3, name: "Mr. Okello David", role_title: "Headteacher", isOrganizer: false, isSpeaking: false },
  ];

  return (
    <MeetingRoom
      meetingId={1}
      meetingTitle="Starlight Secondary School Board Meeting"
      joinCode={code}
      initialParticipants={participants}
    />
  );
}

export default function MeetingPage() {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <Suspense fallback={<div className="text-slate-400 text-sm">Loading meeting room...</div>}>
          <MeetingContent />
        </Suspense>
      </div>
    </DashboardLayout>
  );
}
