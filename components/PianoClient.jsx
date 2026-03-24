'use client';

import { useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import Keyboard from './Keyboard';

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function midiToNote(m) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(m / 12) - 1;
  const name = noteNames[m % 12];
  return `${name}${octave}`;
}

export default function PianoClient({ room }) {
  const pcMapRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const dcMapRef = useRef(new Map()); // peerId -> DataChannel
  const synthRef = useRef(null);
  const [peers, setPeers] = useState([]);
  const clientIdRef = useRef(`p-${Math.random().toString(36).slice(2,9)}`);
  const pollingRef = useRef(null);

  useEffect(() => {
    (async () => {
      await Tone.start();
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 }
      }).toDestination();

      // announce presence and get existing peers
      const res = await fetch(`/api/rooms/${room}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'announce', peerId: clientIdRef.current })
      });
      const data = await res.json();
      const others = data.peers || [];
      setPeers(others);

      // create offers to existing peers
      for (const other of others) {
        await createOfferToPeer(other);
      }

      // start polling for incoming signaling messages
      pollingRef.current = setInterval(pollSignaling, 800);
    })();

    return () => {
      clearInterval(pollingRef.current);
      // close connections
      pcMapRef.current.forEach(pc => pc.close());
      synthRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  async function pollSignaling() {
    try {
      const res = await fetch(`/api/rooms/${room}?peerId=${clientIdRef.current}`);
      if (!res.ok) return;
      const { offers, answers, candidates } = await res.json();

      // handle offers: create answer
      for (const o of offers) {
        const from = o.from;
        const sdp = o.sdp;
        if (pcMapRef.current.has(from)) continue; // already connected
        await handleIncomingOffer(from, sdp);
      }

      // handle answers: set remote description
      for (const a of answers) {
        const from = a.from;
        const sdp = a.sdp;
        const pc = pcMapRef.current.get(from);
        if (!pc) continue;
        await pc.setRemoteDescription({ type: 'answer', sdp });
      }

      // handle candidates
      for (const c of candidates) {
        const from = c.from;
        const candidate = c.candidate;
        const pc = pcMapRef.current.get(from);
        if (!pc) continue;
        try { await pc.addIceCandidate(candidate); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      // polling errors are non-fatal
      console.warn('poll error', err);
    }
  }

  async function createOfferToPeer(targetPeerId) {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcMapRef.current.set(targetPeerId, pc);

    // create data channel
    const dc = pc.createDataChannel('piano');
    setupDataChannel(targetPeerId, dc);
    dcMapRef.current.set(targetPeerId, dc);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        // send candidate to target
        fetch(`/api/rooms/${room}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ice', peerId: clientIdRef.current, target: targetPeerId, payload: { candidate: ev.candidate } })
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        pc.close();
        pcMapRef.current.delete(targetPeerId);
        dcMapRef.current.delete(targetPeerId);
        setPeers(prev => prev.filter(p => p !== targetPeerId));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // send offer to target
    await fetch(`/api/rooms/${room}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'offer', peerId: clientIdRef.current, target: targetPeerId, payload: { sdp: offer.sdp } })
    });
  }

  function setupDataChannel(peerId, dc) {
    dc.onopen = () => {
      console.log('DC open', peerId);
      setPeers(prev => {
        if (!prev.includes(peerId)) return [...prev, peerId];
        return prev;
      });
    };
    dc.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        handleRemoteEvent(msg);
      } catch (e) { /* ignore */ }
    };
    dc.onclose = () => {
      console.log('DC closed', peerId);
      setPeers(prev => prev.filter(p => p !== peerId));
    };
  }

  async function handleIncomingOffer(from, sdp) {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcMapRef.current.set(from, pc);

    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      dcMapRef.current.set(from, dc);
      setupDataChannel(from, dc);
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        fetch(`/api/rooms/${room}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ice', peerId: clientIdRef.current, target: from, payload: { candidate: ev.candidate } })
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        pc.close();
        pcMapRef.current.delete(from);
        dcMapRef.current.delete(from);
        setPeers(prev => prev.filter(p => p !== from));
      }
    };

    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // send answer back
    await fetch(`/api/rooms/${room}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'answer', peerId: clientIdRef.current, target: from, payload: { sdp: answer.sdp } })
    });
  }

  function broadcast(obj) {
    const str = JSON.stringify(obj);
    dcMapRef.current.forEach(dc => {
      if (dc.readyState === 'open') {
        try { dc.send(str); } catch (e) { /* ignore */ }
      }
    });
  }

  function handleRemoteEvent(e) {
    // e: { type, midi, velocity, ts, clientId }
    const { type, midi, velocity = 0.9, ts } = e;
    const note = midiToNote(midi);
    const now = Date.now();
    const latency = Math.max(0, now - (ts || now));
    const scheduleTime = Tone.now() + Math.max(0.02, latency / 1000);
    if (type === 'note_on') synthRef.current.triggerAttack(note, scheduleTime, velocity);
    if (type === 'note_off') synthRef.current.triggerRelease(note, scheduleTime);
  }

  function handleLocalNote(type, midi, velocity = 0.95) {
    const ts = Date.now();
    const event = { type, midi, velocity, ts, clientId: clientIdRef.current };
    // play locally immediately
    const note = midiToNote(midi);
    if (type === 'note_on') synthRef.current.triggerAttack(note, Tone.now(), velocity);
    if (type === 'note_off') synthRef.current.triggerRelease(note, Tone.now());
    // broadcast to peers
    broadcast(event);
  }

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <strong>Client</strong>: <span style={{ color: '#0f172a' }}>{clientIdRef.current}</span>
        <span style={{ marginLeft: 12, color: '#6b7280' }}>peers: {peers.length}</span>
      </div>
      <Keyboard onPlay={(midi) => handleLocalNote('note_on', midi)} onRelease={(midi) => handleLocalNote('note_off', midi)} />
      <div style={{ marginTop: 12, color: '#6b7280' }}>
        Note: signaling uses HTTP polling. For production, use a persistent signaling server.
      </div>
    </div>
  );
}
