"use client";

import "./globals.css";
import SynthEngine from "./components/SynthEngine";
import useTracking from "./components/useTracking";
import TrackerPanel from "./components/TrackerPanel";
import Visualizer from "./components/Visualizer";

export default function Home() {
  const tracking = useTracking();

  return (
    <main>
      <div className="app-container">
        <section className="engine">
          <h1 className="engine-title">Infinite Remix Engine – Dreamwave</h1>
          <p className="engine-subtitle">
            A fully code-generated synthwave soundtrack that reacts to your time, movement,
            scrolling, typing, theme, and screen size. No samples. No APIs. Just your browser
            as a living instrument.
          </p>
          <SynthEngine tracking={tracking} />
          <Visualizer tracking={tracking} />
        </section>

        <TrackerPanel tracking={tracking} />
      </div>
    </main>
  );
}
