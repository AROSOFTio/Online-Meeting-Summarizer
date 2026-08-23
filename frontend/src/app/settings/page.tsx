"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Save, Upload } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface SettingsData {
  school_name: string;
  school_logo_url: string;
  organization_address: string;
  organization_phone: string;
  organization_email: string;
  organization_website: string;
  organization_motto: string;
  organization_registration: string;
  timezone: string;
  retention_period_days: string;
}

interface Backup { id:number; filename:string; size_bytes:number; status:string; created_at:string; }
interface Audit { id:number; user_email:string|null; action:string; details:string|null; ip_address:string|null; created_at:string; }

const emptySettings: SettingsData = {
  school_name:"", school_logo_url:"", organization_address:"", organization_phone:"",
  organization_email:"", organization_website:"", organization_motto:"",
  organization_registration:"", timezone:"Africa/Kampala", retention_period_days:"365",
};
const formatBytes=(bytes:number)=>bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;

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

  const saveMutation=useMutation({mutationFn:(values:SettingsData)=>apiRequest("/api/settings/",{method:"PUT",body:JSON.stringify(values)}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:["system-settings"]});setLoaded(false);setMessage("Settings saved successfully.");setError(null);},onError:(mutationError:Error)=>{setError(mutationError.message);setMessage(null);}});
  const backupMutation=useMutation({mutationFn:()=>apiRequest("/api/system/backups",{method:"POST"}),onSuccess:()=>{queryClient.invalidateQueries({queryKey:["system-backups"]});setMessage("Validated database backup created.");setError(null);},onError:(mutationError:Error)=>setError(mutationError.message)});
  const cleanupMutation=useMutation({mutationFn:()=>apiRequest("/api/system/retention/cleanup",{method:"POST"}),onSuccess:(data)=>{setMessage(`Retention cleanup completed. Removed ${data.removed_recordings} archived recording(s).`);setError(null);},onError:(mutationError:Error)=>setError(mutationError.message)});

  const handleLogoUpload=async(file?:File)=>{if(!file)return;setLogoUploading(true);setError(null);try{const body=new FormData();body.append("file",file);const result=await apiRequest("/api/settings/logo",{method:"POST",body});setFormValues((values)=>({...values,school_logo_url:result.school_logo_url}));await queryClient.invalidateQueries({queryKey:["system-settings"]});setMessage("School logo uploaded.");}catch(uploadError){setError(uploadError instanceof Error?uploadError.message:"Logo upload failed");}finally{setLogoUploading(false);}};

  if(!user)return null;
  if(user.role!=="admin")return <DashboardLayout><div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700"><h2 className="font-bold">Access Denied</h2><p className="mt-1 text-sm">Only administrators can manage system settings.</p></div></DashboardLayout>;

  return <DashboardLayout><div className="space-y-6">
    <div className="border-b border-gray-200 pb-5"><h1 className="text-2xl font-bold text-gray-900">System Settings & Operations</h1><p className="mt-1 text-sm text-gray-500">School identity, retention, backups and recent audit activity.</p></div>
    {(message||error)&&<div className={`rounded border p-3 text-sm ${error?"border-red-200 bg-red-50 text-red-700":"border-green-200 bg-green-50 text-green-700"}`}>{error||message}</div>}

    {settingsQuery.data&&<div className="max-w-xs rounded-lg border border-gray-200 bg-white p-4 shadow-sm"><div className="text-xs font-semibold uppercase text-gray-500">Recording retention</div><div className="mt-2 text-sm font-bold text-gray-900">{formValues.retention_period_days} days</div><div className="mt-1 text-xs text-green-600">Archived recordings only</div></div>}

    {settingsQuery.data&&<form onSubmit={(event)=>{event.preventDefault();saveMutation.mutate(formValues);}} className="max-w-3xl space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="font-bold text-gray-900">School identity & document details</h2>
      <Field label="School Name" value={formValues.school_name} onChange={(value)=>setFormValues((settings)=>({...settings,school_name:value}))}/>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address" value={formValues.organization_address} onChange={(value)=>setFormValues((settings)=>({...settings,organization_address:value}))}/>
        <Field label="Telephone" value={formValues.organization_phone} onChange={(value)=>setFormValues((settings)=>({...settings,organization_phone:value}))}/>
        <Field label="Official Email" value={formValues.organization_email} type="email" onChange={(value)=>setFormValues((settings)=>({...settings,organization_email:value}))}/>
        <Field label="Website" value={formValues.organization_website} type="url" onChange={(value)=>setFormValues((settings)=>({...settings,organization_website:value}))}/>
        <Field label="Motto" value={formValues.organization_motto} onChange={(value)=>setFormValues((settings)=>({...settings,organization_motto:value}))}/>
        <Field label="Registration / Centre Number" value={formValues.organization_registration} onChange={(value)=>setFormValues((settings)=>({...settings,organization_registration:value}))}/>
      </div>
      <div><label className="mb-2 block text-sm font-medium text-gray-700">School Logo</label><div className="flex items-center gap-4 rounded border border-gray-200 p-4"><div className="h-20 w-20 overflow-hidden rounded bg-gray-50">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={formValues.school_logo_url||"/starlight-logo.jpg"} alt="School logo" className="h-full w-full object-contain"/></div><label className="inline-flex cursor-pointer items-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white"><Upload size={16}/>{logoUploading?"Uploading...":"Replace Logo"}<input hidden type="file" accept="image/png,image/jpeg,image/webp" disabled={logoUploading} onChange={(event)=>void handleLogoUpload(event.target.files?.[0])}/></label></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Timezone<select value={formValues.timezone} onChange={(event)=>setFormValues((settings)=>({...settings,timezone:event.target.value}))} className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900"><option value="Africa/Kampala">Africa/Kampala (EAT, UTC+3)</option><option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option><option value="UTC">UTC</option></select></label><label className="text-sm font-medium text-gray-700">Recording retention (days)<input type="number" min={30} max={3650} value={formValues.retention_period_days} onChange={(event)=>setFormValues((settings)=>({...settings,retention_period_days:event.target.value}))} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900"/><span className="mt-1 block text-xs font-normal text-gray-500">Only archived recordings are removed; transcripts and minutes remain.</span></label></div>
      <div className="flex flex-wrap gap-2"><button disabled={saveMutation.isPending} className="inline-flex items-center gap-2 rounded bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={16}/>{saveMutation.isPending?"Saving...":"Save Settings"}</button><button type="button" onClick={()=>cleanupMutation.mutate()} disabled={cleanupMutation.isPending} className="rounded border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-50">Run Retention Cleanup</button></div>
    </form>}

    <section className="max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-gray-900">Database Backups</h2><p className="text-xs text-gray-500">Backups are validated before listing. Restore is offline for safety.</p></div><button type="button" onClick={()=>backupMutation.mutate()} disabled={backupMutation.isPending} className="rounded bg-blue-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{backupMutation.isPending?"Creating...":"Create Backup"}</button></div><div className="space-y-2">{(backupsQuery.data||[]).map((item)=><div key={item.id} className="flex items-center justify-between gap-3 rounded border border-gray-200 p-3"><div><div className="text-sm font-medium text-gray-900">{item.filename}</div><div className="text-xs text-gray-500">{formatBytes(item.size_bytes)} · {new Date(item.created_at).toLocaleString()} · {item.status}</div></div><a href={`/api/system/backups/${item.id}/download`} className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"><Download size={13}/>Download</a></div>)}{backupsQuery.data?.length===0&&<p className="text-sm text-gray-500">No backups created yet.</p>}</div></section>

    <section className="max-w-3xl rounded-lg border border-gray-200 bg-white p-6 shadow-sm"><h2 className="font-bold text-gray-900">Recent Audit Activity</h2><div className="mt-3 divide-y divide-gray-100">{(auditQuery.data||[]).map((row)=><div key={row.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-gray-900">{row.action.replaceAll("_"," ")}</span><span className="text-xs text-gray-400">{new Date(row.created_at).toLocaleString()}</span></div><p className="mt-1 text-xs text-gray-600">{row.details||"No details"}</p><p className="mt-1 text-[11px] text-gray-400">{row.user_email||"System"}{row.ip_address?` · ${row.ip_address}`:""}</p></div>)}{auditQuery.data?.length===0&&<p className="mt-3 text-sm text-gray-500">No audit entries yet.</p>}</div></section>
  </div></DashboardLayout>;
}

function Field({label,value,onChange,type="text"}:{label:string;value:string;onChange:(value:string)=>void;type?:string}){return <label className="block text-sm font-medium text-gray-700">{label}<input type={type} value={value} onChange={(event)=>onChange(event.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900"/></label>}
