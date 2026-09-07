"use client";

import { useEffect, useState } from "react";

type GifResult = {
  id: string;
  title: string;
  url: string;
  preview: string;
};

type GifPickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (gif: { url: string; title: string }) => void;
};

export function GifPicker({ open, onClose, onPick }: GifPickerProps) {
  const [q, setQ] = useState("reaction");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      fetch(`/api/gifs?q=${encodeURIComponent(q || "happy")}`)
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setResults((data.results as GifResult[]) ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open]);

  if (!open) return null;

  return (
    <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(100%,360px)] overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Tenor"
          className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
          autoFocus
        />
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-text-muted hover:text-text"
        >
          Esc
        </button>
      </div>
      <div className="hango-scroll grid max-h-64 grid-cols-3 gap-1 overflow-y-auto p-2">
        {loading && (
          <p className="col-span-3 py-6 text-center text-xs text-text-muted">
            Searching…
          </p>
        )}
        {!loading && results.length === 0 && (
          <p className="col-span-3 py-6 text-center text-xs text-text-muted">
            No GIFs
          </p>
        )}
        {results.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              onPick({ url: g.url, title: g.title });
              onClose();
            }}
            className="aspect-square overflow-hidden rounded-md bg-bg hover:ring-2 hover:ring-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.preview || g.url} alt={g.title} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
