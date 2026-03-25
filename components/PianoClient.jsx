'use client';

import { useEffect, useRef, useState } from 'react';
import Keyboard from './Keyboard';
import { loadTone } from '@/app/tone/loadTone';

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function midiToNote(m) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(m / 12) - 1;
  const name = noteNames[m % 12];
  return `${name}${octave}`;
}

export default function PianoClient({ room }) {
  const pcMapRef = useRef(new Map());
  const dcMapRef = useRef(new Map());
  const synthRef = useRef(null);
  const ToneRef = useRef(null); // dynamic Tone.js

  const [peers, setPeers] = useState([]);
  const clientIdRef = useRef(`p-${Math.random().toString(36).slice(2, 9)}`);
  const pollingRef = useRef(null);
  const isMountedRef = useRef(true);

  const [audioReady, setAudioReady] = useState(false);
  const [initialized, setInitialized] = useState(false);

  async function loadTone() {
  if (!ToneRef.current) {
    const mod = await import("tone");

    const Tone =
      mod.Tone?.start ? mod.Tone :
      mod.default?.start ? mod.default :
      mod;

    ToneRef.current = Tone;
  }
  return ToneRef.current;
}



  async function initAudio() {
  console.log("Button clicked — loading Tone…");

  const Tone = await loadTone();

  await Tone.start();
  console.log("Tone started:", Tone.context.state);

  synthRef.current = new Tone.PolySynth(Tone.Synth).toDestination();
  setAudioReady(true);
}



  useEffect(() => {
    if (!audioReady || initialized) return;
    setInitialized(true);

    isMountedRef.current = true;

    (async () => {
      try {
        const announceRes = await fetch(`/api/rooms/${room}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'announce', peerId: clientIdRef.current })
        });

        const announceData = await announceRes.json();
        const others = Array.isArray(announceData.peers) ? announceData.peers : [];

        for (const other of others) {
          if (!pcMapRef.current.has(other)) {
            await createOfferToPeer(other);
          }
        }

        setPeers(others);
      } catch (err) {
        console.warn('announce failed', err);
      }

      pollingRef.current = setInterval(() => {
        if (isMountedRef.current) pollSignaling().catch(e => console.warn('poll error', e));
      }, 800);
    })();

    return () => {
      isMountedRef.current = false;
      clearInterval(pollingRef.current);

      try {
        fetch(`/api/rooms/${room}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'leave', peerId: clientIdRef.current })
        });
      } catch {}

      pcMapRef.current.forEach(pc => {
        try { pc.close(); } catch {}
      });
    };
  }, [audioReady, initialized, room]);

  async function pollSignaling() {
    try {
      const res = await fetch(`/api/rooms/${room}?peerId=${clientIdRef.current}`);
      if (!res.ok) return;

      const { offers = [], answers = [], candidates = [] } = await res.json();

      for (const o of offers) {
        if (!o.from || !o.sdp) continue;
        if (pcMapRef.current.has(o.from)) continue;
        await handleIncomingOffer(o.from, o.sdp);
      }

      for (const a of answers) {
        const pc = pcMapRef.current.get(a.from);
        if (!pc || !a.sdp) continue;
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: a.sdp });
        } catch (e) {
          console.warn('setRemoteDescription(answer) failed', e);
        }
      }

      for (const c of candidates) {
        const pc = pcMapRef.current.get(c.from);
        if (!pc || !c.candidate) continue;
        try {
          await pc.addIceCandidate(c.candidate);
        } catch {}
      }
    } catch (err) {
      console.warn('pollSignaling error', err);
    }
  }

  async function createOfferToPeer(targetPeerId) {
    if (pcMapRef.current.has(targetPeerId)) return;

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcMapRef.current.set(targetPeerId, pc);

    const dc = pc.createDataChannel('piano');
    setupDataChannel(targetPeerId, dc);
    dcMapRef.current.set(targetPeerId, dc);

    pc.onicecandidate = ev => {
      if (ev.candidate) {
        fetch(`/api/rooms/${room}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ice',
            peerId: clientIdRef.current,
            target: targetPeerId,
            payload: { candidate: ev.candidate }
          })
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        pcMapRef.current.delete(targetPeerId);
        dcMapRef.current.delete(targetPeerId);
        setPeers(prev => prev.filter(p => p !== targetPeerId));
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await fetch(`/api/rooms/${room}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'offer',
          peerId: clientIdRef.current,
          target: targetPeerId,
          payload: { sdp: offer.sdp }
        })
      });
    } catch (e) {
      console.warn('createOfferToPeer failed', e);
    }
  }

  function setupDataChannel(peerId, dc) {
    dc.onopen = () => {
      setPeers(prev => prev.includes(peerId) ? prev : [...prev, peerId]);
    };

    dc.onmessage = ev => {
      try {
        const msg = JSON.parse(ev.data);
        handleRemoteEvent(msg);
      } catch {}
    };

    dc.onclose = () => {
      setPeers(prev => prev.filter(p => p !== peerId));
    };
  }

  async function handleIncomingOffer(from, sdp) {
    if (pcMapRef.current.has(from)) return;

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcMapRef.current.set(from, pc);

    pc.ondatachannel = ev => {
      const dc = ev.channel;
      dcMapRef.current.set(from, dc);
      setupDataChannel(from, dc);
    };

    pc.onicecandidate = ev => {
      if (ev.candidate) {
        fetch(`/api/rooms/${room}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ice',
            peerId: clientIdRef.current,
            target: from,
            payload: { candidate: ev.candidate }
          })
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        pcMapRef.current.delete(from);
        dcMapRef.current.delete(from);
        setPeers(prev => prev.filter(p => p !== from));
      }
    };

    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch(`/api/rooms/${room}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'answer',
          peerId: clientIdRef.current,
          target: from,
          payload: { sdp: answer.sdp }
        })
      });
    } catch (e) {
      console.warn('handleIncomingOffer failed', e);
    }
  }

  function broadcast(obj) {
    const str = JSON.stringify(obj);
    dcMapRef.current.forEach(dc => {
      if (dc.readyState === 'open') {
        try { dc.send(str); } catch {}
      }
    });
  }

  function handleRemoteEvent(e) {
    const { type, midi, velocity = 0.9 } = e || {};
    if (!type || typeof midi !== 'number' || !synthRef.current) return;

    const note = midiToNote(midi);
    const scheduleTime = ToneRef.current.now() + 0.03;

    if (type === 'note_on') synthRef.current.triggerAttack(note, scheduleTime, velocity);
    if (type === 'note_off') synthRef.current.triggerRelease(note, scheduleTime);
  }

  function handleLocalNote(type, midi, velocity = 0.95) {
    if (!synthRef.current) return;

    const note = midiToNote(midi);
    const ts = Date.now();

    console.log("LOCAL NOTE:", type, midi);

    if (type === 'note_on') synthRef.current.triggerAttack(note);
    if (type === 'note_off') synthRef.current.triggerRelease(note);

    broadcast({ type, midi, velocity, ts, clientId: clientIdRef.current });
  }

  if (!audioReady) {
    return (
      <div>
        <button
          onClick={initAudio}
          style={{
            padding: '12px 20px',
            background: '#111827',
            color: 'white',
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          Click to enable audio
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <strong>Client</strong>:{' '}
        <span style={{ color: '#0f172a' }}>{clientIdRef.current}</span>
        <span style={{ marginLeft: 12, color: '#6b7280' }}>peers: {peers.length}</span>
      </div>

      <Keyboard
        onPlay={midi => handleLocalNote('note_on', midi)}
        onRelease={midi => handleLocalNote('note_off', midi)}
      />

      <div style={{ marginTop: 12, color: '#6b7280' }}>
        Note: signaling uses HTTP polling. For production, use a persistent signaling server or WebSocket.
      </div>
    </div>
  );
}
