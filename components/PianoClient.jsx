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
  const clientIdRef = useRef(`p-${Math.random().toString(36).slice(2, 9)}`);
  const pollingRef = useRef(null);
  const isMountedRef = useRef(true);

  const [audioReady, setAudioReady] = useState(false);
  const [initialized, setInitialized] = useState(false);

  async function initAudio() {
    try {
      await Tone.start();
      synthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 }
      }).toDestination();
      setAudioReady(true);
    } catch (e) {
      console.warn('Failed to start audio', e);
    }
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
        try {
          pc.close();
        } catch {}
      });
      synthRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioReady, initialized, room]);

  async function pollSignaling() {
    try {
      const res = await fetch(`/api/rooms/${room}?peerId=${clientIdRef.current}`);
      if (!res.ok) return;
      const { offers = [], answers = [], candidates = [] } = await res.json();

      for (const o of offers) {
        const from = o.from;
        const sdp = o.sdp;
        if (!from || !sdp) continue;
        if (pcMapRef.current.has(from)) continue;
        await handleIncomingOffer(from, sdp);
      }

      for (const a of answers) {
        const from = a.from;
        const sdp = a.sdp;
        const pc = pcMapRef.current.get(from);
        if (!pc || !sdp) continue;
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp });
        } catch (e) {
          console.warn('setRemoteDescription(answer) failed', e);
        }
      }

      for (const c of candidates) {
        const from = c.from;
        const candidate = c.candidate;
        const pc = pcMapRef.current.get(from);
        if (!pc || !candidate) continue;
        try {
          await pc.addIceCandidate(candidate).catch(() => {});
        } catch (e) {
          console.warn('addIceCandidate failed', e);
        }
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
        }).catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        try {
          pc.close();
        } catch {}
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
      setPeers(prev => {
        if (!prev.includes(peerId)) return [...prev, peerId];
        return prev;
      });
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
    dc.onerror = e => {
      console.warn('DataChannel error', e);
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
        }).catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        try {
          pc.close();
        } catch {}
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
      if (dc && dc.readyState === 'open') {
        try {
          dc.send(str);
        } catch {}
      }
    });
  }

  function handleRemoteEvent(e) {
    const { type, midi, velocity = 0.9, ts } = e || {};
    if (!type || typeof midi !== 'number' || !synthRef.current) return;
    const note = midiToNote(midi);
    const now = Date.now();
    const latency = Math.max(0, now - (ts || now));
    const scheduleTime = Tone.now() + Math.max(0.02, latency / 1000);
    if (type === 'note_on') synthRef.current.triggerAttack(note, scheduleTime, velocity);
    if (type === 'note_off') synthRef.current.triggerRelease(note, scheduleTime);
  }

  function handleLocalNote(type, midi, velocity = 0.95) {
    if (!synthRef.current) return;
    const ts = Date.now();
    const event = { type, midi, velocity, ts, clientId: clientIdRef.current };
    const note = midiToNote(midi);
    if (type === 'note_on') synthRef.current.triggerAttack(note, Tone.now(), velocity);
    if (type === 'note_off') synthRef.current.triggerRelease(note, Tone.now());
    broadcast(event);
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
