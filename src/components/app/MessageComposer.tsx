"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type { Message, PendingUpload } from "@/lib/types";
import { GifPicker } from "./GifPicker";
import { cn } from "@/lib/utils";

export type SendPayload = {
  content: string;
  replyToId?: string | null;
  files?: File[];
  gifUrl?: string | null;
  gifName?: string | null;
};

type MessageComposerProps = {
  channelName: string;
  channelId?: string;
  disabled?: boolean;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  onSend: (payload: SendPayload) => Promise<void> | void;
  onTyping?: () => void;
  searchOpen?: boolean;
  onToggleSearch?: () => void;
  onTogglePins?: () => void;
};

export function MessageComposer({
  channelName,
  channelId,
  disabled,
  replyTo,
  onCancelReply,
  onSend,
  onTyping,
  onToggleSearch,
  onTogglePins,
}: MessageComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [gifOpen, setGifOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    return () => {
      uploads.forEach((u) => URL.revokeObjectURL(u.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/") || f.size < 25 * 1024 * 1024,
    );
    if (!files.length) return;
    setUploads((prev) => [
      ...prev,
      ...files.slice(0, 8 - prev.length).map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function removeUpload(id: string) {
    setUploads((prev) => {
      const hit = prev.find((u) => u.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((u) => u.id !== id);
    });
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault();
    const content = value.trim();
    if ((!content && uploads.length === 0) || sending || disabled) return;
    setSending(true);
    try {
      await onSend({
        content,
        replyToId: replyTo?.id ?? null,
        files: uploads.map((u) => u.file),
      });
      setValue("");
      uploads.forEach((u) => URL.revokeObjectURL(u.previewUrl));
      setUploads([]);
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

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      const images = Array.from(items).filter((f) => f.type.startsWith("image/"));
      if (images.length) {
        e.preventDefault();
        addFiles(images);
      }
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "relative shrink-0 border-t border-border bg-chat px-4 py-3",
        dragging && "bg-accent/5",
      )}
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

      {uploads.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="relative h-16 w-16 overflow-hidden rounded-lg border border-border"
            >
              {u.file.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.previewUrl}
                  alt={u.file.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-bg-elevated p-1 text-[9px] text-text-muted">
                  {u.file.name}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeUpload(u.id)}
                className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 text-[10px] text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,.pdf,.zip"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          title="Attach photo or file"
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-border-strong bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:border-text-muted hover:text-text"
        >
          + Photo
        </button>
        <div className="relative">
          <button
            type="button"
            title="GIF"
            onClick={() => setGifOpen((v) => !v)}
            className="rounded-md border border-border-strong bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:border-text-muted hover:text-text"
          >
            GIF
          </button>
          <GifPicker
            open={gifOpen}
            onClose={() => setGifOpen(false)}
            onPick={(gif) => {
              void (async () => {
                setSending(true);
                try {
                  await onSend({
                    content: value.trim() || gif.title,
                    replyToId: replyTo?.id ?? null,
                    gifUrl: gif.url,
                    gifName: `${gif.title}.gif`,
                  });
                  setValue("");
                  onCancelReply?.();
                } finally {
                  setSending(false);
                }
              })();
            }}
          />
        </div>
        {onToggleSearch && (
          <button
            type="button"
            title="Search"
            onClick={onToggleSearch}
            className="rounded-md border border-border-strong bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:border-text-muted hover:text-text"
          >
            Find
          </button>
        )}
        {onTogglePins && (
          <button
            type="button"
            title="Pins"
            onClick={onTogglePins}
            className="rounded-md border border-border-strong bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:border-text-muted hover:text-text"
          >
            Pins
          </button>
        )}
      </div>

      <div className="flex items-end gap-2 rounded-lg border border-border-strong bg-bg-elevated px-3 py-2 focus-within:border-text-muted">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={disabled || sending}
          placeholder={
            dragging
              ? "Drop files to upload…"
              : `Message #${channelName}`
          }
          rows={1}
          className="max-h-40 min-h-[36px] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm text-text outline-none placeholder:text-text-muted disabled:opacity-50"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={
            disabled || sending || (!value.trim() && uploads.length === 0)
          }
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-text-muted">
        Enter to send · Shift+Enter new line · paste or drop images
        {value.length > 1800 ? ` · ${2000 - value.length} left` : ""}
      </p>
    </form>
  );
}
