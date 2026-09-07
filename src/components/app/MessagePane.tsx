"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Message, MessageAttachment, MessageEmbed } from "@/lib/types";
import {
  formatMessageDateDivider,
  formatMessageTime,
  sameCalendarDay,
  cn,
} from "@/lib/utils";
import { parseDiscordMarkdown } from "@/lib/markdown";
import { Avatar } from "@/components/ui/Avatar";
import { LinkEmbedCard, extractUrls, useFetchEmbed } from "@/lib/embeds";
import { Lightbox } from "./Lightbox";

type MessagePaneProps = {
  channelName: string;
  channelId?: string;
  channelTopic?: string | null;
  messages: Message[];
  loading?: boolean;
  currentUserId?: string;
  canManageMessages?: boolean;
  typingNames?: string[];
  searchQuery?: string;
  pinsOnly?: boolean;
  onSearchChange?: (q: string) => void;
  onEdit?: (messageId: string, content: string) => Promise<void> | void;
  onDelete?: (messageId: string) => Promise<void> | void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => Promise<void> | void;
  onPin?: (messageId: string, pin: boolean) => Promise<void> | void;
  onOpenProfile?: (userId: string) => void;
  onStartThread?: (message: Message) => void;
};

const NEAR_BOTTOM_PX = 160;
const QUICK_EMOJIS = ["👍", "😂", "❤️", "🔥", "😮", "😢"];

