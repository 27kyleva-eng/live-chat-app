const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const rooms = new Map();

function getRoom(id) {
  const roomId = (id || 'lobby').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'lobby';
  if (!rooms.has(roomId)) rooms.set(roomId, { messages: [], clients: new Set(), online: { host: 0, guest: 0 } });
  return { id: roomId, data: rooms.get(roomId) };
}

function sendEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(roomId, event, payload) {
  const room = getRoom(roomId).data;
  for (const client of [...room.clients]) {
    try { sendEvent(client, event, payload); } catch (_) { room.clients.delete(client); }
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Raised payload size limit to 10MB to handle base64 image attachments
      if (body.length > 10_000_000) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
  });
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://' + req.headers.host);
  let file = url.pathname;
  if (file === '/' || file === '/guest') file = '/index.html';
  if (file === '/host') file = '/host.html';
  const safePath = path.normalize(file).replace(/^([.][.][/\\])+/, '');
  const fullPath = path.join(PUBLIC_DIR, safePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'Forbidden' });
  fs.readFile(fullPath, (err, data) => {
    if (err) return json(res, 404, { error: 'Not found' });
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);

  if (req.method === 'GET' && url.pathname === '/api/new-room') {
    return json(res, 200, { room: crypto.randomBytes(4).toString('hex') });
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    const roomId = url.searchParams.get('room') || 'lobby';
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';
    const { id, data } = getRoom(roomId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    data.clients.add(res);
    data.online[role] += 1;
    sendEvent(res, 'hello', { room: id, messages: data.messages.slice(-80), online: data.online });
    broadcast(id, 'presence', { online: data.online });

    const heartbeat = setInterval(() => sendEvent(res, 'ping', { now: Date.now() }), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      data.clients.delete(res);
      data.online[role] = Math.max(0, data.online[role] - 1);
      broadcast(id, 'presence', { online: data.online });
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/send') {
    try {
      const body = await readBody(req);
      const { id, data } = getRoom(body.room);
      const text = String(body.text || '').trim().slice(0, 1200);
      const image = body.image && typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : null;
      
      // Require either text OR an attached image
      if (!text && !image) return json(res, 400, { error: 'Text or image required' });

      const message = {
        id: crypto.randomUUID(),
        room: id,
        sender: body.sender === 'host' ? 'host' : 'guest',
        name: String(body.name || (body.sender === 'host' ? 'Host' : 'Guest')).slice(0, 40),
        text,
        image,
        createdAt: new Date().toISOString(),
        seen: false
      };
      data.messages.push(message);
      data.messages = data.messages.slice(-150);
      broadcast(id, 'message', message);
      return json(res, 200, { ok: true, message });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/seen') {
    try {
      const body = await readBody(req);
      const { room, msgId, seenBy } = body;
      const { data } = getRoom(room);
      
      const msg = data.messages.find(m => m.id === msgId);
      if (msg) {
        msg.seen = true;
        msg.seenBy = seenBy || 'Someone';
      }
      broadcast(room, 'seen', { msgId, seenBy: seenBy || 'Someone' });
      return json(res, 200, { success: true });
    } catch (err) {
      return json(res, 500, { error: 'Server Error' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/typing') {
    try {
      const body = await readBody(req);
      const { room, sender, name, isTyping } = body;
      
      broadcast(room, 'typing', { sender, name, isTyping });
      return json(res, 200, { success: true });
    } catch (err) {
      return json(res, 500, { error: 'Server Error' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/clear') {
    const body = await readBody(req).catch(() => ({}));
    const { id, data } = getRoom(body.room);
    data.messages = [];
    broadcast(id, 'clear', { ok: true });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Live chat running on http://localhost:${PORT}`);
});
