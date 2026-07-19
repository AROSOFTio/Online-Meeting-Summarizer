"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Edit2, RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface StaffUser {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "minute_secretary" | "staff";
  is_active: boolean;
  created_at: string;
}

const staffSchema = z.object({
  email: z.string().email("Please enter a valid school email"),
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  role: z.enum(["admin", "minute_secretary", "staff"]),
  is_active: z.boolean(),
  password: z.string().optional(),
});

type StaffFormValues = z.infer<typeof staffSchema>;

export default function StaffPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [formError, setFormError] = useState<string | null>(null);


  const { data: staffList, isLoading, isError } = useQuery<StaffUser[]>({
    queryKey: ["staff-list"],
    queryFn: () => apiRequest("/api/staff/")
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      role: "staff",
      is_active: true,
      password: ""
    }
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: StaffFormValues) =>
      apiRequest("/api/staff/", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      reset();
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message || "Failed to create user");
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; values: Partial<StaffFormValues> }) =>
      apiRequest(`/api/staff/${data.id}`, {
        method: "PUT",
        body: JSON.stringify(data.values)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
      setEditingUser(null);
      reset();
      setFormError(null);
    },
    onError: (err: Error) => {
      setFormError(err.message || "Failed to update user");
    }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (staff: StaffUser) =>
      apiRequest(`/api/staff/${staff.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !staff.is_active })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-list"] });
    }
  });

  const onSubmit = (data: StaffFormValues) => {
    setFormError(null);
    if (editingUser) {
      // Account status is managed only by the explicit Active/Inactive control.
      // Editing a name, role, email, or password must never change activation.
      const { is_active: _isActive, ...payload } = data;
      if (!payload.password) {
        delete payload.password;
      }
      updateMutation.mutate({ id: editingUser.id, values: payload });
    } else {
      if (!data.password) {
        setFormError("Password is required for new accounts");
        return;
      }
      createMutation.mutate(data);
    }
  };

  const handleEdit = (staff: StaffUser) => {
    setEditingUser(staff);
    setValue("email", staff.email);
    setValue("full_name", staff.full_name);
    setValue("role", staff.role);
    setValue("is_active", staff.is_active);
    setValue("password", ""); // Keep blank unless resetting
    setFormError(null);
  };

  const cancelEdit = () => {
    setEditingUser(null);
    reset();
    setFormError(null);
  };

  if (!currentUser) return null;
  if (currentUser.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-lg text-center">
          <h2 className="text-lg font-bold">Access Denied</h2>
          <p className="text-sm mt-1">You must have administrator privileges to view this page.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="border-b border-[#e5e7eb] pb-5">
          <h1 className="text-2xl font-bold text-gray-900">Staff Account Management</h1>
          <p className="text-sm text-gray-500 mt-1">Create, update, and manage access roles for Starlight staff</p>
        </div>

        {/* Content area - Split Screen */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Staff directory */}
          <div className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm lg:col-span-2 overflow-hidden">
            <div className="p-4 border-b border-[#e5e7eb] flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Staff Directory</h3>
              {isLoading && <RefreshCw className="animate-spin text-gray-500" size={16} />}
            </div>

            {isError && (
              <div className="p-4 text-sm text-red-700 bg-red-50 border-b border-red-100">
                Failed to retrieve staff directory list.
              </div>
            )}

            {staffList && staffList.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-gray-500">No staff members found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-[#e5e7eb] text-xs font-semibold text-gray-500 uppercase">
                      <th className="p-4">Name</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e7eb] text-sm">
                    {staffList?.map((staff) => (
                      <tr key={staff.id} className="hover:bg-gray-50">
                        <td className="p-4 font-medium text-gray-900">{staff.full_name}</td>
                        <td className="p-4 text-gray-600">{staff.email}</td>
                        <td className="p-4 capitalize text-gray-600">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${staff.role === "admin" ? "bg-purple-50 text-purple-700 border border-purple-100" : "bg-blue-50 text-blue-700 border border-blue-100"}`}>
                            {staff.role === "minute_secretary" ? "Minute Secretary" : staff.role === "staff" ? "Staff Reader" : "Administrator"}
                          </span>
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => {
                              if (staff.id !== currentUser.id) {
                                if (
                                  staff.is_active &&
                                  !window.confirm(`Deactivate ${staff.full_name}? They will no longer be able to sign in.`)
                                ) {
                                  return;
                                }
                                toggleStatusMutation.mutate(staff);
                              }
                            }}
                            disabled={staff.id === currentUser.id}
                            className={`flex items-center space-x-1 font-medium transition-colors ${
                              staff.is_active
                                ? "text-green-700 hover:text-green-800"
                                : "text-red-700 hover:text-red-800"
                            } disabled:opacity-50`}
                          >
                            {staff.is_active ? (
                              <CheckCircle size={16} />
                            ) : (
                              <XCircle size={16} />
                            )}
                            <span className="text-xs">{staff.is_active ? "Active" : "Inactive"}</span>
                          </button>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleEdit(staff)}
                            className="p-1 text-gray-500 hover:text-blue-700 rounded mr-2"
                            title="Edit details"
                          >
                            <Edit2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Form Side panel */}
          <div className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm p-6">
            <h3 className="font-bold text-gray-900 border-b border-[#e5e7eb] pb-3 mb-4">
              {editingUser ? `Edit ${editingUser.full_name}` : "Create Staff Account"}
            </h3>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  {...register("full_name")}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  placeholder="e.g. John Okello"
                />
                {errors.full_name && (
                  <p className="mt-1 text-xs text-red-600">{errors.full_name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  {...register("email")}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  placeholder="e.g. okellojohn@starlight.sc.ug"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Role
                </label>
                <select
                  {...register("role")}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                >
                  <option value="staff">Staff Reader (view only)</option>
                  <option value="minute_secretary">Minute Secretary</option>
                  <option value="admin">System Administrator</option>
                </select>
                {errors.role && (
                  <p className="mt-1 text-xs text-red-600">{errors.role.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {editingUser && "(Leave blank to keep current)"}
                </label>
                <input
                  type="password"
                  {...register("password")}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                  placeholder="••••••••"
                />
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 bg-blue-700 text-white py-2 px-4 rounded text-sm font-medium hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
                >
                  {editingUser ? "Save Changes" : "Create Account"}
                </button>
                {editingUser && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded text-sm font-medium hover:bg-gray-50 focus:outline-none transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
