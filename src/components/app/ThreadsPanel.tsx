"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

type ThreadRow = {
  id: string;
  name: string;
  root_message_id: string;
  created_at: string;
};

type ThreadsPanelProps = {
  open: boolean;
  onClose: () => void;
  channelId: string;
  onOpenRoot: (messageId: string) => void;
};

export function ThreadsPanel({
  open,
  onClose,
  channelId,
  onOpenRoot,
}: ThreadsPanelProps) {
  const { toast } = useToast();
  const [threads, setThreads] = useState<ThreadRow[]>([]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    void supabase
      .from("threads")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          toast(
            /threads|relation/i.test(error.message)
              ? "Run migration 006 for threads"
              : error.message,
            "danger",
          );
          return;
        }
        setThreads((data as ThreadRow[]) ?? []);
      });
  }, [open, channelId, toast]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-72 flex-col border-l border-border bg-sidebar shadow-xl">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          Threads
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-text-muted hover:text-text"
        >
          Close
        </button>
      </div>
      <div className="hango-scroll flex-1 overflow-y-auto p-2">
        {threads.length === 0 && (
          <p className="px-2 py-4 text-xs text-text-muted">
            No threads yet — hover a message → Thread
          </p>
        )}
        <ul className="space-y-1">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left hover:bg-bg-hover"
                onClick={() => onOpenRoot(t.root_message_id)}
              >
                <p className="truncate text-sm text-text">{t.name}</p>
                <p className="text-[10px] text-text-muted">
                  {new Date(t.created_at).toLocaleString()}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
