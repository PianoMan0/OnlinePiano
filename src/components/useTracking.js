"use client";

import { useEffect, useState } from "react";

export default function useTracking() {
  const [tracking, setTracking] = useState({
    time: "",
    mouseSpeed: 0,
    scrollVelocity: 0,
    typingBPM: 0,
    colorScheme: "unknown",
    windowSize: { w: 0, h: 0 }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    let lastScrollY = window.scrollY;
    let lastTypeTime = 0;
    let typeIntervals = [];
    let scrollTimeout = null;
    let mouseTimeout = null;

    const colorMedia = window.matchMedia("(prefers-color-scheme: dark)");

    const updateBase = () => {
      setTracking(t => ({
        ...t,
        time: new Date().toLocaleTimeString(),
        colorScheme: colorMedia.matches ? "dark" : "light",
        windowSize: { w: window.innerWidth, h: window.innerHeight }
      }));
    };

    updateBase();

    const timeInterval = setInterval(() => {
      setTracking(t => ({
        ...t,
        time: new Date().toLocaleTimeString()
      }));
    }, 1000);

    const onMouseMove = e => {
      const speed = Math.abs(e.movementX) + Math.abs(e.movementY);
      const normalized = Math.min(speed / 50, 5);
      setTracking(t => ({ ...t, mouseSpeed: normalized }));

      if (mouseTimeout) clearTimeout(mouseTimeout);
      mouseTimeout = setTimeout(() => {
        setTracking(t => ({ ...t, mouseSpeed: 0 }));
      }, 300);
    };

    const onScroll = () => {
      const delta = Math.abs(window.scrollY - lastScrollY);
      lastScrollY = window.scrollY;
      const normalized = Math.min(delta / 100, 5);
      setTracking(t => ({ ...t, scrollVelocity: normalized }));

      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setTracking(t => ({ ...t, scrollVelocity: 0 }));
      }, 300);
    };

    const onKeyDown = () => {
      const now = performance.now();
      if (lastTypeTime) {
        const interval = now - lastTypeTime;
        typeIntervals.push(interval);
        if (typeIntervals.length > 8) typeIntervals.shift();
        const avg = typeIntervals.reduce((a, b) => a + b, 0) / typeIntervals.length;
        const bpm = Math.max(0, Math.min(60000 / avg, 240));
        setTracking(t => ({ ...t, typingBPM: Math.round(bpm) || 0 }));
      }
      lastTypeTime = now;
    };

    const onResize = () => {
      setTracking(t => ({
        ...t,
        windowSize: { w: window.innerWidth, h: window.innerHeight }
      }));
    };

    const onColorChange = () => {
      setTracking(t => ({
        ...t,
        colorScheme: colorMedia.matches ? "dark" : "light"
      }));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("scroll", onScroll);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    colorMedia.addEventListener("change", onColorChange);

    return () => {
      clearInterval(timeInterval);
      if (mouseTimeout) clearTimeout(mouseTimeout);
      if (scrollTimeout) clearTimeout(scrollTimeout);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      colorMedia.removeEventListener("change", onColorChange);
    };
  }, []);

  return tracking;
}
