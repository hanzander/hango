const STORAGE_KEY = "hango-remembered-emails";
const MAX_ACCOUNTS = 8;

export function loadRememberedEmails(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is string => typeof e === "string" && e.includes("@"))
      .map((e) => e.trim().toLowerCase())
      .slice(0, MAX_ACCOUNTS);
  } catch {
    return [];
  }
}

export function rememberEmail(email: string) {
  if (typeof window === "undefined") return;
  const clean = email.trim().toLowerCase();
  if (!clean.includes("@")) return;
  try {
    const next = [
      clean,
      ...loadRememberedEmails().filter((e) => e !== clean),
    ].slice(0, MAX_ACCOUNTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function forgetEmail(email: string) {
  if (typeof window === "undefined") return;
  const clean = email.trim().toLowerCase();
  try {
    const next = loadRememberedEmails().filter((e) => e !== clean);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
