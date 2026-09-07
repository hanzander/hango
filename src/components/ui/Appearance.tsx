"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ThemeMode = "dark" | "light";
type Density = "cozy" | "compact";

type AppearanceValue = {
  theme: ThemeMode;
  density: Density;
  setTheme: (t: ThemeMode) => void;
  setDensity: (d: Density) => void;
};

const AppearanceContext = createContext<AppearanceValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");
  const [density, setDensityState] = useState<Density>("cozy");

  useEffect(() => {
    try {
      const t = localStorage.getItem("hango-theme");
      if (t === "light" || t === "dark") setThemeState(t);
    } catch {
      /* ignore */
    }
    // Always cozy — compact layout toggle removed
    setDensityState("cozy");
    try {
      localStorage.setItem("hango-density", "cozy");
      localStorage.removeItem("hango-compact");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = "cozy";
    try {
      localStorage.setItem("hango-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: ThemeMode) => setThemeState(t), []);
  const setDensity = useCallback((_d: Density) => {
    setDensityState("cozy");
  }, []);

  const value = useMemo(
    () => ({ theme, density: "cozy" as const, setTheme, setDensity }),
    [theme, setTheme, setDensity],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    return {
      theme: "dark" as const,
      density: "cozy" as const,
      setTheme: () => {},
      setDensity: () => {},
    };
  }
  return ctx;
}
