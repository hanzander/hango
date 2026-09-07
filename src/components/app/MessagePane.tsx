"use client";

import type { Message } from "@/lib/types";
import { formatMessageTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";

type MessagePaneProps = {
  channelName: string;
  messages: Message[];
  loading?: boolean;
};

export function MessagePane({
  channelName,
  messages,
  loading,
}: MessagePaneProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-chat">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="text-text-muted">#</span>
        <h1 className="text-sm font-semibold tracking-tight text-text">
          {channelName}
        </h1>
      </header>

      <div className="hango-scroll flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
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
          <ul className="space-y-4">
            {messages.map((message) => {
              const name = message.author?.display_name ?? "Unknown";
              return (
                <li key={message.id} className="group flex gap-3">
                  <Avatar name={name} src={message.author?.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-text">
                        {name}
                      </span>
                      <time className="text-xs text-text-muted">
                        {formatMessageTime(message.created_at)}
                      </time>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">
                      {message.content}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
