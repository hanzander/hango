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
      const d = localStorage.getItem("hango-density");
      if (t === "light" || t === "dark") setThemeState(t);
      if (d === "compact" || d === "cozy") setDensityState(d);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    try {
      localStorage.setItem("hango-theme", theme);
      localStorage.setItem("hango-density", density);
    } catch {
      /* ignore */
    }
  }, [theme, density]);

  const setTheme = useCallback((t: ThemeMode) => setThemeState(t), []);
  const setDensity = useCallback((d: Density) => setDensityState(d), []);

  const value = useMemo(
    () => ({ theme, density, setTheme, setDensity }),
    [theme, density, setTheme, setDensity],
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
