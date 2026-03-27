"use client";

export default function TrackerPanel({ tracking }) {
  return (
    <aside className="panel">
      <h2>What We're Tracking</h2>
      <p>
        <strong>Time of Day:</strong> {tracking.time || "—"}
      </p>
      <p>
        <strong>Mouse Speed:</strong> {tracking.mouseSpeed.toFixed(2)}
      </p>
      <p>
        <strong>Scroll Velocity:</strong> {tracking.scrollVelocity.toFixed(2)}
      </p>
      <p>
        <strong>Typing BPM:</strong> {tracking.typingBPM || 0}
      </p>
      <p>
        <strong>Color Scheme:</strong> {tracking.colorScheme}
      </p>
      <p>
        <strong>Window Size:</strong>{" "}
        {tracking.windowSize.w} × {tracking.windowSize.h}
      </p>

      <hr
        style={{
          margin: "0.75rem 0",
          borderColor: "rgba(148,163,184,0.4)"
        }}
      />

      <p style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
        These values shape tempo, drum density, bass movement, pad brightness, arp speed,
        stereo width, and whether the harmony leans more major or minor. Everything stays
        in your browser—no external APIs, no audio files, no data sent anywhere.
      </p>
    </aside>
  );
}
