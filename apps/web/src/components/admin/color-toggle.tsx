"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { useAdminI18n } from "./ui";

type Color = "light" | "dark";
const KEY = "fabulka.admin.color";

// The choice lives in localStorage; a private window keeps it in memory for the visit.
let memory: Color = "light";
const listeners = new Set<() => void>();

function stored(): Color {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return memory;
  }
}

function store(color: Color) {
  memory = color;
  try {
    localStorage.setItem(KEY, color);
  } catch {
    // Private mode: memory above keeps it for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The admin's light/dark switch, next to its language. The choice is kept in this browser and set on
 * <html data-color> while the admin is open (globals.css carries the dark palette); leaving the
 * admin hands the site back to the visitor's system setting.
 */
export function ColorToggle() {
  const { t } = useAdminI18n();
  const color = useSyncExternalStore(subscribe, stored, () => "light" as Color);

  useEffect(() => {
    document.documentElement.dataset.color = color;
    return () => {
      delete document.documentElement.dataset.color;
    };
  }, [color]);

  const next: Color = color === "dark" ? "light" : "dark";
  const pick = () => store(next);

  return (
    <button
      type="button"
      data-testid="admin-color"
      data-color={color}
      aria-pressed={color === "dark"}
      aria-label={t(next === "dark" ? "admin.color.dark" : "admin.color.light")}
      onClick={pick}
      className="flex size-9 items-center justify-center rounded-xl border border-border text-muted hover:border-accent hover:text-foreground"
    >
      {color === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
