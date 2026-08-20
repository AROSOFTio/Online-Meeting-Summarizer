"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CheckCircle, Edit2, RefreshCw, XCircle } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/lib/api";

interface StaffUser {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "minute_secretary" | "staff";
  is_active: boolean;
  directory_group: string;
  position_title: string | null;
  created_at: string;
}

const staffSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  role: z.enum(["admin", "minute_secretary", "staff"]),
  directory_group: z.string().min(2, "Directory group is required"),
  position_title: z.string().optional(),
  is_active: z.boolean(),
  password: z.string().optional(),
});

type StaffFormValues = z.infer<typeof staffSchema>;
const suggestedGroups = ["Staff", "Members", "Directors", "Management", "Support Staff", "Secretaries"];

export default function StaffPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: staffList, isLoading, isError } = useQuery<StaffUser[]>({
    queryKey: ["staff-list"],
    queryFn: () => apiRequest("/api/staff/"),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: { role: "staff", directory_group: "Staff", position_title: "", is_active: true, password: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: StaffFormValues) => apiRequest("/api/staff/", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-list"] }); reset(); setFormError(null); },
    onError: (err: Error) => setFormError(err.message || "Failed to create user"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; values: Partial<StaffFormValues> }) => apiRequest(`/api/staff/${data.id}`, { method: "PUT", body: JSON.stringify(data.values) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["staff-list"] }); setEditingUser(null); reset(); setFormError(null); },
    onError: (err: Error) => setFormError(err.message || "Failed to update user"),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (staff: StaffUser) => apiRequest(`/api/staff/${staff.id}`, { method: "PUT", body: JSON.stringify({ is_active: !staff.is_active }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff-list"] }),
  });

  const onSubmit = (data: StaffFormValues) => {
    setFormError(null);
    if (editingUser) {
      const payload: Partial<StaffFormValues> = { ...data };
      delete payload.is_active;
      if (!payload.password) delete payload.password;
      updateMutation.mutate({ id: editingUser.id, values: payload });
    } else {
      if (!data.password) { setFormError("Password is required for new accounts"); return; }
      createMutation.mutate(data);
    }
  };

  const handleEdit = (staff: StaffUser) => {
    setEditingUser(staff);
    setValue("email", staff.email);
    setValue("full_name", staff.full_name);
    setValue("role", staff.role);
    setValue("directory_group", staff.directory_group || "Staff");
    setValue("position_title", staff.position_title || "");
    setValue("is_active", staff.is_active);
    setValue("password", "");
    setFormError(null);
  };

  const cancelEdit = () => { setEditingUser(null); reset(); setFormError(null); };

  if (!currentUser) return null;
  if (currentUser.role !== "admin") return <DashboardLayout><div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700"><h2 className="text-lg font-bold">Access Denied</h2><p className="mt-1 text-sm">You must have administrator privileges to view this page.</p></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        <div className="border-b border-slate-200 pb-5"><h1 className="text-2xl font-bold text-slate-900">Staff & Member Directory</h1><p className="mt-1 text-sm text-slate-500">Manage login access separately from organisational groups used for meeting invitations.</p></div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-200 p-4"><h3 className="font-bold text-slate-900">Directory</h3>{isLoading && <RefreshCw className="animate-spin text-slate-500" size={16}/>}</div>
            {isError && <div className="border-b border-red-100 bg-red-50 p-4 text-sm text-red-700">Failed to retrieve the directory.</div>}
            {staffList && staffList.length === 0 ? <div className="py-10 text-center text-sm text-slate-500">No directory people found.</div> : <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left"><thead><tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500"><th className="p-4">Name</th><th className="p-4">Group</th><th className="p-4">Position</th><th className="p-4">Email</th><th className="p-4">System access</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-200 text-sm">{staffList?.map((staff) => <tr key={staff.id} className="hover:bg-slate-50"><td className="p-4 font-medium text-slate-900">{staff.full_name}</td><td className="p-4"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{staff.directory_group || "Staff"}</span></td><td className="p-4 text-slate-600">{staff.position_title || "—"}</td><td className="p-4 text-slate-600">{staff.email}</td><td className="p-4 text-xs text-slate-600">{staff.role === "minute_secretary" ? "Minute Secretary" : staff.role === "staff" ? "Staff Reader" : "Administrator"}</td><td className="p-4"><button onClick={() => { if (staff.id !== currentUser.id) { if (staff.is_active && !window.confirm(`Deactivate ${staff.full_name}? They will no longer be able to sign in.`)) return; toggleStatusMutation.mutate(staff); } }} disabled={staff.id === currentUser.id} className={`inline-flex items-center gap-1 text-xs font-medium ${staff.is_active ? "text-green-700" : "text-red-700"} disabled:opacity-50`}>{staff.is_active ? <CheckCircle size={16}/> : <XCircle size={16}/>} {staff.is_active ? "Active" : "Inactive"}</button></td><td className="p-4 text-right"><button onClick={() => handleEdit(staff)} className="rounded p-1 text-slate-500 hover:text-blue-700" title="Edit details"><Edit2 size={16}/></button></td></tr>)}</tbody></table></div>}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 border-b border-slate-200 pb-3 font-bold text-slate-900">{editingUser ? `Edit ${editingUser.full_name}` : "Create Directory Account"}</h3>
            {formError && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{formError}</div>}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label><input {...register("full_name")} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="e.g. John Okello"/>{errors.full_name && <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>}</div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Email Address</label><input type="email" {...register("email")} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="name@school.org"/>{errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}</div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Organisational Group</label><input list="directory-groups" {...register("directory_group")} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="Staff, Members, Directors..."/><datalist id="directory-groups">{suggestedGroups.map((group) => <option key={group} value={group}/>)}</datalist>{errors.directory_group && <p className="mt-1 text-xs text-red-600">{errors.directory_group.message}</p>}<p className="mt-1 text-xs text-slate-500">This controls meeting-group selection only; it does not grant system permissions.</p></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Title / Position</label><input {...register("position_title")} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="e.g. Chairperson, Secretary, Teacher"/></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">System Access Role</label><select {...register("role")} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900"><option value="staff">Staff Reader (view only)</option><option value="minute_secretary">Minute Secretary</option><option value="admin">System Administrator</option></select></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Password {editingUser && "(leave blank to keep current)"}</label><input type="password" {...register("password")} className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="••••••••"/></div>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row"><button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{editingUser ? "Save Changes" : "Create Account"}</button>{editingUser && <button type="button" onClick={cancelEdit} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700">Cancel</button>}</div>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
