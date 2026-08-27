"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Calendar, CheckCircle2, DoorOpen, UserCheck, UserX } from "lucide-react";

import { apiRequest } from "@/lib/api";

interface Invitation {
  code: string;
  meeting_id: number;
  meeting_title: string;
  meeting_date: string;
  description: string;
  invited_email: string | null;
  invitation_status: string;
  lifecycle: "scheduled" | "live" | "ended";
  requires_name: boolean;
  known_name: string | null;
  known_position: string | null;
  known_group: string | null;
}
interface PublicBranding { product_name:string; organization_name:string; organization_logo_url:string; organization_motto:string; }

export default function PublicJoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = String(params?.code || "").toUpperCase();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [reason, setReason] = useState("");
  const [showApology, setShowApology] = useState(false);
  const [apologySaved, setApologySaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const brandingQuery = useQuery<PublicBranding>({queryKey:["public-branding"],queryFn:()=>apiRequest("/api/settings/branding"),staleTime:5*60*1000});
  const branding = brandingQuery.data || {product_name:"ConveneCore",organization_name:"Organization",organization_logo_url:"/api/settings/logo",organization_motto:""};

  useEffect(() => {
    if (!code) return;
    let active = true;
    apiRequest(`/api/meetings/public/invitations/${code}`)
      .then((data: Invitation) => {
        if (!active) return;
        setInvitation(data);
        if (data.known_name) setFullName(data.known_name);
        else {
          const savedName = localStorage.getItem(`meeting-name:${code}`)?.trim();
          if (savedName) setFullName(savedName);
        }
        if (data.invitation_status === "apology") setApologySaved(true);
      })
      .catch((error) => active && setLoadError(error instanceof Error ? error.message : "Invitation not found"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [code]);

  const validatedName = () => {
    const name = fullName.trim();
    if (invitation?.requires_name && name.length < 2) {
      setSubmitError("Please enter your full name first.");
      return null;
    }
    return name || undefined;
  };

  const enterMeeting = async () => {
    if (!code || !invitation) return;
    const name = validatedName();
    if (invitation.requires_name && !name) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiRequest(`/api/meetings/public/invitations/${code}/join`, {
        method: "POST",
        body: JSON.stringify({ full_name: name || null }),
      });
      if (name) localStorage.setItem(`meeting-name:${code}`, name);
      router.replace(`/join/${code}/room`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not open the meeting.");
      setSubmitting(false);
    }
  };

  const submitApology = async () => {
    if (!code || !invitation) return;
    const name = validatedName();
    if (invitation.requires_name && !name) return;
    if (reason.trim().length < 2) {
      setSubmitError("Please give a short reason for being absent.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiRequest(`/api/meetings/public/invitations/${code}/apology`, {
        method: "POST",
        body: JSON.stringify({ full_name: name || null, reason: reason.trim() }),
      });
      if (name) localStorage.setItem(`meeting-name:${code}`, name);
      setApologySaved(true);
      setShowApology(false);
      setSubmitting(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not record your apology.");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 px-6 py-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.organization_logo_url} alt={branding.organization_name} className="mx-auto h-auto max-h-28 w-auto max-w-[220px] object-contain" />
          <h1 className="mt-3 text-lg font-extrabold text-blue-950">{branding.organization_name}</h1>
          {branding.organization_motto&&<p className="mt-1 text-xs text-slate-500">{branding.organization_motto}</p>}
        </header>

        <div className="p-6 sm:p-8">
          {loading && <div className="py-12 text-center text-sm text-slate-500">Opening meeting invitation...</div>}
          {loadError && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"><b>Meeting link unavailable.</b><br />{loadError}</div>}

          {invitation && <>
            <div className="mb-6 rounded-xl bg-blue-50 p-4">
              <h2 className="text-xl font-extrabold text-slate-950">{invitation.meeting_title}</h2>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Calendar size={16}/>{new Date(invitation.meeting_date).toLocaleString(undefined,{dateStyle:"long",timeStyle:"short"})}</div>
              {invitation.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{invitation.description}</p>}
            </div>

            {invitation.lifecycle === "ended" ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-600"><b>This meeting has ended.</b><div className="mt-1 text-xs">Attendance for this meeting has already been closed.</div></div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <UserCheck className="shrink-0 text-blue-700" size={24}/>
                  <div><div className="font-extrabold text-slate-900">{invitation.known_name ? `Invited: ${invitation.known_name}` : "Meeting invitation"}</div><div className="text-xs text-slate-500">Choose whether you are attending or send an apology if you cannot attend.</div></div>
                </div>

                {invitation.requires_name && <label className="block text-sm font-medium text-slate-700">Full name
                  <input required minLength={2} value={fullName} onChange={(event)=>setFullName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900" placeholder="Your full name" />
                </label>}

                {apologySaved && <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800"><CheckCircle2 className="mt-0.5 shrink-0" size={18}/><div><b>Apology recorded.</b><div className="text-xs">The attendance register and official minutes will show you as absent with apology.</div></div></div>}

                {!showApology ? <div className="grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={()=>void enterMeeting()} disabled={submitting} className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3.5 text-sm font-extrabold text-white hover:bg-blue-800 disabled:opacity-50"><DoorOpen size={18}/>{submitting?"Opening...":"Join Meeting"}</button>
                  <button type="button" onClick={()=>{setShowApology(true);setSubmitError(null);}} disabled={submitting} className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-sm font-extrabold text-amber-800 hover:bg-amber-100 disabled:opacity-50"><UserX size={18}/>I Will Be Absent</button>
                </div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="font-extrabold text-amber-950">Absent — give reason / apology</div>
                  <p className="mt-1 text-xs text-amber-800">This reason will be captured in the meeting attendance register and official minutes.</p>
                  <textarea value={reason} onChange={(event)=>setReason(event.target.value)} rows={3} maxLength={180} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-slate-900" placeholder="Example: I am away on official duty." />
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>void submitApology()} disabled={submitting} className="rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{submitting?"Saving...":"Send Apology"}</button><button type="button" onClick={()=>{setShowApology(false);setSubmitError(null);}} disabled={submitting} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button></div>
                </div>}

                {submitError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>}
              </div>
            )}
          </>}
        </div>
        <div className="border-t border-slate-100 px-6 py-3 text-center text-[11px] text-slate-400">Powered by {branding.product_name}</div>
      </div>
    </main>
  );
}
