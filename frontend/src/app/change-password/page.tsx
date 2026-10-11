"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { checkAuth } = useAuth();
  const [current_password, setCurrent] = useState("");
  const [new_password, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (new_password !== confirm) { setError("Passwords do not match"); return; }
    if (new_password.length < 8 || !/[A-Z]/.test(new_password) || !/[a-z]/.test(new_password) || !/[^A-Za-z0-9]/.test(new_password)) {
      setError("Use at least 8 characters, uppercase, lowercase and a special character."); return;
    }
    setBusy(true); setError("");
    try {
      await apiRequest("/api/auth/change-password", { method: "POST", body: JSON.stringify({current_password, new_password}) });
      await checkAuth();
      router.replace("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Password change failed"); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
    <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-7 shadow">
      <h1 className="text-xl font-bold">Change your temporary password</h1>
      <p className="text-sm text-slate-600">Required before accessing your account.</p>
      <label className="block">Temporary password<input className="mt-1 w-full rounded border p-3" type="password" autoComplete="current-password" required value={current_password} onChange={e=>setCurrent(e.target.value)}/></label>
      <label className="block">New password<input className="mt-1 w-full rounded border p-3" type="password" autoComplete="new-password" required value={new_password} onChange={e=>setNext(e.target.value)}/></label>
      <p className="text-xs text-slate-600">At least 8 characters with uppercase, lowercase and special character.</p>
      <label className="block">Confirm new password<input className="mt-1 w-full rounded border p-3" type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="w-full rounded bg-blue-700 p-3 font-semibold text-white" disabled={busy}>{busy ? "Saving..." : "Save password"}</button>
    </form>
  </main>;
}
