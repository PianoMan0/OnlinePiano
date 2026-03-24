// app/api/rooms/[room]/route.js
import { NextResponse } from 'next/server';

const rooms = new Map(); // in-memory store: room -> { peers: Map(peerId, {offers:[], answers:[], candidates:[]}) }
// NOTE: This is ephemeral and will not persist across serverless cold starts.

function ensureRoom(room) {
  if (!rooms.has(room)) rooms.set(room, { peers: new Map() });
  return rooms.get(room);
}

export async function POST(req, { params }) {
  const room = params.room;
  const body = await req.json();
  // body: { action, peerId, payload }
  const { action, peerId, payload, target } = body;
  if (!action || !peerId) return NextResponse.json({ error: 'missing action or peerId' }, { status: 400 });

  const r = ensureRoom(room);
  if (!r.peers.has(peerId)) r.peers.set(peerId, { offers: [], answers: [], candidates: [] });

  if (action === 'announce') {
    // announce presence; return list of other peers
    const others = Array.from(r.peers.keys()).filter(id => id !== peerId);
    return NextResponse.json({ peers: others });
  }

  if (action === 'offer') {
    // payload: { sdp }
    // store offer under target peer so target can fetch it
    if (!target) return NextResponse.json({ error: 'missing target' }, { status: 400 });
    if (!r.peers.has(target)) r.peers.set(target, { offers: [], answers: [], candidates: [] });
    r.peers.get(target).offers.push({ from: peerId, sdp: payload.sdp });
    return NextResponse.json({ ok: true });
  }

  if (action === 'answer') {
    // payload: { sdp }
    if (!target) return NextResponse.json({ error: 'missing target' }, { status: 400 });
    if (!r.peers.has(target)) r.peers.set(target, { offers: [], answers: [], candidates: [] });
    r.peers.get(target).answers.push({ from: peerId, sdp: payload.sdp });
    return NextResponse.json({ ok: true });
  }

  if (action === 'ice') {
    // payload: { candidate }
    if (!target) return NextResponse.json({ error: 'missing target' }, { status: 400 });
    if (!r.peers.has(target)) r.peers.set(target, { offers: [], answers: [], candidates: [] });
    r.peers.get(target).candidates.push({ from: peerId, candidate: payload.candidate });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

export async function GET(req, { params }) {
  const room = params.room;
  const url = new URL(req.url);
  const peerId = url.searchParams.get('peerId');
  if (!peerId) return NextResponse.json({ error: 'missing peerId' }, { status: 400 });

  const r = ensureRoom(room);
  if (!r.peers.has(peerId)) r.peers.set(peerId, { offers: [], answers: [], candidates: [] });
  const bucket = r.peers.get(peerId);

  // return and clear stored messages for this peer
  const offers = bucket.offers.splice(0, bucket.offers.length);
  const answers = bucket.answers.splice(0, bucket.answers.length);
  const candidates = bucket.candidates.splice(0, bucket.candidates.length);

  return NextResponse.json({ offers, answers, candidates });
}
