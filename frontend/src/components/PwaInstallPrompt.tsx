"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js");
    }
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  if (!visible || !installPrompt) return null;

  const install = async () => {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setVisible(false);
    setInstallPrompt(null);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-blue-200 bg-white p-4 shadow-xl">
      <div className="flex-1">
        <p className="font-semibold text-gray-900">Install Meeting Summarizer</p>
        <p className="text-xs text-gray-500">Add it to this device for quicker access.</p>
      </div>
      <button onClick={() => void install()} className="inline-flex items-center gap-1 rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white">
        <Download size={16} /> Install
      </button>
      <button onClick={() => setVisible(false)} aria-label="Dismiss install prompt" className="p-1 text-gray-500">
        <X size={18} />
      </button>
    </div>
  );
}
