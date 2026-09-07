"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Message } from "@/lib/types";

type MessageComposerProps = {
  channelName: string;
  channelId?: string;
  disabled?: boolean;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  onSend: (content: string, replyToId?: string | null) => Promise<void> | void;
  onTyping?: () => void;
};

export function MessageComposer({
  channelName,
  channelId,
  disabled,
  replyTo,
  onCancelReply,
  onSend,
  onTyping,
}: MessageComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingAt = useRef(0);
  const draftKey = channelId ? `hango-draft:${channelId}` : null;

  useEffect(() => {
    if (!draftKey) {
      setValue("");
      return;
    }
    try {
      setValue(localStorage.getItem(draftKey) ?? "");
    } catch {
      setValue("");
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    try {
      if (value) localStorage.setItem(draftKey, value);
      else localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [value, draftKey]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const content = value.trim();
    if (!content || sending || disabled) return;
    setSending(true);
    try {
      await onSend(content, replyTo?.id ?? null);
      setValue("");
      if (draftKey) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
      }
      onCancelReply?.();
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
    if (e.key === "Escape" && replyTo) {
      onCancelReply?.();
    }
  }

  function onChange(next: string) {
    setValue(next);
    const now = Date.now();
    if (now - typingAt.current > 2000) {
      typingAt.current = now;
      onTyping?.();
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="shrink-0 border-t border-border bg-chat px-4 py-3"
    >
      {replyTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-xs">
          <p className="min-w-0 truncate text-text-secondary">
            Replying to{" "}
            <span className="font-medium text-text">
              {replyTo.author?.display_name ?? "User"}
            </span>
            <span className="ml-1 text-text-muted">{replyTo.content}</span>
          </p>
          <button
            type="button"
            onClick={onCancelReply}
            className="shrink-0 text-text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 focus-within:border-text-muted">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled || sending}
          placeholder={`Message #${channelName}`}
          rows={1}
          className="max-h-40 min-h-[36px] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm text-text outline-none placeholder:text-text-muted disabled:opacity-50"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={disabled || sending || !value.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-text-muted">
        Enter to send · Shift+Enter for new line
        {value.length > 1800 ? ` · ${2000 - value.length} left` : ""}
      </p>
    </form>
  );
}
