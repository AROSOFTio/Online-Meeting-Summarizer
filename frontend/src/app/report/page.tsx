"use client";

import React from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { MeetingReport } from "@/components/MeetingReport";

export default function ReportPage() {
  const summaryText = `MINUTES OF THE STARLIGHT SECONDARY SCHOOL BOARD MEETING HELD IN AMURIA DISTRICT

1. OPENING AND CONVENING
The Board Meeting was officially called to order at 10:00 AM by the Board Chair. Roll call was taken and full attendance verified.

2. ACADEMIC PERFORMANCE & DISCUSSIONS
The Board evaluated student test results across all departments. Special commendation was awarded to the Science & Mathematics faculty for leading regional performance.

3. RESOLUTIONS & ACTION ITEMS
The Board resolved to construct a new modern computer laboratory and acquire 50 digital tablets for student research.`;

  const decisions = [
    { text: "Construct modern computer laboratory by Q3 2026." },
    { text: "Procure 50 tablets for student research." },
  ];

  const actionItems = [
    { description: "Submit laboratory contractor quotes", assignee_name: "Mr. Okello David", status: "pending" as const, priority: "high" as const },
    { description: "Finalize tablet vendor contract", assignee_name: "Dr. Sarah Akello", status: "pending" as const, priority: "medium" as const },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-4 space-y-6">
        <MeetingReport
          meetingTitle="Board of Governors Annual General Minutes"
          summaryText={summaryText}
          keyPoints={[
            "Science & Mathematics faculty achieved 94% distinction rate.",
            "Computer lab budget approved by board vote.",
            "District academic inspection scheduled for next month."
          ]}
          decisions={decisions}
          actionItems={actionItems}
          participants={["Dr. Sarah Akello", "Mr. Okello David", "Eng. John Baptist"]}
        />
      </div>
    </DashboardLayout>
  );
}
