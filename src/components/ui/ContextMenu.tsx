"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ContextMenuItem = {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  items: ContextMenuItem[];
} | null;

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>(null);
  function open(e: React.MouseEvent, items: ContextMenuItem[]) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }
  function close() {
    setMenu(null);
  }
  return { menu, open, close, setMenu };
}

export function ContextMenuPortal({
  menu,
  onClose,
}: {
  menu: ContextMenuState;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, onClose]);

  if (!menu) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[90]"
        aria-label="Close menu"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed z-[91] min-w-[180px] overflow-hidden rounded-lg border border-border bg-bg-elevated py-1 shadow-2xl"
        style={{ left: menu.x, top: menu.y }}
      >
        {menu.items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            className={cn(
              "block w-full px-3 py-1.5 text-left text-xs hover:bg-bg-hover disabled:opacity-40",
              item.danger
                ? "text-red-300 hover:text-red-200"
                : "text-text-secondary hover:text-text",
            )}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
