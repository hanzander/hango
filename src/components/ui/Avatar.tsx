import { cn, initials } from "@/lib/utils";
import { useState } from "react";

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizes = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-10 w-10 text-sm",
  xl: "h-20 w-20 text-xl",
};

export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(src) && !failed;

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src!}
        alt=""
        onError={() => setFailed(true)}
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-white/10",
          sizes[size],
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 text-zinc-200 ring-1 ring-white/10",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {initials(name) || "?"}
    </div>
  );
}
