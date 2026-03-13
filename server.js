import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

app.use(express.static(__dirname));

const wss = new WebSocketServer({ server, path: '/ws' });

const clients = new Set();

const roles = [
  { name: 'Friend', team: 'Friends' },
  { name: 'Extrovert', team: 'Friends' },
  { name: 'White Hat Hacker', team: 'Friends' },
  { name: 'Security Specialist', team: 'Friends' },
  { name: 'Psychic', team: 'Friends' },
  { name: 'Vengeful', team: 'Friends' },
  { name: 'Firewall', team: 'Friends' },
  { name: 'DM Leaks', team: 'Friends' },
  { name: 'Hacker', team: 'Hackers' },
  { name: 'The Boss', team: 'Hackers' },
  { name: 'Signal Jammer', team: 'Hackers' },
  { name: 'Eavesdropper', team: 'Hackers' },
  { name: 'Troller', team: 'Hackers' },
  { name: 'Imitator', team: 'Hackers' },
  { name: 'The Jealous', team: 'Neutral' },
];

function pickRandomRole() {
  const idx = Math.floor(Math.random() * roles.length);
  return roles[idx];
}

wss.on('connection', (ws) => {
  clients.add(ws);

  const assignedRole = pickRandomRole();
  ws._tattleRole = assignedRole;
  ws.send(
    JSON.stringify({
      type: 'role',
      role: assignedRole.name,
      team: assignedRole.team,
    }),
  );

  ws.on('message', (data) => {
    let payload = null;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }

    const message = {
      type: 'chat',
      text: String(payload.text ?? ''),
      sender: String(payload.sender ?? 'Anon'),
      sentAt: new Date().toISOString(),
      role: ws._tattleRole?.name ?? null,
      team: ws._tattleRole?.team ?? null,
    };

    const encoded = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(encoded);
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`TattleTale chat server running at http://localhost:${PORT}`);
});

