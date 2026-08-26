"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerTheme(): Theme {
  return "dark";
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("verdict-theme-change", onStoreChange);
  return () => window.removeEventListener("verdict-theme-change", onStoreChange);
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);

  function toggleTheme() {
    const nextTheme: Theme = getTheme() === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem("verdict-theme", nextTheme);
    window.dispatchEvent(new Event("verdict-theme-change"));
  }

  const isDark = theme === "dark";

  return (
    <button
      aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
      className="theme-toggle"
      onClick={toggleTheme}
      type="button"
    >
      {isDark ? (
        <Sun aria-hidden="true" size={17} weight="regular" />
      ) : (
        <Moon aria-hidden="true" size={17} weight="regular" />
      )}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
