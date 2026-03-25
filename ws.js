export const config = {
  runtime: "edge"
};

const rooms = new Map(); // roomId → Set<WebSocket>

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get("room") || "default";

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  server.accept();

  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  const room = rooms.get(roomId);
  room.add(server);

  server.addEventListener("message", (event) => {
    for (const peer of room) {
      if (peer !== server) {
        peer.send(event.data);
      }
    }
  });

  server.addEventListener("close", () => {
    room.delete(server);
    if (room.size === 0) rooms.delete(roomId);
  });

  return new Response(null, {
    status: 101,
    webSocket: client
  });
}
