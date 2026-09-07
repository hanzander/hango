"use client";

import { useEffect, useState } from "react";

type LightboxProps = {
  src: string | null;
  alt?: string;
  onClose: () => void;
};

export function Lightbox({ src, alt, onClose }: LightboxProps) {
  useEffect(() => {
    if (!src) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close"
        onClick={onClose}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || "Attachment"}
        className="relative z-10 max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-md bg-black/50 px-3 py-1.5 text-sm text-white"
      >
        Close
      </button>
    </div>
  );
}

export function useLightbox() {
  const [src, setSrc] = useState<string | null>(null);
  const [alt, setAlt] = useState<string>("");
  return {
    open: (url: string, name?: string) => {
      setSrc(url);
      setAlt(name || "");
    },
    close: () => setSrc(null),
    props: { src, alt, onClose: () => setSrc(null) } as LightboxProps,
  };
}
