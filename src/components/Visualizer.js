"use client";

import { useEffect, useRef } from "react";

export default function Visualizer({ tracking }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const bars = Array.from(el.querySelectorAll(".visualizer-bar"));

    const mouse = tracking.mouseSpeed || 0;
    const scroll = tracking.scrollVelocity || 0;
    const typing = tracking.typingBPM || 0;

    const base = 16 + mouse * 18;
    const scrollBoost = scroll * 24;
    const typingBoost = Math.min(typing / 2, 60);

    bars.forEach((bar, i) => {
      const phase = (i / bars.length) * Math.PI * 2;
      const height =
        base +
        Math.sin(phase + mouse) * 10 +
        scrollBoost * Math.cos(phase * 2) +
        typingBoost * Math.sin(phase * 3);
      bar.style.height = `${Math.max(8, Math.abs(height))}px`;
    });
  }, [tracking.mouseSpeed, tracking.scrollVelocity, tracking.typingBPM]);

  const barCount = 32;

  return (
    <div ref={containerRef} className="visualizer">
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className="visualizer-bar"
          style={{
            left: `${(i / barCount) * 100}%`
          }}
        />
      ))}
    </div>
  );
}
