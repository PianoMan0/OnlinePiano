// app/api/rooms/[room]/route.js
import { NextResponse } from 'next/server';

// In-memory signaling store (ephemeral on serverless)
const rooms = new Map();

// Force dynamic behavior (no caching)
export const dynamic = 'force-dynamic';

function ensureRoom(room) {
  if (!rooms.has(room)) {
    rooms.set(room, { peers: new Map() });
  }
  return rooms.get(room);
}

function ensurePeer(roomObj, peerId) {
  if (!roomObj.peers.has(peerId)) {
    roomObj.peers.set(peerId, { offers: [], answers: [], candidates: [] });
  }
  return roomObj.peers.get(peerId);
}

export async function POST(req, { params }) {
  const room = params.room;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { action, peerId, payload, target } = body || {};
  if (!action || !peerId) {
    return NextResponse.json({ error: 'Missing action or peerId' }, { status: 400 });
  }

  const r = ensureRoom(room);
  const selfBucket = ensurePeer(r, peerId);

  if (action === 'announce') {
    // Return list of other peers
    const others = Array.from(r.peers.keys()).filter(id => id !== peerId);
    return NextResponse.json({ peers: others });
  }

  if (!target && action !== 'announce') {
    return NextResponse.json({ error: 'Missing target' }, { status: 400 });
  }

  if (action === 'offer') {
    if (!payload?.sdp) {
      return NextResponse.json({ error: 'Missing offer SDP' }, { status: 400 });
    }
    const targetBucket = ensurePeer(r, target);
    targetBucket.offers.push({ from: peerId, sdp: payload.sdp });
    return NextResponse.json({ ok: true });
  }

  if (action === 'answer') {
    if (!payload?.sdp) {
      return NextResponse.json({ error: 'Missing answer SDP' }, { status: 400 });
    }
    const targetBucket = ensurePeer(r, target);
    targetBucket.answers.push({ from: peerId, sdp: payload.sdp });
    return NextResponse.json({ ok: true });
  }

  if (action === 'ice') {
    if (!payload?.candidate) {
      return NextResponse.json({ error: 'Missing ICE candidate' }, { status: 400 });
    }
    const targetBucket = ensurePeer(r, target);
    targetBucket.candidates.push({ from: peerId, candidate: payload.candidate });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req, { params }) {
  const room = params.room;
  const url = new URL(req.url);
  const peerId = url.searchParams.get('peerId');
  if (!peerId) {
    return NextResponse.json({ error: 'Missing peerId' }, { status: 400 });
  }

  const r = ensureRoom(room);
  const bucket = ensurePeer(r, peerId);

  const offers = bucket.offers.splice(0, bucket.offers.length);
  const answers = bucket.answers.splice(0, bucket.answers.length);
  const candidates = bucket.candidates.splice(0, bucket.candidates.length);

  return NextResponse.json({ offers, answers, candidates });
}
