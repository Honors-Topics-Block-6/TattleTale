import { io } from 'socket.io-client';

const sessionId = 'verify-room';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, message, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function createClient(name, reconnectToken = null) {
  const socket = io('http://localhost:4000', {
    transports: ['websocket'],
    reconnection: false,
  });

  const state = {
    playerId: null,
    reconnectToken,
    channels: [],
    events: [],
    messages: [],
  };

  socket.on('connect', () => {
    socket.emit('intent', {
      type: 'JOIN_SESSION',
      timestamp: Date.now(),
      payload: {
        sessionId,
        username: name,
        reconnectToken: state.reconnectToken,
      },
    });
  });

  socket.on('session.snapshot', (snapshot) => {
    state.playerId = snapshot.playerId;
    state.reconnectToken = snapshot.reconnectToken;
    state.channels = snapshot.channels || [];
  });

  socket.on('chat.message', (message) => {
    state.messages.push(message);
  });

  socket.on('channel.available', (channel) => {
    state.channels.push(channel);
  });

  socket.on('system.event', (event) => {
    state.events.push(event);
  });

  socket.on('intent.rejected', (event) => {
    state.events.push({
      type: 'INTENT_REJECTED',
      summary: event.message,
      timestamp: Date.now(),
    });
  });

  return { socket, state };
}

async function waitFor(predicate, message) {
  await withTimeout(
    (async () => {
      while (!predicate()) {
        await wait(50);
      }
    })(),
    message
  );
}

async function run() {
  const alice = createClient('alice');
  const bob = createClient('bob');

  await waitFor(() => Boolean(alice.state.playerId && bob.state.playerId), 'join timeout');

  alice.socket.emit('intent', {
    type: 'SEND_MESSAGE',
    timestamp: Date.now(),
    payload: {
      sessionId,
      playerId: alice.state.playerId,
      channelId: 'global',
      text: 'hello from alice',
    },
  });

  await waitFor(
    () => bob.state.messages.some((item) => item.text === 'hello from alice'),
    'global message timeout'
  );

  bob.socket.emit('intent', {
    type: 'SWITCH_CHANNEL',
    timestamp: Date.now(),
    payload: {
      sessionId,
      playerId: bob.state.playerId,
      targetUsername: 'alice',
    },
  });

  await waitFor(
    () => alice.state.channels.some((item) => String(item.id).startsWith('private-')),
    'private channel creation timeout'
  );

  const dm = alice.state.channels.find((item) => String(item.id).startsWith('private-'));
  if (!dm) {
    throw new Error('dm channel not found');
  }

  bob.socket.emit('intent', {
    type: 'SEND_MESSAGE',
    timestamp: Date.now(),
    payload: {
      sessionId,
      playerId: bob.state.playerId,
      channelId: dm.id,
      text: 'secret ping',
    },
  });

  await waitFor(
    () => alice.state.messages.some((item) => item.text === 'secret ping'),
    'private message timeout'
  );

  bob.socket.emit('intent', {
    type: 'SEND_MESSAGE',
    timestamp: Date.now(),
    payload: {
      sessionId,
      playerId: bob.state.playerId,
      channelId: 'missing',
      text: 'this should fail',
    },
  });

  await waitFor(
    () => bob.state.events.some((item) => item.type === 'INTENT_REJECTED'),
    'intent rejection timeout'
  );

  const previousBobId = bob.state.playerId;
  const bobToken = bob.state.reconnectToken;
  bob.socket.disconnect();
  await wait(250);

  const bobReconnect = createClient('bob', bobToken);
  await waitFor(() => Boolean(bobReconnect.state.playerId), 'reconnect timeout');

  const reconnectSameId = bobReconnect.state.playerId === previousBobId;
  const report = {
    join: true,
    globalMessage: true,
    privateMessage: true,
    rejection: true,
    reconnectSameId,
    aliceEvents: alice.state.events.length,
    bobEvents: bob.state.events.length,
  };

  console.log(JSON.stringify(report, null, 2));
  alice.socket.disconnect();
  bobReconnect.socket.disconnect();
  process.exit(reconnectSameId ? 0 : 1);
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