export function MessagePane({
  channelName,
  channelId,
  channelTopic,
  messages,
  loading,
  currentUserId,
  canManageMessages,
  typingNames = [],
  searchQuery = "",
  pinsOnly = false,
  onSearchChange,
  onEdit,
  onDelete,
  onReply,
  onReact,
  onPin,
  onOpenProfile,
  onStartThread,
}: MessagePaneProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const ignoreScrollUntil = useRef(0);
  const prevChannelId = useRef(channelId);
  const prevLen = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null,
  );
  const [typingShown, setTypingShown] = useState<string[]>([]);
  const [typingVisible, setTypingVisible] = useState(false);

  useEffect(() => {
    if (typingNames.length > 0) {
      setTypingShown(typingNames);
      setTypingVisible(true);
      return;
    }
    setTypingVisible(false);
    const t = window.setTimeout(() => setTypingShown([]), 280);
    return () => window.clearTimeout(t);
  }, [typingNames]);

  function isNearBottom(el: HTMLDivElement) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = scrollerRef.current;
    ignoreScrollUntil.current = Date.now() + 120;
    stickToBottom.current = true;
    setShowJump(false);
    if (el) {
      if (behavior === "smooth") {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    } else {
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    }
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onScroll() {
      if (!scrollerRef.current) return;
      if (Date.now() < ignoreScrollUntil.current) return;
      const near = isNearBottom(scrollerRef.current);
      stickToBottom.current = near;
      setShowJump(!near);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // New channel → always pin to latest
  useLayoutEffect(() => {
    if (prevChannelId.current !== channelId) {
      prevChannelId.current = channelId;
      stickToBottom.current = true;
      prevLen.current = 0;
      setShowJump(false);
    }
  }, [channelId]);

  // After load / new messages / images: stay at bottom when pinned
  useLayoutEffect(() => {
    if (loading) return;
    const grew = messages.length > prevLen.current;
    const opened = prevLen.current === 0 && messages.length > 0;
    prevLen.current = messages.length;

    if (opened || stickToBottom.current) {
      scrollToBottom(opened || !grew ? "auto" : "smooth");
      // Images/embeds can grow height after paint — nudge again
      requestAnimationFrame(() => {
        if (stickToBottom.current) scrollToBottom("auto");
      });
      window.setTimeout(() => {
        if (stickToBottom.current) scrollToBottom("auto");
      }, 80);
      return;
    }
    if (grew) setShowJump(true);
  }, [messages, loading, channelId, searchQuery, pinsOnly]);

  // Keep pinned when the scroller content resizes (image loads, etc.)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stickToBottom.current) scrollToBottom("auto");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(() => {
    let list = messages.filter((m) => !m.deleted_at);
    if (pinsOnly) list = list.filter((m) => m.pinned_at);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.content.toLowerCase().includes(q) ||
          m.author?.display_name?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [messages, pinsOnly, searchQuery]);

  return (
    <div className="hango-chat-wash relative flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/80 bg-transparent px-4 backdrop-blur-sm">
        {onSearchChange && searchQuery !== undefined && searchQuery.length > 0 ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 shrink-0 text-text-muted"
              fill="none"
              aria-hidden
            >
              <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
              <path
                d="m16 16 3 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              value={searchQuery.trim() === "" ? "" : searchQuery}
              onChange={(e) => onSearchChange(e.target.value || " ")}
              placeholder="Search this channel…"
              className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
              autoFocus
            />
            <span className="shrink-0 text-[11px] text-text-muted">
              {visible.length} result{visible.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              title="Close search"
              onClick={() => onSearchChange("")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-bg-hover hover:text-text"
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-text-muted">#</span>
                <h1 className="truncate text-sm font-semibold tracking-tight text-text">
                  {channelName}
                </h1>
                {pinsOnly && (
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                    Pins
                  </span>
                )}
              </div>
              {channelTopic && !pinsOnly && (
                <p className="truncate text-[11px] text-text-muted">
                  {channelTopic}
                </p>
              )}
            </div>
          </>
        )}
      </header>

      <div
        ref={scrollerRef}
        className="hango-scroll relative flex-1 overflow-y-auto px-4 py-4"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Loading messages…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-subtle text-2xl text-text-muted ring-1 ring-border">
              #
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-text">
              Welcome to #{channelName}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-text-secondary">
              This is the start of the channel. Send a message to get the
              conversation going.
            </p>
          </div>
        ) : (
          <ul className="space-y-0">
            {visible.map((message, i) => {
              const prev = visible[i - 1];
              const showDate =
                !prev || !sameCalendarDay(prev.created_at, message.created_at);
              const grouped =
                !!prev &&
                !showDate &&
                prev.author_id === message.author_id &&
                new Date(message.created_at).getTime() -
                  new Date(prev.created_at).getTime() <
                  7 * 60 * 1000;
              return (
                <li key={message.id} className="list-none">
                  {showDate && (
                    <div
                      className={cn(
                        "mb-2 flex items-center gap-3",
                        i > 0 && "mt-4",
                      )}
                      role="separator"
                      aria-label={formatMessageDateDivider(message.created_at)}
                    >
                      <div className="h-px flex-1 bg-border" />
                      <span className="shrink-0 text-[11px] font-medium tracking-wide text-text-muted">
                        {formatMessageDateDivider(message.created_at)}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <MessageRow
                    message={message}
                    grouped={grouped}
                    currentUserId={currentUserId}
                    isOwn={message.author_id === currentUserId}
                    canManageMessages={canManageMessages}
                    editing={editingId === message.id}
                    editValue={editValue}
                    onEditValue={setEditValue}
                    onStartEdit={() => {
                      setEditingId(message.id);
                      setEditValue(message.content);
                    }}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={async () => {
                      if (!onEdit || !editValue.trim()) return;
                      await onEdit(message.id, editValue.trim());
                      setEditingId(null);
                    }}
                    onDelete={() => onDelete?.(message.id)}
                    onReply={() => onReply?.(message)}
                    onReact={(emoji) => onReact?.(message.id, emoji)}
                    onPin={() => onPin?.(message.id, !message.pinned_at)}
                    onStartThread={() => onStartThread?.(message)}
                    onOpenAttachment={(a) =>
                      setLightbox({ src: a.url, alt: a.filename })
                    }
                    onOpenProfile={() =>
                      onOpenProfile?.(message.author_id)
                    }
                  />
                </li>
              );
            })}
            <div ref={bottomRef} aria-hidden />
          </ul>
        )}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg shadow-lg"
        >
          Jump to Present
        </button>
      )}

      <div
        className={cn(
          "hango-typing overflow-hidden px-4",
          typingVisible
            ? "max-h-8 translate-y-0 pb-1 opacity-100"
            : "max-h-0 -translate-y-1 pb-0 opacity-0",
        )}
        aria-live="polite"
      >
        <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="inline-flex gap-0.5" aria-hidden>
            <span className="h-1 w-1 animate-pulse rounded-full bg-text-muted" />
            <span
              className="h-1 w-1 animate-pulse rounded-full bg-text-muted"
              style={{ animationDelay: "120ms" }}
            />
            <span
              className="h-1 w-1 animate-pulse rounded-full bg-text-muted"
              style={{ animationDelay: "240ms" }}
            />
          </span>
          {formatTyping(typingShown)}
        </p>
      </div>

      <Lightbox
        src={lightbox?.src ?? null}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}

