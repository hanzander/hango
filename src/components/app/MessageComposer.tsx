"use client";

import { FormEvent, useState } from "react";

type MessageComposerProps = {
  channelName: string;
  disabled?: boolean;
  onSend: (content: string) => Promise<void> | void;
};

export function MessageComposer({
  channelName,
  disabled,
  onSend,
}: MessageComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const content = value.trim();
    if (!content || sending || disabled) return;
    setSending(true);
    try {
      await onSend(content);
      setValue("");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-border bg-chat px-4 py-3"
    >
      <div className="flex items-end gap-2 rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 focus-within:border-text-muted">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled || sending}
          placeholder={`Message #${channelName}`}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-text outline-none placeholder:text-text-muted disabled:opacity-50"
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
    </form>
  );
}
