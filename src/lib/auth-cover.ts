const COVER_CLASS = "hango-auth-covering";
const COVER_KIND_KEY = "hango-auth-cover-kind";

export type AuthCoverKind = "welcome" | "welcome-new" | "goodbye";

/** Solid veil that survives React route unmounts so the previous screen never flashes. */
export function armAuthCover(kind?: AuthCoverKind) {
  if (typeof document === "undefined") return;
  try {
    if (kind) sessionStorage.setItem(COVER_KIND_KEY, kind);
  } catch {
    /* ignore */
  }
  document.documentElement.classList.add(COVER_CLASS);
}

export function clearAuthCover() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove(COVER_CLASS);
  try {
    sessionStorage.removeItem(COVER_KIND_KEY);
  } catch {
    /* ignore */
  }
}

export function peekAuthCoverKind(): AuthCoverKind | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(COVER_KIND_KEY);
    if (v === "welcome" || v === "welcome-new" || v === "goodbye") return v;
  } catch {
    /* ignore */
  }
  return null;
}
