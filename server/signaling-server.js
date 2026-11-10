"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");

const ROOT = path.resolve(__dirname, "..");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8080);
const TLS_PFX_PATH = process.env.TLS_PFX_PATH;
const TLS_PFX_PASSPHRASE = process.env.TLS_PFX_PASSPHRASE;
const MAX_BODY_BYTES = 16 * 1024;
const ROOM_ID_PATTERN = /^[a-f0-9]{32}$/;
const rooms = new Map();
const admissions = new Map();
const links = new Map();

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".glb", "model/gltf-binary"],
  [".gltf", "model/gltf+json"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
  [".wav", "audio/wav"],
]);

function randomId() {
  return crypto.randomBytes(16).toString("hex");
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function roomView(room) {
  const players = room.members.size;
  const capacity = room.teamSize * 2;
  return {
    id: room.id,
    name: room.name,
    public: room.public,
    mode: room.mode,
    teamSize: room.teamSize,
    stage: room.stage,
    bots: 0,
    players,
    occupants: players,
    capacity,
    roomCapacity: capacity,
  };
}

function broadcastRoom(room, message, except) {
  for (const member of room.members.values()) {
    if (member !== except && member.socket?.readyState === WebSocket.OPEN) {
      member.socket.send(JSON.stringify(message));
    }
  }
}

function broadcastRoomState(room) {
  const message = { type: "joined", room: roomView(room) };
  broadcastRoom(room, message);
}

function clearReservation(member) {
  if (member.reservationTimer) {
    clearTimeout(member.reservationTimer);
    member.reservationTimer = null;
  }
}

function removeLink(linkId, reason = "peer-left") {
  const link = links.get(linkId);
  if (!link) return;
  links.delete(linkId);
  for (const member of [link.host, link.guest]) {
    if (member.socket?.readyState === WebSocket.OPEN) {
      member.socket.send(JSON.stringify({ type: reason, connection: linkId }));
    }
  }
}

function removeMember(room, member, closeSocket = true) {
  if (!room.members.has(member.slot)) return;
  clearReservation(member);
  for (const [linkId, link] of links) {
    if (link.host === member || link.guest === member) removeLink(linkId);
  }
  room.members.delete(member.slot);
  admissions.delete(member.ticket);
  if (closeSocket && member.socket?.readyState === WebSocket.OPEN) {
    member.socket.close(1000, "Room member left");
  }

  if (member.host || room.members.size === 0) {
    broadcastRoom(room, { type: "closed", reason: "The room host left." });
    for (const remaining of room.members.values()) {
      clearReservation(remaining);
      admissions.delete(remaining.ticket);
      remaining.socket?.close(1000, "Room closed");
    }
    room.members.clear();
    rooms.delete(room.id);
    return;
  }

  broadcastRoomState(room);
}

function createMember(room, slot, host, probe = false) {
  const ticket = crypto.randomBytes(32).toString("hex");
  const member = {
    room,
    slot,
    host,
    probe,
    ticket,
    connection: null,
    socket: null,
    reservationTimer: setTimeout(() => {
      if (!member.socket) removeMember(room, member, false);
    }, 60_000),
  };
  member.reservationTimer.unref?.();
  room.members.set(slot, member);
  admissions.set(ticket, member);
  return member;
}

function admissionView(member) {
  return {
    id: member.room.id,
    ticket: member.ticket,
    host: member.host,
    slot: member.slot,
    probe: member.probe,
    connection: member.connection ?? undefined,
    room: roomView(member.room),
  };
}

function createLink(hostMember, guestMember) {
  if (hostMember.socket?.readyState !== WebSocket.OPEN
      || guestMember.socket?.readyState !== WebSocket.OPEN
      || (guestMember.connection && links.has(guestMember.connection))) return;

  const linkId = guestMember.connection || randomId();
  guestMember.connection = linkId;
  const link = { host: hostMember, guest: guestMember };
  links.set(linkId, link);
  if (process.env.DEBUG_MULTIPLAYER === "1") {
    console.log(`Created peer link ${linkId} for room ${hostMember.room.id}`);
  }
  hostMember.socket.send(JSON.stringify({
    type: "peer",
    slot: guestMember.slot,
    connection: linkId,
    probe: guestMember.probe,
  }));
  guestMember.socket.send(JSON.stringify({
    type: "peer",
    slot: hostMember.slot,
    connection: linkId,
    probe: guestMember.probe,
  }));
}

function connectMember(member, socket) {
  const room = member.room;
  if (member.socket?.readyState === WebSocket.OPEN) {
    member.socket.close(4001, "Room connection replaced");
  }
  clearReservation(member);
  member.socket = socket;
  if (process.env.DEBUG_MULTIPLAYER === "1") {
    console.log(`Room ${room.id}: slot ${member.slot} connected`);
  }
  socket.send(JSON.stringify({ type: "joined", room: roomView(room) }));
  broadcastRoomState(room);

  if (member.host) {
    for (const guest of room.members.values()) {
      if (!guest.host) createLink(member, guest);
    }
  } else {
    const hostMember = room.members.get(0);
    if (hostMember) createLink(hostMember, member);
  }

  socket.on("message", (raw, isBinary) => {
    if (isBinary) {
      socket.close(1003, "Expected text signaling messages");
      return;
    }
    const text = raw.toString();
    if (text === "ping") {
      socket.send("pong");
      return;
    }

    let message;
    try {
      message = JSON.parse(text);
    } catch {
      socket.close(1007, "Invalid JSON");
      return;
    }
    if (!message || typeof message.type !== "string") return;
    if (process.env.DEBUG_MULTIPLAYER === "1") {
      console.log(`Room ${room.id}: slot ${member.slot} sent ${message.type}`);
    }

    if (message.type === "configure" && member.host) {
      const teamSize = Number(message.teamSize);
      const validSize = [1, 2, 3].includes(teamSize)
        && (room.mode !== "sideview" || teamSize <= 2);
      if (validSize) room.teamSize = teamSize;
      socket.send(JSON.stringify({
        type: "configured",
        requestId: message.requestId,
        ok: validSize,
        teamSize: room.teamSize,
        error: validSize ? undefined : "That room size is not available.",
      }));
      if (validSize) broadcastRoomState(room);
      return;
    }

    if (message.type === "stage" && member.host) {
      if (["warmup", "match", "results"].includes(message.stage)) {
        room.stage = message.stage;
      }
      broadcastRoom(room, message, member);
      broadcastRoomState(room);
      return;
    }

    if (message.type === "kick-peer" && member.host) {
      const link = links.get(message.connection);
      if (link?.host === member) removeMember(room, link.guest);
      return;
    }

    if (message.type === "drop-peer" && member.host) {
      removeLink(message.connection);
      return;
    }

    if (["offer", "answer", "ice"].includes(message.type)
        && typeof message.connection === "string") {
      const link = links.get(message.connection);
      if (!link || (link.host !== member && link.guest !== member)) return;
      const recipient = link.host === member ? link.guest : link.host;
      if (recipient.socket?.readyState === WebSocket.OPEN) {
        recipient.socket.send(JSON.stringify(message));
      }
    }
  });

  socket.on("close", () => {
    if (member.socket !== socket) return;
    member.socket = null;
    removeMember(room, member, false);
  });
  socket.on("error", (error) => {
    console.error(`Multiplayer socket error in room ${room.id}:`, error.message);
  });
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function validateRoomOptions(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const mode = ["standard", "retro", "sideview"].includes(body.mode) ? body.mode : "standard";
  const teamSize = Number(body.teamSize);
  if (!name || [...name].length > 48 || ![1, 2, 3].includes(teamSize)
      || (mode === "sideview" && teamSize > 2)) {
    const error = new Error("Room name, mode, or team size is invalid.");
    error.status = 400;
    throw error;
  }
  return { name, mode, teamSize, isPublic: body.public === true };
}

function allocateRoom(body) {
  const { name, mode, teamSize, isPublic } = validateRoomOptions(body);
  const room = {
    id: randomId(),
    name,
    public: isPublic,
    mode,
    teamSize,
    stage: "warmup",
    members: new Map(),
  };
  rooms.set(room.id, room);
  return admissionView(createMember(room, 0, true));
}

function joinRoom(body, probe = false) {
  if (typeof body.id !== "string" || !ROOM_ID_PATTERN.test(body.id)) {
    const error = new Error("Enter a valid room code or invite link.");
    error.status = 400;
    throw error;
  }
  const room = rooms.get(body.id);
  if (!room) {
    const error = new Error("That room is not available.");
    error.status = 404;
    throw error;
  }
  const capacity = probe ? room.teamSize * 2 + 1 : room.teamSize * 2;
  const occupiedSlots = new Set([...room.members.keys()]);
  let slot = 1;
  while (slot < capacity && occupiedSlots.has(slot)) slot++;
  if (slot >= capacity) {
    const error = new Error("That room is full.");
    error.status = 409;
    throw error;
  }
  const member = createMember(room, slot, false, probe);
  if (slot === 1) member.connection = randomId();
  return admissionView(member);
}

function releaseAdmission(body) {
  if (typeof body.id !== "string" || !ROOM_ID_PATTERN.test(body.id)) return;
  const room = rooms.get(body.id);
  if (!room) return;
  const member = [...room.members.values()].find((candidate) =>
    body.connection
      ? candidate.connection === body.connection
      : candidate.socket === null,
  );
  if (member) removeMember(room, member);
}

function listRooms(url) {
  const search = (url.searchParams.get("search") || "").trim().toLocaleLowerCase();
  const mode = url.searchParams.get("mode") || "";
  const includeFull = url.searchParams.get("full") === "1";
  const matching = [...rooms.values()]
    .filter((room) => room.public)
    .filter((room) => !search || room.name.toLocaleLowerCase().includes(search))
    .filter((room) => !mode || mode === "all" || room.mode === mode)
    .map(roomView)
    .filter((room) => includeFull || room.players < room.roomCapacity);
  return {
    rooms: matching.slice(0, 25),
    total: matching.length,
    countries: [],
    next: null,
    publicRoomsEnabled: true,
  };
}

async function serveStatic(request, response, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(response, 400, { error: "Invalid URL path." });
    return;
  }
  const aliases = new Map([
    ["/", "/index.html"],
    ["/embed", "/embed.html"],
    ["/online", "/online.html"],
    ["/legal", "/legal/index.html"],
  ]);
  const relativePath = aliases.get(pathname) || pathname;
  const filePath = path.resolve(ROOT, `.${relativePath}`);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
    sendJson(response, 404, { error: "File not found." });
    return;
  }
  let stats;
  try {
    stats = await fs.promises.stat(filePath);
  } catch (error) {
    console.error(`Unable to inspect ${relativePath}:`, error.message);
    sendJson(response, 500, { error: "Unable to read file." });
    return;
  }
  if (!stats.isFile()) {
    sendJson(response, 404, { error: "File not found." });
    return;
  }

  response.writeHead(200, {
    "Cache-Control": relativePath.endsWith(".html") ? "no-cache" : "public, max-age=3600",
    "Content-Length": stats.size,
    "Content-Type": MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on("error", (error) => {
    console.error(`Unable to serve ${relativePath}:`, error.message);
    if (!response.headersSent) sendJson(response, 500, { error: "Unable to read file." });
    else response.destroy(error);
  });
  stream.pipe(response);
}

async function handleRequest(request, response) {
  let url;
  try {
    url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  } catch {
    sendJson(response, 400, { error: "Invalid request URL." });
    return;
  }

  if (url.pathname === "/api/multiplayer/session" && request.method === "GET") {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (url.pathname === "/api/multiplayer/rooms" && request.method === "GET") {
    sendJson(response, 200, listRooms(url));
    return;
  }
  if (url.pathname.startsWith("/api/multiplayer/") && request.method === "POST") {
    const action = url.pathname.slice("/api/multiplayer/".length);
    try {
      const body = await readJson(request);
      if (action === "allocate") {
        sendJson(response, 200, allocateRoom(body));
      } else if (action === "join") {
        sendJson(response, 200, joinRoom(body));
      } else if (action === "probe") {
        sendJson(response, 200, joinRoom(body, true));
      } else if (action === "cancel" || action === "release") {
        releaseAdmission(body);
        sendJson(response, 200, { ok: true });
      } else {
        sendJson(response, 404, { error: "Unknown multiplayer action." });
      }
    } catch (error) {
      if (error.status) sendJson(response, error.status, { error: error.message });
      else {
        console.error("Multiplayer API request failed:", error.message);
        sendJson(response, 500, { error: "The multiplayer service encountered an error." });
      }
    }
    return;
  }

  await serveStatic(request, response, url);
}

const handleHttpRequest = (request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("HTTP request failed:", error.message);
    if (!response.headersSent) sendJson(response, 500, { error: "The server could not complete the request." });
    else response.destroy(error);
  });
};
if (TLS_PFX_PASSPHRASE && !TLS_PFX_PATH) {
  throw new Error("TLS_PFX_PATH is required when TLS_PFX_PASSPHRASE is set.");
}
const server = TLS_PFX_PATH
  ? https.createServer({
    pfx: fs.readFileSync(TLS_PFX_PATH),
    passphrase: TLS_PFX_PASSPHRASE,
  }, handleHttpRequest)
  : http.createServer(handleHttpRequest);
const webSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY_BYTES });

server.on("upgrade", (request, socket, head) => {
  let url;
  try {
    url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  } catch {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const match = url.pathname.match(/^\/api\/multiplayer\/room\/([a-f0-9]{32})$/);
  const member = match && admissions.get(url.searchParams.get("ticket"));
  if (!member || member.room.id !== match[1] || member.socket) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  webSockets.handleUpgrade(request, socket, head, (webSocket) => {
    webSockets.emit("connection", webSocket, request, member);
  });
});

webSockets.on("connection", (socket, _request, member) => connectMember(member, socket));

server.listen(PORT, HOST, () => {
  console.log(`Car Soccer room server listening on ${TLS_PFX_PATH ? "https" : "http"}://${HOST}:${PORT}`);
  console.log(`Serving game files from ${ROOT}`);
});

function closeServer() {
  for (const room of rooms.values()) {
    for (const member of room.members.values()) {
      clearReservation(member);
      member.socket?.close(1001, "Server shutting down");
    }
  }
  webSockets.close();
  server.close();
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