function formatTyping(names: string[]) {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `Several people are typing…`;
}

function MessageRow({
  message,
  grouped,
  currentUserId,
  isOwn,
  canManageMessages,
  editing,
  editValue,
  onEditValue,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onReply,
  onReact,
  onPin,
  onStartThread,
  onOpenAttachment,
  onOpenProfile,
}: {
  message: Message;
  grouped: boolean;
  currentUserId?: string;
  isOwn: boolean;
  canManageMessages?: boolean;
  editing: boolean;
  editValue: string;
  onEditValue: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onPin?: () => void;
  onStartThread?: () => void;
  onOpenAttachment: (a: MessageAttachment) => void;
  onOpenProfile: () => void;
}) {
  const name = message.author?.display_name ?? "Unknown";
  const reactionMap = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of message.reactions ?? []) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (currentUserId && r.user_id === currentUserId) cur.mine = true;
      map.set(r.emoji, cur);
    }
    return map;
  }, [message.reactions, currentUserId]);

  const storedEmbeds: MessageEmbed[] = Array.isArray(message.embed_json)
    ? message.embed_json
    : message.embed_json
      ? [message.embed_json]
      : [];
  const firstUrl =
    storedEmbeds.length === 0 ? extractUrls(message.content)[0] ?? null : null;
  const liveEmbed = useFetchEmbed(firstUrl);

  return (
    <div
      className={cn(
        "hango-msg group relative grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 rounded-xl px-2 py-0.5 transition-colors duration-150 hover:bg-white/[0.035]",
        grouped ? "mt-0" : "mt-2",
        message.pinned_at && "bg-amber-500/[0.05]",
      )}
      style={{ alignItems: "start" }}
    >
      <div className="self-start pt-0.5">
        {!grouped ? (
          <button
            type="button"
            onClick={onOpenProfile}
            className="block h-10 w-10 shrink-0 overflow-hidden rounded-full p-0 leading-none transition hover:opacity-90"
          >
            <Avatar
              name={name}
              src={message.author?.avatar_url}
              size="md"
            />
          </button>
        ) : (
          <div className="h-10 w-10" aria-hidden />
        )}
      </div>
      <div className="min-w-0">
        {message.reply_to && (
          <button
            type="button"
            onClick={onReply}
            className="mb-1 flex max-w-full items-center gap-1 truncate text-[11px] text-text-muted hover:text-text-secondary"
          >
            <span className="opacity-60">↳</span>
            <span className="font-medium">
              {message.reply_to.author?.display_name ?? "User"}
            </span>
            <span className="truncate opacity-80">
              {message.reply_to.content}
            </span>
          </button>
        )}
        {!grouped && (
          <div className="mb-0.5 flex h-5 items-baseline gap-2 leading-none">
            <button
              type="button"
              onClick={onOpenProfile}
              className="text-[15px] font-semibold leading-5 text-text hover:underline"
            >
              {name}
            </button>
            <time className="text-[11px] leading-5 text-text-muted">
              {formatMessageTime(message.created_at)}
            </time>
            {message.edited_at && (
              <span className="text-[10px] text-text-muted">(edited)</span>
            )}
            {message.pinned_at && (
              <span className="text-[10px] text-amber-300/90">Pinned</span>
            )}
          </div>
        )}
        {!grouped && message.author?.custom_status ? (
          <p className="mb-0.5 truncate text-[11px] leading-snug text-text-muted">
            {message.author.custom_status}
          </p>
        ) : null}

        {editing ? (
          <div className="mt-1 space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => onEditValue(e.target.value)}
              className="w-full rounded-md border border-border-strong bg-bg px-2 py-1.5 text-sm text-text outline-none"
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelEdit();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSaveEdit();
                }
              }}
            />
            <div className="flex gap-2 text-[11px]">
              <button
                type="button"
                className="text-emerald-400 hover:underline"
                onClick={() => void onSaveEdit()}
              >
                save
              </button>
              <button
                type="button"
                className="text-text-muted hover:underline"
                onClick={onCancelEdit}
              >
                cancel
              </button>
            </div>
          </div>
        ) : (
          message.content && (
            <p
              className={cn(
                "whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-200",
                !grouped && "mt-0.5",
              )}
            >
              <FormattedText text={message.content} />
            </p>
          )
        )}

        {(message.attachments?.length ?? 0) > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {message.attachments!.map((a) => {
              const isImage = (a.content_type || "").startsWith("image/") ||
                /\.(png|jpe?g|gif|webp|avif)$/i.test(a.filename);
              return isImage ? (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpenAttachment(a)}
                  className="block max-w-full overflow-hidden rounded-lg border border-border text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.filename}
                    className="block max-h-80 max-w-full object-contain sm:max-w-md"
                  />
                </button>
              ) : (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-accent hover:underline"
                >
                  {a.filename}
                </a>
              );
            })}
          </div>
        )}

        {storedEmbeds.map((e) => (
          <LinkEmbedCard key={e.url} embed={e} />
        ))}
        {liveEmbed && <LinkEmbedCard embed={liveEmbed} />}

        {(message.reactions?.length ?? 0) > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[...reactionMap.entries()].map(([emoji, info]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-xs hover:border-text-muted",
                  info.mine
                    ? "border-accent/50 bg-accent/15"
                    : "border-border bg-bg-elevated",
                )}
              >
                {emoji} {info.count}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        className={cn(
          "absolute -top-3.5 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-border-strong",
          "bg-[#1c1a18]/95 p-0.5 shadow-[0_10px_28px_rgba(0,0,0,0.5)] backdrop-blur-md",
          "opacity-0 translate-y-1 scale-[0.98] transition-all duration-150",
          "group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100",
          "focus-within:translate-y-0 focus-within:scale-100 focus-within:opacity-100",
        )}
      >
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className="rounded-md px-1.5 py-1 text-sm transition hover:bg-white/10"
            onClick={() => onReact(e)}
            title="Add reaction"
          >
            {e}
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
        <button
          type="button"
          className="rounded-md px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:bg-white/10 hover:text-text"
          onClick={onReply}
          title="Reply"
        >
          Reply
        </button>
        {onPin && (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:bg-white/10 hover:text-text"
            onClick={onPin}
            title={message.pinned_at ? "Unpin" : "Pin"}
          >
            {message.pinned_at ? "Unpin" : "Pin"}
          </button>
        )}
        {onStartThread && (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:bg-white/10 hover:text-text"
            onClick={onStartThread}
            title="Start thread"
          >
            Thread
          </button>
        )}
        {isOwn && (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-medium text-text-secondary transition hover:bg-white/10 hover:text-text"
            onClick={onStartEdit}
            title="Edit"
          >
            Edit
          </button>
        )}
        {(isOwn || canManageMessages) && (
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-medium text-red-300/90 transition hover:bg-red-500/15 hover:text-red-200"
            onClick={onDelete}
            title="Delete"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  const segs = parseDiscordMarkdown(text);
  return (
    <>
      {segs.map((s, i) => {
        switch (s.type) {
          case "bold":
            return <strong key={i}>{s.value}</strong>;
          case "italic":
            return <em key={i}>{s.value}</em>;
          case "code":
            return (
              <code
                key={i}
                className="rounded bg-black/40 px-1 py-0.5 font-mono text-[12px] text-emerald-200"
              >
                {s.value}
              </code>
            );
          case "spoiler":
            return (
              <Spoiler key={i}>{s.value}</Spoiler>
            );
          case "mention":
            return (
              <span
                key={i}
                className="rounded bg-accent/20 px-1 text-accent"
              >
                {s.value}
              </span>
            );
          default:
            return <span key={i}>{s.value}</span>;
        }
      })}
    </>
  );
}

function Spoiler({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "rounded px-0.5 transition-colors",
        open ? "bg-white/10 text-inherit" : "bg-white/20 text-transparent",
      )}
    >
      {children}
    </button>
  );
}
