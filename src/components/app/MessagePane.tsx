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
import { formatMessageTime, cn } from "@/lib/utils";
import { parseDiscordMarkdown } from "@/lib/markdown";
import { Avatar } from "@/components/ui/Avatar";
import { LinkEmbedCard, extractUrls, useFetchEmbed } from "@/lib/embeds";
import { Lightbox } from "./Lightbox";

type MessagePaneProps = {
  channelName: string;
  channelTopic?: string | null;
  messages: Message[];
  loading?: boolean;
  currentUserId?: string;
  compact?: boolean;
  typingNames?: string[];
  searchQuery?: string;
  pinsOnly?: boolean;
  onEdit?: (messageId: string, content: string) => Promise<void> | void;
  onDelete?: (messageId: string) => Promise<void> | void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => Promise<void> | void;
  onPin?: (messageId: string, pin: boolean) => Promise<void> | void;
  onOpenProfile?: (userId: string) => void;
  onStartThread?: (message: Message) => void;
};

const NEAR_BOTTOM_PX = 120;
const QUICK_EMOJIS = ["👍", "😂", "❤️", "🔥", "😮", "😢"];

export function MessagePane({
  channelName,
  channelTopic,
  messages,
  loading,
  currentUserId,
  compact,
  typingNames = [],
  searchQuery = "",
  pinsOnly = false,
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
  const prevChannel = useRef(channelName);
  const prevLen = useRef(0);
  const [showJump, setShowJump] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null,
  );

  function isNearBottom(el: HTMLDivElement) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    stickToBottom.current = true;
    setShowJump(false);
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onScroll() {
      if (!scrollerRef.current) return;
      const near = isNearBottom(scrollerRef.current);
      stickToBottom.current = near;
      setShowJump(!near);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (loading) return;
    if (prevChannel.current !== channelName) {
      prevChannel.current = channelName;
      stickToBottom.current = true;
      prevLen.current = 0;
      setShowJump(false);
    }
  }, [channelName, loading]);

  useLayoutEffect(() => {
    if (loading) return;
    const grew = messages.length > prevLen.current;
    const channelJustOpened = prevLen.current === 0 && messages.length > 0;
    prevLen.current = messages.length;
    if (!grew && !channelJustOpened) return;
    if (!stickToBottom.current && !channelJustOpened) {
      setShowJump(true);
      return;
    }
    scrollToBottom(channelJustOpened || messages.length <= 1 ? "auto" : "smooth");
  }, [messages, loading, channelName]);

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
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-chat">
      <header className="flex h-12 shrink-0 flex-col justify-center border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="text-text-muted">#</span>
          <h1 className="text-sm font-semibold tracking-tight text-text">
            {channelName}
          </h1>
        </div>
        {channelTopic && (
          <p className="truncate text-[11px] text-text-muted">{channelTopic}</p>
        )}
        {(searchQuery || pinsOnly) && (
          <p className="truncate text-[11px] text-amber-300/90">
            {pinsOnly ? "Pinned messages" : `Search: “${searchQuery}”`} ·{" "}
            {visible.length} result{visible.length === 1 ? "" : "s"}
          </p>
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
          <ul className={cn(compact ? "space-y-1" : "space-y-4")}>
            {visible.map((message, i) => {
              const prev = visible[i - 1];
              const grouped =
                !!prev &&
                prev.author_id === message.author_id &&
                new Date(message.created_at).getTime() -
                  new Date(prev.created_at).getTime() <
                  7 * 60 * 1000;
              return (
                <MessageRow
                  key={message.id}
                  message={message}
                  grouped={grouped}
                  compact={compact}
                  currentUserId={currentUserId}
                  isOwn={message.author_id === currentUserId}
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

      {typingNames.length > 0 && (
        <p className="px-4 pb-1 text-[11px] text-text-muted">
          {formatTyping(typingNames)}
        </p>
      )}

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
  compact,
  currentUserId,
  isOwn,
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
  compact?: boolean;
  currentUserId?: string;
  isOwn: boolean;
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
    <li
      className={cn(
        "hango-msg group relative flex gap-3 rounded-lg px-1 transition-colors duration-150 hover:bg-white/[0.03]",
        grouped && !compact && "mt-0",
        compact && "py-0.5",
        message.pinned_at && "bg-amber-500/[0.04]",
      )}
    >
      {!grouped && !compact ? (
        <button type="button" onClick={onOpenProfile} className="shrink-0 pt-0.5">
          <Avatar name={name} src={message.author?.avatar_url} />
        </button>
      ) : (
        <div className="w-10 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
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
        {(!grouped || compact) && (
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={onOpenProfile}
              className="text-sm font-medium text-text hover:underline"
            >
              {name}
            </button>
            <time className="text-xs text-text-muted">
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
                "whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary",
                !grouped && "mt-0.5",
              )}
            >
              <FormattedText text={message.content} />
            </p>
          )
        )}

        {(message.attachments?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments!.map((a) => {
              const isImage = (a.content_type || "").startsWith("image/") ||
                /\.(png|jpe?g|gif|webp|avif)$/i.test(a.filename);
              return isImage ? (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpenAttachment(a)}
                  className="block overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.filename}
                    className="max-h-80 max-w-sm object-contain"
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

      <div className="absolute -top-3 right-2 hidden items-center gap-0.5 rounded-md border border-border bg-bg-elevated p-0.5 shadow-lg group-hover:flex">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className="rounded px-1 py-0.5 text-sm hover:bg-bg-hover"
            onClick={() => onReact(e)}
            title="Add reaction"
          >
            {e}
          </button>
        ))}
        <button
          type="button"
          className="rounded px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text"
          onClick={onReply}
        >
          Reply
        </button>
        {onPin && (
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text"
            onClick={onPin}
          >
            {message.pinned_at ? "Unpin" : "Pin"}
          </button>
        )}
        {onStartThread && (
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text"
            onClick={onStartThread}
          >
            Thread
          </button>
        )}
        {isOwn && (
          <>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-bg-hover hover:text-text"
              onClick={onStartEdit}
            >
              Edit
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-red-300 hover:bg-red-500/10"
              onClick={onDelete}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </li>
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
