import { NextResponse } from 'next/server';

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
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { action, peerId, payload, target } = body;
  const room = ensureRoom(roomId);

  if (action === 'announce') {
    ensurePeer(room, peerId);
    const others = [...room.peers.keys()].filter(id => id !== peerId);
    return NextResponse.json({ peers: others });
  }

  if (action === 'leave') {
    room.peers.delete(peerId);
    return NextResponse.json({ ok: true });
  }

  if (!target) return NextResponse.json({ error: 'Missing target' }, { status: 400 });

  ensurePeer(room, target);

  if (action === 'offer') {
    room.peers.get(target).offers.push({ from: peerId, sdp: payload.sdp });
    return NextResponse.json({ ok: true });
  }

  if (action === 'answer') {
    room.peers.get(target).answers.push({ from: peerId, sdp: payload.sdp });
    return NextResponse.json({ ok: true });
  }

  if (action === 'ice') {
    room.peers.get(target).candidates.push({ from: peerId, candidate: payload.candidate });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req, { params }) {
  const roomId = params.room;
  const url = new URL(req.url);
  const peerId = url.searchParams.get('peerId');

  const room = ensureRoom(roomId);
  const bucket = ensurePeer(room, peerId);

  const offers = bucket.offers.splice(0);
  const answers = bucket.answers.splice(0);
  const candidates = bucket.candidates.splice(0);

  return NextResponse.json({ offers, answers, candidates });
}
