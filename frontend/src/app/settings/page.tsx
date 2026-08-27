"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Save, Upload } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface SettingsData {
  organization_name: string;
  organization_type: string;
  organization_logo_url: string;
  organization_address: string;
  organization_phone: string;
  organization_email: string;
  organization_website: string;
  organization_motto: string;
  organization_registration: string;
  timezone: string;
  retention_period_days: string;
  minutes_document_title: string;
  minutes_style: string;
  minutes_language: string;
  agenda_label: string;
  attendance_label: string;
  proceedings_label: string;
  decisions_label: string;
  action_items_label: string;
  transcript_appendix_label: string;
}

interface Backup { id:number; filename:string; size_bytes:number; status:string; created_at:string; }
interface Audit { id:number; user_email:string|null; action:string; details:string|null; ip_address:string|null; created_at:string; }

const emptySettings: SettingsData = {
  organization_name:"", organization_type:"", organization_logo_url:"", organization_address:"",
  organization_phone:"", organization_email:"", organization_website:"", organization_motto:"",
  organization_registration:"", timezone:"UTC", retention_period_days:"365",
  minutes_document_title:"Official Meeting Minutes", minutes_style:"Standard Professional", minutes_language:"English",
  agenda_label:"Agenda", attendance_label:"Attendance Register", proceedings_label:"Minutes / Proceedings",
  decisions_label:"Resolutions / Key Decisions", action_items_label:"Action Items", transcript_appendix_label:"Appendix: Full Transcript",
};
const formatBytes=(bytes:number)=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
const styles=["Standard Professional","Board / Governance","Corporate / Management","Project / Action-Oriented","School / Academic","NGO / Nonprofit","Government / Public Sector"];

