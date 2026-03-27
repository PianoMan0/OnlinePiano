"use client";

import { useEffect, useRef, useState } from "react";

export default function SynthEngine({ tracking }) {
  const audioCtxRef = useRef(null);
  const isStartedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const drumIntervalRef = useRef(null);
  const hatIntervalRef = useRef(null);
  const bassStepRef = useRef(0);
  const bassIntervalRef = useRef(null);
  const padNodesRef = useRef([]);
  const arpIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      stopEngine();
    };
  }, []);

  const getTempo = () => {
    // Upbeat nostalgic: 110–125 BPM based on time of day
    const hour = new Date().getHours();
    const base = 110;
    const range = 15;
    return base + (hour / 24) * range;
  };

  const getScale = () => {
    const isDark = tracking.colorScheme === "dark";
    // C major / C minor
    const root = 48; // C3
    const major = [0, 2, 4, 5, 7, 9, 11];
    const minor = [0, 2, 3, 5, 7, 8, 10];
    return { root, degrees: isDark ? minor : major };
  };

  const getChords = () => {
    const { root, degrees } = getScale();
    // Simple I–V–vi–IV-ish progression mapped to scale degrees
    const prog = [
      [0, 4, 6], // I-ish
      [4, 6, 1], // V-ish
      [5, 1, 3], // vi-ish
      [3, 5, 0]  // IV-ish
    ];
    return prog.map(chordDegrees =>
      chordDegrees.map(d => root + degrees[d % degrees.length])
    );
  };

  const noteToFreq = midi => 440 * Math.pow(2, (midi - 69) / 12);

  const createKick = ctx => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    const now = ctx.currentTime;

    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);

    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  };

  const createSnare = ctx => {
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    filter.Q.value = 1;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.25);
  };

  const createHat = ctx => {
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.1);
  };

  const startDrums = ctx => {
    const tempo = getTempo();
    const beatDur = 60 / tempo;

    drumIntervalRef.current = setInterval(() => {
      createKick(ctx);
      // Simple backbeat snare
      setTimeout(() => createSnare(ctx), beatDur * 1000 * 1);
      setTimeout(() => createSnare(ctx), beatDur * 1000 * 3);
    }, beatDur * 4 * 1000);

    const hatBaseRate = 2; // 8ths
    hatIntervalRef.current = setInterval(() => {
      const density = 1 + tracking.scrollVelocity * 2;
      for (let i = 0; i < density; i++) {
        setTimeout(() => createHat(ctx), (i * 40));
      }
    }, (beatDur * 1000) / hatBaseRate);
  };

  const startBass = ctx => {
    const tempo = getTempo();
    const stepDur = (60 / tempo) / 2; // 8th notes
    const { root, degrees } = getScale();

    const pattern = [0, 0, 4, 4, 5, 5, 3, 3, 0, 0, 4, 4, 5, 3, 4, 0];

    bassIntervalRef.current = setInterval(() => {
      const step = bassStepRef.current % pattern.length;
      bassStepRef.current++;

      const degree = degrees[pattern[step] % degrees.length];
      const note = root - 12 + degree; // lower octave
      const freq = noteToFreq(note);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "square";
      osc.frequency.value = freq;

      filter.type = "lowpass";
      const baseCutoff = 200 + tracking.mouseSpeed * 200;
      filter.frequency.value = baseCutoff;

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + stepDur * 0.9);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + stepDur);
    }, stepDur * 1000);
  };

  const startPads = ctx => {
    stopPads();

    const chords = getChords();
    const tempo = getTempo();
    const chordDur = (60 / tempo) * 8; // 8 beats per chord

    const createPadChord = (notes, startTime) => {
      const padNodes = [];
      const now = ctx.currentTime;
      const start = now + startTime;

      notes.forEach((note, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = "sawtooth";
        const detuneCents = (-10 + i * 10) + (Math.random() * 4 - 2);
        osc.frequency.value = noteToFreq(note);
        osc.detune.value = detuneCents;

        filter.type = "lowpass";
        const baseCutoff = 1200 + tracking.mouseSpeed * 400;
        filter.frequency.setValueAtTime(baseCutoff, start);

        gain.gain.setValueAtTime(0.0, start);
        gain.gain.linearRampToValueAtTime(0.4, start + 1.5);
        gain.gain.linearRampToValueAtTime(0.3, start + chordDur - 1.5);
        gain.gain.linearRampToValueAtTime(0.001, start + chordDur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(start + chordDur + 0.5);

        padNodes.push({ osc, gain, filter });
      });

      padNodesRef.current.push(...padNodes);
    };

    chords.forEach((chord, idx) => {
      createPadChord(chord, idx * chordDur);
    });

    // Schedule next batch of chords
    setTimeout(() => {
      if (isStartedRef.current) startPads(ctx);
    }, chords.length * chordDur * 1000);
  };

  const stopPads = () => {
    padNodesRef.current.forEach(node => {
      try {
        node.osc.stop();
      } catch (_) {}
    });
    padNodesRef.current = [];
  };

  const startArp = ctx => {
    const tempo = getTempo();
    const baseStep = (60 / tempo) / 4; // 16ths base

    const chords = getChords();
    let chordIndex = 0;
    let stepIndex = 0;

    const runArp = () => {
      if (!isStartedRef.current) return;

      const typingFactor = tracking.typingBPM
        ? Math.min(Math.max(tracking.typingBPM / 120, 0.5), 2)
        : 1;

      const stepDur = baseStep / typingFactor;

      const chord = chords[chordIndex % chords.length];
      const note = chord[stepIndex % chord.length] + 12; // one octave up
      stepIndex++;

      if (stepIndex % 8 === 0) {
        chordIndex++;
      }

      const freq = noteToFreq(note);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const panner = ctx.createStereoPanner
        ? ctx.createStereoPanner()
        : null;

      osc.type = "sawtooth";
      osc.frequency.value = freq;

      filter.type = "lowpass";
      const baseCutoff = 1500 + tracking.mouseSpeed * 800;
      filter.frequency.value = baseCutoff;

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + stepDur * 0.9);

      let panNode = filter;
      if (panner) {
        const widthFactor =
          tracking.windowSize.w > 0
            ? Math.max(-1, Math.min(1, (tracking.windowSize.w - 800) / 800))
            : 0;
        panner.pan.value = widthFactor * 0.6;
        filter.connect(panner);
        panNode = panner;
      }

      osc.connect(filter);
      panNode.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + stepDur);

      arpIntervalRef.current = setTimeout(runArp, stepDur * 1000);
    };

    runArp();
  };

  const stopArp = () => {
    if (arpIntervalRef.current) {
      clearTimeout(arpIntervalRef.current);
      arpIntervalRef.current = null;
    }
  };

  const startEngine = async () => {
    if (isStartedRef.current) return;
    if (typeof window === "undefined") return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;
    isStartedRef.current = true;

    startDrums(ctx);
    startBass(ctx);
    startPads(ctx);
    startArp(ctx);

    setIsPlaying(true);
  };

  const stopEngine = () => {
    isStartedRef.current = false;

    if (drumIntervalRef.current) {
      clearInterval(drumIntervalRef.current);
      drumIntervalRef.current = null;
    }
    if (hatIntervalRef.current) {
      clearInterval(hatIntervalRef.current);
      hatIntervalRef.current = null;
    }
    if (bassIntervalRef.current) {
      clearInterval(bassIntervalRef.current);
      bassIntervalRef.current = null;
    }
    stopPads();
    stopArp();

    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    setIsPlaying(false);
  };

  const toggle = () => {
    if (isPlaying) {
      stopEngine();
    } else {
      startEngine();
    }
  };

  return (
    <div>
      <div className="engine-controls">
        <button
          className={`engine-button ${isPlaying ? "stop" : ""}`}
          onClick={toggle}
        >
          {isPlaying ? "Stop Remix" : "Play Remix"}
        </button>
        <span className="engine-status">
          {isPlaying
            ? "Generating a live Dreamwave remix from your behavior."
            : "Press play to turn your browser into a Dreamwave synth."}
        </span>
      </div>
    </div>
  );
}
