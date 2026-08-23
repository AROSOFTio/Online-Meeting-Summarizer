"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Users } from "lucide-react";

import { useAuth } from "@/context/AuthContext";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(data.email, data.password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
        <div className="mb-7 text-center">
          {/* Use the bundled official logo directly so it is not proxied through the API binary response path. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/starlight-logo.jpg?v=official-20260823" alt="Starlight Secondary School" className="mx-auto mb-4 h-auto max-h-32 w-auto max-w-[230px] object-contain" />
          <h1 className="text-xl font-extrabold text-slate-950">STARLIGHT SECONDARY SCHOOL</h1>
          <p className="mt-1 text-sm text-slate-500">Meeting Summarizer</p>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">Email Address
            <input type="email" {...register("email")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" placeholder="name@starlightsecondaryschool.com" />
            {errors.email && <span className="mt-1 block text-xs text-red-600">{errors.email.message}</span>}
          </label>
          <label className="block text-sm font-medium text-slate-700">Password
            <input type="password" {...register("password")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600" placeholder="••••••••" />
            {errors.password && <span className="mt-1 block text-xs text-red-600">{errors.password.message}</span>}
          </label>
          <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-blue-700 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">{isSubmitting ? "Signing in..." : "Sign In"}</button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />OR<span className="h-px flex-1 bg-slate-200" /></div>
        <Link href="/join-meeting" className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 hover:bg-blue-100"><Users size={17} />Join an Invited Meeting</Link>
        <p className="mt-2 text-center text-xs text-slate-400">Invitees do not need a staff login.</p>
      </div>
    </main>
  );
}
