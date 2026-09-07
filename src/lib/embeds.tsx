"use client";

import { useEffect, useState } from "react";
import type { MessageEmbed } from "@/lib/types";

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,);]+$/, "")))].slice(
    0,
    3,
  );
}

export function LinkEmbedCard({ embed }: { embed: MessageEmbed }) {
  if (!embed?.url) return null;
  return (
    <a
      href={embed.url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 block max-w-md overflow-hidden rounded-lg border border-border bg-bg-elevated hover:border-text-muted"
    >
      {embed.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={embed.image}
          alt=""
          className="max-h-48 w-full object-cover"
        />
      )}
      <div className="space-y-0.5 px-3 py-2">
        {embed.site && (
          <p className="text-[10px] uppercase tracking-wide text-text-muted">
            {embed.site}
          </p>
        )}
        {embed.title && (
          <p className="text-sm font-medium text-accent">{embed.title}</p>
        )}
        {embed.description && (
          <p className="line-clamp-3 text-xs text-text-secondary">
            {embed.description}
          </p>
        )}
      </div>
    </a>
  );
}

export function useFetchEmbed(url: string | null) {
  const [embed, setEmbed] = useState<MessageEmbed | null>(null);
  useEffect(() => {
    if (!url) {
      setEmbed(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/embed?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.url) setEmbed(data as MessageEmbed);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return embed;
}
