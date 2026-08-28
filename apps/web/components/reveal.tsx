"use client";

import { useEffect } from "react";

/**
 * Reveals `[data-reveal]` blocks as they enter the viewport.
 *
 * Three things keep this from ever hiding content permanently:
 * the hidden state is applied here rather than in the stylesheet, so no
 * JavaScript means no hiding; anything already on screen at mount is revealed
 * without waiting for the observer; and a timer reveals whatever is left, which
 * covers renderers that never scroll, such as print and page capture.
 */
const SAFETY_MS = 2500;

export function Reveal() {
  useEffect(() => {
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    if (targets.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const reveal = (element: HTMLElement) => {
      element.dataset.revealed = "true";
    };

    const pending: HTMLElement[] = [];
    for (const target of targets) {
      if (target.getBoundingClientRect().top < window.innerHeight * 0.95) {
        continue;
      }
      target.dataset.revealReady = "true";
      pending.push(target);
    }
    if (pending.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    for (const target of pending) observer.observe(target);

    const safety = window.setTimeout(() => {
      for (const target of pending) reveal(target);
      observer.disconnect();
    }, SAFETY_MS);

    return () => {
      window.clearTimeout(safety);
      observer.disconnect();
    };
  }, []);

  return null;
}