export default function SettingsPage(){
  const {user}=useAuth();
  const queryClient=useQueryClient();
  const [formValues,setFormValues]=useState<SettingsData>(emptySettings);
  const [loaded,setLoaded]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [logoUploading,setLogoUploading]=useState(false);

  const settingsQuery=useQuery<SettingsData>({queryKey:["system-settings"],queryFn:()=>apiRequest("/api/settings/")});
  const backupsQuery=useQuery<Backup[]>({queryKey:["system-backups"],queryFn:()=>apiRequest("/api/system/backups"),enabled:user?.role==="admin"});
  const auditQuery=useQuery<Audit[]>({queryKey:["system-audit"],queryFn:()=>apiRequest("/api/system/audit?limit=20"),enabled:user?.role==="admin"});

  useEffect(()=>{if(settingsQuery.data&&!loaded){setFormValues(settingsQuery.data);setLoaded(true);}},[settingsQuery.data,loaded]);

  const saveMutation=useMutation({mutationFn:(values:SettingsData)=>apiRequest("/api/settings/",{method:"PUT",body:JSON.stringify(values)}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:["system-settings"]});queryClient.invalidateQueries({queryKey:["public-branding"]});setLoaded(false);setMessage("Organization and minutes settings saved.");setError(null);},onError:(mutationError:Error)=>{setError(mutationError.message);setMessage(null);}});
  const backupMutation=useMutation({mutationFn:()=>apiRequest("/api/system/backups",{method:"POST"}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:["system-backups"]});setMessage("Validated database backup created.");setError(null);},onError:(mutationError:Error)=>setError(mutationError.message)});
  const cleanupMutation=useMutation({mutationFn:()=>apiRequest("/api/system/retention/cleanup",{method:"POST"}),onSuccess:(data)=>{setMessage(`Retention cleanup completed. Removed ${data.removed_recordings} archived recording(s).`);setError(null);},onError:(mutationError:Error)=>setError(mutationError.message)});

  const handleLogoUpload=async(file?:File)=>{if(!file)return;setLogoUploading(true);setError(null);try{const body=new FormData();body.append("file",file);const result=await apiRequest("/api/settings/logo",{method:"POST",body});setFormValues((values)=>({...values,organization_logo_url:result.organization_logo_url}));await Promise.all([queryClient.invalidateQueries({queryKey:["system-settings"]}),queryClient.invalidateQueries({queryKey:["public-branding"]})]);setMessage("Organization logo uploaded.");}catch(uploadError){setError(uploadError instanceof Error?uploadError.message:"Logo upload failed");}finally{setLogoUploading(false);}};

  if(!user)return null;
  if(user.role!=="admin")return <DashboardLayout><div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700"><h2 className="font-bold">Access Denied</h2><p className="mt-1 text-sm">Only administrators can manage system settings.</p></div></DashboardLayout>;

  return <DashboardLayout><div className="space-y-6">
    <div className="border-b border-gray-200 pb-5"><h1 className="text-2xl font-bold text-gray-900">Organization Settings & Operations</h1><p className="mt-1 text-sm text-gray-500">ConveneCore stays the product brand; your organization controls its identity, document language and minutes terminology.</p></div>
    {(message||error)&&<div className={`rounded border p-3 text-sm ${error?"border-red-200 bg-red-50 text-red-700":"border-green-200 bg-green-50 text-green-700"}`}>{error||message}</div>}

    {settingsQuery.data&&<form onSubmit={(event)=>{event.preventDefault();saveMutation.mutate(formValues);}} className="max-w-4xl space-y-7 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <section className="space-y-4">
        <div><h2 className="font-bold text-gray-900">Organization identity</h2><p className="mt-1 text-xs text-gray-500">Used in the workspace, invitations and official exports.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization Name" value={formValues.organization_name} onChange={(value)=>setFormValues((settings)=>({...settings,organization_name:value}))}/>
          <Field label="Organization Type" value={formValues.organization_type} onChange={(value)=>setFormValues((settings)=>({...settings,organization_type:value}))}/>
          <Field label="Address" value={formValues.organization_address} onChange={(value)=>setFormValues((settings)=>({...settings,organization_address:value}))}/>
          <Field label="Telephone" value={formValues.organization_phone} onChange={(value)=>setFormValues((settings)=>({...settings,organization_phone:value}))}/>
          <Field label="Official Email" value={formValues.organization_email} type="email" onChange={(value)=>setFormValues((settings)=>({...settings,organization_email:value}))}/>
          <Field label="Website" value={formValues.organization_website} type="url" onChange={(value)=>setFormValues((settings)=>({...settings,organization_website:value}))}/>
          <Field label="Motto / Tagline" value={formValues.organization_motto} onChange={(value)=>setFormValues((settings)=>({...settings,organization_motto:value}))}/>
          <Field label="Registration / Reference Number" value={formValues.organization_registration} onChange={(value)=>setFormValues((settings)=>({...settings,organization_registration:value}))}/>
        </div>
        <div><label className="mb-2 block text-sm font-medium text-gray-700">Organization Logo</label><div className="flex items-center gap-4 rounded border border-gray-200 p-4"><div className="h-20 w-20 overflow-hidden rounded bg-gray-50">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={formValues.organization_logo_url||"/api/settings/logo"} alt="Organization logo" className="h-full w-full object-contain"/></div><label className="inline-flex cursor-pointer items-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white"><Upload size={16}/>{logoUploading?"Uploading...":"Replace Logo"}<input hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={logoUploading} onChange={(event)=>void handleLogoUpload(event.target.files?.[0])}/></label></div></div>
      </section>

      <section className="space-y-4 border-t border-gray-100 pt-6">
        <div><h2 className="font-bold text-gray-900">Minutes profile & terminology</h2><p className="mt-1 text-xs text-gray-500">These names flow into AI instructions and PDF/DOCX/TXT exports, so organizations can follow their own conventions.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minutes Document Title" value={formValues.minutes_document_title} onChange={(value)=>setFormValues((settings)=>({...settings,minutes_document_title:value}))}/>
          <Field label="Minutes Language" value={formValues.minutes_language} onChange={(value)=>setFormValues((settings)=>({...settings,minutes_language:value}))}/>
          <label className="block text-sm font-medium text-gray-700">Default Minutes Style<select value={formValues.minutes_style} onChange={(event)=>setFormValues((settings)=>({...settings,minutes_style:event.target.value}))} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900">{styles.map((style)=><option key={style} value={style}>{style}</option>)}</select></label>
          <Field label="Agenda Label" value={formValues.agenda_label} onChange={(value)=>setFormValues((settings)=>({...settings,agenda_label:value}))}/>
          <Field label="Attendance Label" value={formValues.attendance_label} onChange={(value)=>setFormValues((settings)=>({...settings,attendance_label:value}))}/>
          <Field label="Proceedings / Minutes Label" value={formValues.proceedings_label} onChange={(value)=>setFormValues((settings)=>({...settings,proceedings_label:value}))}/>
          <Field label="Decisions / Resolutions Label" value={formValues.decisions_label} onChange={(value)=>setFormValues((settings)=>({...settings,decisions_label:value}))}/>
          <Field label="Action Items Label" value={formValues.action_items_label} onChange={(value)=>setFormValues((settings)=>({...settings,action_items_label:value}))}/>
          <Field label="Transcript Appendix Label" value={formValues.transcript_appendix_label} onChange={(value)=>setFormValues((settings)=>({...settings,transcript_appendix_label:value}))}/>
        </div>
      </section>

      <section className="space-y-4 border-t border-gray-100 pt-6">
        <h2 className="font-bold text-gray-900">Regional & retention settings</h2>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Timezone (IANA, e.g. Europe/London)" value={formValues.timezone} onChange={(value)=>setFormValues((settings)=>({...settings,timezone:value}))}/><label className="text-sm font-medium text-gray-700">Recording retention (days)<input type="number" min={30} max={3650} value={formValues.retention_period_days} onChange={(event)=>setFormValues((settings)=>({...settings,retention_period_days:event.target.value}))} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900"/><span className="mt-1 block text-xs font-normal text-gray-500">Only archived recordings are removed; transcripts and minutes remain.</span></label></div>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-5"><button disabled={saveMutation.isPending} className="inline-flex items-center gap-2 rounded bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={16}/>{saveMutation.isPending?"Saving...":"Save Settings"}</button><button type="button" onClick={()=>cleanupMutation.mutate()} disabled={cleanupMutation.isPending} className="rounded border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50">Run Retention Cleanup</button></div>
    </form>}

    <section className="max-w-4xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-gray-900">Database Backups</h2><p className="text-xs text-gray-500">Backups are validated before listing. Restore is offline for safety.</p></div><button type="button" onClick={()=>backupMutation.mutate()} disabled={backupMutation.isPending} className="rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{backupMutation.isPending?"Creating...":"Create Backup"}</button></div><div className="space-y-2">{(backupsQuery.data||[]).map((item)=><div key={item.id} className="flex items-center justify-between gap-3 rounded border border-gray-200 p-3"><div><div className="text-sm font-medium text-gray-900">{item.filename}</div><div className="text-xs text-gray-500">{formatBytes(item.size_bytes)} · {new Date(item.created_at).toLocaleString()} · {item.status}</div></div><a href={`/api/system/backups/${item.id}/download`} className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"><Download size={13}/>Download</a></div>)}{backupsQuery.data?.length===0&&<p className="text-sm text-gray-500">No backups created yet.</p>}</div></section>

    <section className="max-w-4xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><h2 className="font-bold text-gray-900">Recent Audit Activity</h2><div className="mt-3 divide-y divide-gray-100">{(auditQuery.data||[]).map((row)=><div key={row.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-gray-900">{row.action.replaceAll("_"," ")}</span><span className="text-xs text-gray-400">{new Date(row.created_at).toLocaleString()}</span></div><p className="mt-1 text-xs text-gray-600">{row.details||"No details"}</p><p className="mt-1 text-[11px] text-gray-400">{row.user_email||"System"}{row.ip_address?` · ${row.ip_address}`:""}</p></div>)}{auditQuery.data?.length===0&&<p className="mt-3 text-sm text-gray-500">No audit entries yet.</p>}</div></section>
  </div></DashboardLayout>;
}

function Field({label,value,onChange,type="text"}:{label:string;value:string;onChange:(value:string)=>void;type?:string}){return <label className="block text-sm font-medium text-gray-700">{label}<input type={type} value={value} onChange={(event)=>onChange(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900"/></label>}
