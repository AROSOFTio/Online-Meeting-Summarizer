"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { UserCheck, ArrowRight, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

export default function JoinMeetingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [meetingCode, setMeetingCode] = useState("");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name && meetingCode) {
      router.push(`/meeting?code=${encodeURIComponent(meetingCode)}&name=${encodeURIComponent(name)}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-md mx-auto py-10 space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <UserCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Join Meeting Room</h1>
          <p className="text-xs text-slate-400 mt-1">
            Starlight Secondary School • Attendance Registration
          </p>
        </div>

        <form onSubmit={handleJoin} className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
              Meeting Link Code *
            </label>
            <input
              type="text"
              required
              value={meetingCode}
              onChange={(e) => setMeetingCode(e.target.value)}
              placeholder="Enter code (e.g. starlight-101)"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
              Your Full Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dr. Sarah Akello"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase mb-1.5">
              Role / Title (Optional)
            </label>
            <input
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g. Head of Science Department"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2"
          >
            <span>Enter Session</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
