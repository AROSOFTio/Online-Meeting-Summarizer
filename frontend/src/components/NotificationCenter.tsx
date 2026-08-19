"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCircle, CheckSquare, X } from "lucide-react";

import { apiRequest } from "@/lib/api";

interface Notice {
  type: "error" | "success" | "task";
  title: string;
  message: string;
  href: string;
  created_at: string;
  deadline?: string | null;
}
interface NoticeResponse { count:number; items:Notice[]; }

export default function NotificationCenter(){
  const [open,setOpen]=useState(false);
  const {data}=useQuery<NoticeResponse>({
    queryKey:["notifications"],
    queryFn:()=>apiRequest("/api/system/notifications"),
    refetchInterval:30000,
  });
  const items=data?.items||[];
  return <div className="relative">
    <button onClick={()=>setOpen(v=>!v)} className="relative rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:text-blue-700" aria-label="Notifications">
      <Bell size={18}/>{(data?.count||0)>0&&<span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{Math.min(data?.count||0,99)}</span>}
    </button>
    {open&&<div className="absolute right-0 z-50 mt-2 w-[min(92vw,24rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><div><div className="text-sm font-bold text-gray-900">Notifications</div><div className="text-xs text-gray-500">Processing results and action items</div></div><button onClick={()=>setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100"><X size={16}/></button></div>
      <div className="max-h-96 overflow-y-auto">{items.length===0?<div className="p-6 text-center text-sm text-gray-500">Nothing needs your attention.</div>:items.map((item,index)=><Link key={`${item.type}-${item.created_at}-${index}`} href={item.href} onClick={()=>setOpen(false)} className="flex gap-3 border-b border-gray-50 p-4 hover:bg-gray-50">
        <div className={`mt-0.5 ${item.type==="error"?"text-red-600":item.type==="success"?"text-green-600":"text-blue-700"}`}>{item.type==="error"?<AlertTriangle size={18}/>:item.type==="success"?<CheckCircle size={18}/>:<CheckSquare size={18}/>}</div>
        <div className="min-w-0"><div className="text-sm font-semibold text-gray-900">{item.title}</div><div className="mt-0.5 line-clamp-2 text-xs text-gray-600">{item.message}</div><div className="mt-1 text-[11px] text-gray-400">{item.deadline?`Due ${item.deadline} · `:""}{new Date(item.created_at).toLocaleString()}</div></div>
      </Link>)}</div>
    </div>}
  </div>;
}
