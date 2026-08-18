"use client";

import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MeetingRoom } from "@/components/MeetingRoom";
import { useSearchParams } from "next/navigation";

export default function MeetingPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "starlight-main";
  const name = searchParams.get("name") || "Session Organizer";

  const participants = [
    { id: 1, name: name, role_title: "Attendee / Presenter", isOrganizer: true, isSpeaking: false },
    { id: 2, name: "Dr. Sarah Akello", role_title: "Board Chair", isOrganizer: false, isSpeaking: false },
    { id: 3, name: "Mr. Okello David", role_title: "Headteacher", isOrganizer: false, isSpeaking: false },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <MeetingRoom
          meetingId={1}
          meetingTitle="Starlight Secondary School Board Meeting"
          joinCode={code}
          initialParticipants={participants}
        />
      </div>
    </DashboardLayout>
  );
}
