"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Link as LinkIcon, Plus, Users, Calendar, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function CreateMeetingPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [participantInput, setParticipantInput] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [generatedLink, setGeneratedLink] = useState("");

  const handleAddParticipant = () => {
    if (participantInput.trim()) {
      setParticipants([...participants, participantInput.trim()]);
      setParticipantInput("");
    }
  };

  const handleCreateMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://oms.arosoftlabs.com";
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const link = `${origin}/join/${code}`;
    setGeneratedLink(link);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h1 className="text-2xl font-bold text-slate-100">Create New Meeting</h1>
          <p className="text-sm text-slate-400">
            Generate an official meeting link, specify the attendance roster, and start Gemini AI audio recording.
          </p>
        </div>

        {!generatedLink ? (
          <form onSubmit={handleCreateMeeting} className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                Meeting Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Board of Governors Quarterly Review"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                Agenda / Description
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Outline main discussion points, resolutions to consider, and target objectives..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                Expected Attendance Roster
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={participantInput}
                  onChange={(e) => setParticipantInput(e.target.value)}
                  placeholder="Enter participant full name (e.g. Dr. Sarah Akello)"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddParticipant}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-semibold border border-slate-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>

              {participants.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-slate-950 rounded-lg border border-slate-800">
                  {participants.map((p, idx) => (
                    <span key={idx} className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Users className="w-3 h-3" /> {p}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <LinkIcon className="w-4 h-4" /> Create Meeting Link & Session
            </button>
          </form>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-xl text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
              <LinkIcon className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-100">Meeting Link Created Successfully</h2>
              <p className="text-xs text-slate-400 mt-1">
                Share this official link with participants so they can join the session and record attendance.
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 font-mono text-indigo-400 text-sm break-all">
              {generatedLink}
            </div>

            <button
              onClick={() => router.push("/meeting")}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm inline-flex items-center gap-2 shadow-lg"
            >
              Enter Local Meeting Room <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

