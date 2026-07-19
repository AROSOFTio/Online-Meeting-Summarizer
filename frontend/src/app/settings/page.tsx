"use client";

import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest } from "@/lib/api";
import { Save, RefreshCw, Upload } from "lucide-react";

interface SettingsData {
  school_name: string;
  school_logo_url: string;
  timezone: string;
  retention_period_days: string;
  whisper_model: string;
}

const defaultSettings: SettingsData = {
  school_name: "",
  school_logo_url: "",
  timezone: "",
  retention_period_days: "",
  whisper_model: "",
};

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<SettingsData>(defaultSettings);
  const [formLoaded, setFormLoaded] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const { data, isLoading, isError } = useQuery<SettingsData>({
    queryKey: ["system-settings"],
    queryFn: () => apiRequest("/api/settings/"),
  });

  useEffect(() => {
    if (data && !formLoaded) {
      setFormValues(data);
      setFormLoaded(true);
    }
  }, [data, formLoaded]);

  const saveMutation = useMutation({
    mutationFn: (values: SettingsData) =>
      apiRequest("/api/settings/", {
        method: "PUT",
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      setSuccessMsg("Settings saved successfully.");
      setErrorMsg(null);
      setFormLoaded(false); // allow re-sync from query
      setTimeout(() => setSuccessMsg(null), 3000);
    },
    onError: (err: Error) => {
      setErrorMsg(err.message || "Failed to save settings");
      setSuccessMsg(null);
    },
  });

  const handleChange = (key: keyof SettingsData, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formValues);
  };

  const handleLogoUpload = async (file: File | undefined) => {
    if (!file) return;
    setLogoUploading(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiRequest("/api/settings/logo", {
        method: "POST",
        body: formData,
      });
      setFormValues((previous) => ({
        ...previous,
        school_logo_url: result.school_logo_url,
      }));
      await queryClient.invalidateQueries({ queryKey: ["system-settings"] });
      setSuccessMsg("School logo uploaded successfully.");
    } catch (error: unknown) {
      setErrorMsg(error instanceof Error ? error.message : "Logo upload failed");
    } finally {
      setLogoUploading(false);
    }
  };

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-lg text-center">
          <h2 className="text-lg font-bold">Access Denied</h2>
          <p className="text-sm mt-1">Only administrators can manage system settings.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col space-y-6">
        <div className="border-b border-[#e5e7eb] pb-5">
          <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure school branding, timezone, data retention and transcription model
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 bg-white border border-gray-200 rounded-lg">
            <RefreshCw className="animate-spin text-blue-700" size={24} />
            <span className="ml-3 text-sm text-gray-500">Loading settings...</span>
          </div>
        )}

        {isError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            Failed to load system settings.
          </div>
        )}

        {data && (
          <form onSubmit={handleSubmit} className="bg-white border border-[#e5e7eb] rounded-lg shadow-sm p-6 max-w-2xl space-y-5">
            {successMsg && (
              <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded">
                {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School Name</label>
              <input
                type="text"
                value={formValues.school_name}
                onChange={(e) => handleChange("school_name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">School Logo</label>
              <div className="flex items-center gap-4 rounded border border-gray-200 p-4">
                <div className="h-16 w-16 overflow-hidden rounded bg-blue-50">
                  {formValues.school_logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={formValues.school_logo_url} alt="School logo" className="h-full w-full object-contain" />
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
                  <Upload size={16} />
                  <span>{logoUploading ? "Uploading..." : "Upload Logo"}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={logoUploading}
                    onChange={(event) => void handleLogoUpload(event.target.files?.[0])}
                  />
                </label>
              </div>
              <p className="mt-1 text-xs text-gray-500">PNG, JPEG, WebP, or SVG; maximum 5 MB.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <select
                value={formValues.timezone}
                onChange={(e) => handleChange("timezone", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
              >
                <option value="Africa/Kampala">Africa/Kampala (EAT, UTC+3)</option>
                <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data Retention Period (days)</label>
              <input
                type="number"
                min="30"
                max="3650"
                value={formValues.retention_period_days}
                onChange={(e) => handleChange("retention_period_days", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
              />
              <p className="mt-1 text-xs text-gray-500">Recordings older than this will be marked for cleanup</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Whisper Transcription Model</label>
              <select
                value={formValues.whisper_model}
                onChange={(e) => handleChange("whisper_model", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
              >
                <option value="tiny">tiny (fastest, lowest accuracy)</option>
                <option value="base">base (balanced)</option>
                <option value="small">small (slower, higher accuracy)</option>
                <option value="medium">medium (slow, high accuracy)</option>
                <option value="large-v2">large-v2 (slowest, highest accuracy)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Larger models require more RAM and processing time</p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="flex items-center space-x-2 bg-blue-700 text-white px-5 py-2 rounded text-sm font-medium hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
              >
                <Save size={16} />
                <span>{saveMutation.isPending ? "Saving..." : "Save Settings"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
