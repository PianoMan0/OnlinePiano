// app/api/rooms/[room]/route.js
'use client';
import PianoClient from './PianoClient';

export default function Page({ params }) {
  return <PianoClient room={params.id} />;
}
import { NextResponse } from 'next/server';

/**
 * Simple in-memory signaling store.
 * Note: still ephemeral on serverless platforms. This file makes the store resilient
 * so it won't crash when a fresh instance handles a request.
 */
const rooms = new Map();

function ensureRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { peers: new Map() });
  return rooms.get(roomId);
}

function ensurePeer(roomObj, peerId) {
  if (!roomObj.peers.has(peerId)) {
    roomObj.peers.set(peerId, { offers: [], answers: [], candidates: [] });
  }
  return roomObj.peers.get(peerId);
}

async function safeJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function POST(req, { params }) {
  const roomId = params.room;
  const body = await safeJson(req);
  if (!body) {
    return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
  }

  const { action, peerId, payload, target } = body;
  if (!action || !peerId) {
    return NextResponse.json({ error: 'Missing action or peerId' }, { status: 400 });
  }

  const room = ensureRoom(roomId);

  // Announce presence and return list of other peers
  if (action === 'announce') {
    ensurePeer(room, peerId);
    const others = Array.from(room.peers.keys()).filter(id => id !== peerId);
    return NextResponse.json({ peers: others });
  }

  // Remove peer (optional cleanup)
  if (action === 'leave') {
    room.peers.delete(peerId);
    return NextResponse.json({ ok: true });
  }

  // For signaling messages we require a target
  if (!target) {
    return NextResponse.json({ error: 'Missing target for signaling action' }, { status: 400 });
  }

  // Ensure target bucket exists
  ensurePeer(room, target);

  if (action === 'offer') {
    if (!payload || !payload.sdp) return NextResponse.json({ error: 'Missing sdp in payload' }, { status: 400 });
    room.peers.get(target).offers.push({ from: peerId, sdp: payload.sdp });
    return NextResponse.json({ ok: true });
  }

  if (action === 'answer') {
    if (!payload || !payload.sdp) return NextResponse.json({ error: 'Missing sdp in payload' }, { status: 400 });
    room.peers.get(target).answers.push({ from: peerId, sdp: payload.sdp });
    return NextResponse.json({ ok: true });
  }

  if (action === 'ice') {
    if (!payload || !payload.candidate) return NextResponse.json({ error: 'Missing candidate in payload' }, { status: 400 });
    room.peers.get(target).candidates.push({ from: peerId, candidate: payload.candidate });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req, { params }) {
  const roomId = params.room;
  const url = new URL(req.url);
  const peerId = url.searchParams.get('peerId');
  if (!peerId) return NextResponse.json({ error: 'Missing peerId query param' }, { status: 400 });

  const room = ensureRoom(roomId);
  const bucket = ensurePeer(room, peerId);

  // Return and clear queued messages for this peer
  const offers = bucket.offers.splice(0, bucket.offers.length);
  const answers = bucket.answers.splice(0, bucket.answers.length);
  const candidates = bucket.candidates.splice(0, bucket.candidates.length);

  return NextResponse.json({ offers, answers, candidates });
}
