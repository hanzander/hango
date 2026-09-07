"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
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
  searchActive?: boolean;
  pinsActive?: boolean;
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
  searchActive,
  pinsActive,
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
      (f) =>
        f.type.startsWith("image/") ||
        f.type.startsWith("video/") ||
        f.size < 25 * 1024 * 1024,
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
      const images = Array.from(items).filter((f) =>
        f.type.startsWith("image/"),
      );
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

  const canSend = !disabled && !sending && (!!value.trim() || uploads.length > 0);

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
        "relative shrink-0 border-t border-border/80 bg-chat px-4 pb-3 pt-3",
        dragging && "bg-emerald-500/[0.04]",
      )}
    >
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-t-xl border border-b-0 border-border bg-bg-subtle px-3 py-2 text-xs">
          <span className="h-8 w-0.5 shrink-0 rounded-full bg-emerald-400/80" />
          <p className="min-w-0 flex-1 truncate text-text-secondary">
            Replying to{" "}
            <span className="font-medium text-text">
              {replyTo.author?.display_name ?? "User"}
            </span>
            <span className="ml-1.5 text-text-muted">{replyTo.content}</span>
          </p>
          <button
            type="button"
            onClick={onCancelReply}
            className="rounded-md px-2 py-1 text-text-muted transition hover:bg-bg-hover hover:text-text"
          >
            Cancel
          </button>
        </div>
      )}

      <div
        className={cn(
          "overflow-hidden rounded-2xl bg-bg-elevated ring-1 ring-border transition-[box-shadow,ring-color]",
          dragging && "ring-emerald-500/40",
          "focus-within:ring-border-strong",
        )}
      >
        {uploads.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2.5">
            {uploads.map((u) => (
              <div
                key={u.id}
                className="group relative h-[72px] w-[72px] overflow-hidden rounded-xl bg-bg ring-1 ring-border"
              >
                {u.file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.previewUrl}
                    alt={u.file.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-1.5 text-center text-[9px] leading-tight text-text-muted">
                    {u.file.name}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeUpload(u.id)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-xs text-white opacity-90 transition hover:bg-black"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1 px-2 py-2">
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

          <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
            <ToolBtn
              title="Attach photo or file"
              onClick={() => fileRef.current?.click()}
            >
              <IconPlus />
            </ToolBtn>
            <div className="relative">
              <ToolBtn
                title="GIF"
                active={gifOpen}
                onClick={() => setGifOpen((v) => !v)}
              >
                <span className="text-[10px] font-bold tracking-wide">GIF</span>
              </ToolBtn>
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
              <ToolBtn
                title="Find in channel"
                active={searchActive}
                onClick={onToggleSearch}
              >
                <IconSearch />
              </ToolBtn>
            )}
            {onTogglePins && (
              <ToolBtn
                title="Pinned messages"
                active={pinsActive}
                onClick={onTogglePins}
              >
                <IconPin />
              </ToolBtn>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={disabled || sending}
            placeholder={
              dragging ? "Drop files to upload…" : `Message #${channelName}`
            }
            rows={1}
            className="max-h-40 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm leading-5 text-text outline-none placeholder:text-text-muted disabled:opacity-50"
            autoComplete="off"
          />

          <button
            type="submit"
            disabled={!canSend}
            title="Send"
            className={cn(
              "mb-0.5 mr-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition",
              canSend
                ? "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-95"
                : "bg-white/5 text-text-muted opacity-50",
            )}
          >
            <IconSend />
          </button>
        </div>
      </div>

      <p className="mt-2 px-1 text-[10px] text-text-muted/80">
        Enter to send · Shift+Enter new line
        {value.length > 1800 ? ` · ${2000 - value.length} left` : ""}
      </p>
    </form>
  );
}

function ToolBtn({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-bg-hover hover:text-text",
        active && "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200",
      )}
    >
      {children}
    </button>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 8v8M8 12h8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="m16 16 3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPin() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" aria-hidden>
      <path
        d="M15 4.5 19.5 9l-3 1.5L14 13l-3 6-1.5-4.5L5 13l6-3L12.5 7.5 15 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M3.4 20.6 21 12 3.4 3.4l-.1 6.7L15 12 3.3 13.9l.1 6.7Z" />
    </svg>
  );
}
