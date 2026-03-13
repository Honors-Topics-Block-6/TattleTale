function renderChatScreen(root) {
  root.innerHTML = `
    <main style="max-width: 720px; margin: 32px auto; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <h1 style="margin-bottom: 4px;">TattleTale Chat</h1>
      <p style="margin-top: 0; margin-bottom: 16px; color: #4b5563; font-size: 14px;">
        Open this page on multiple devices (same network) to chat in real time.
      </p>

      <section style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
        <label style="flex: 0 0 auto; font-size: 13px;">
          Name:
        </label>
        <input
          id="nameInput"
          style="flex: 0 0 160px; padding: 6px 8px; border-radius: 999px; border: 1px solid #d1d5db; font: inherit;"
          placeholder="Your name"
        />
        <span id="statusBadge" style="font-size: 12px; color: #6b7280;">Connecting…</span>
      </section>
      <section style="margin-bottom: 12px; font-size: 12px; color: #4b5563;">
        <span>Your role: </span>
        <strong id="roleBadge">assigning…</strong>
      </section>

      <section style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; height: 420px;">
        <div id="messages"
          style="flex: 1; overflow-y: auto; padding: 4px 2px; font-size: 14px; line-height: 1.4; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
        </div>
        <form id="chatForm" style="display: flex; gap: 8px; margin-top: 8px;">
          <input
            id="messageInput"
            autocomplete="off"
            style="flex: 1; padding: 8px 10px; border-radius: 999px; border: 1px solid #d1d5db; font: inherit;"
            placeholder="Type a message and press Enter…"
          />
          <button type="submit"
            style="padding: 8px 16px; border-radius: 999px; border: none; background: #2563eb; color: white; font-size: 14px; cursor: pointer;">
            Send
          </button>
        </form>
      </section>
    </main>
  `;

  const messagesEl = document.getElementById('messages');
  const formEl = document.getElementById('chatForm');
  const messageInputEl = document.getElementById('messageInput');
  const nameInputEl = document.getElementById('nameInput');
  const statusBadgeEl = document.getElementById('statusBadge');
  const roleBadgeEl = document.getElementById('roleBadge');

  let currentRole = null;
  let currentTeam = null;

  function appendSystem(text) {
    const line = document.createElement('div');
    line.style.color = '#6b7280';
    line.style.fontSize = '12px';
    line.textContent = text;
    messagesEl.appendChild(line);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMessage(sender, text, isOwn) {
    const line = document.createElement('div');
    line.style.marginBottom = '4px';
    const nameSpan = document.createElement('span');
    nameSpan.style.fontWeight = '600';
    nameSpan.textContent = isOwn ? 'You' : sender || 'Anon';
    const textSpan = document.createElement('span');
    textSpan.textContent = `: ${text}`;
    line.appendChild(nameSpan);
    line.appendChild(textSpan);
    messagesEl.appendChild(line);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  let socket;
  try {
    socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
  } catch {
    appendSystem('Could not open WebSocket connection.');
    if (statusBadgeEl) statusBadgeEl.textContent = 'Disconnected';
    return;
  }

  let isOpen = false;

  socket.addEventListener('open', () => {
    isOpen = true;
    if (statusBadgeEl) statusBadgeEl.textContent = 'Connected';
    appendSystem('Connected to TattleTale chat.');
  });

  socket.addEventListener('close', () => {
    isOpen = false;
    if (statusBadgeEl) statusBadgeEl.textContent = 'Disconnected';
    appendSystem('Disconnected from server.');
  });

  socket.addEventListener('message', (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }

    if (payload.type === 'role') {
      currentRole = payload.role || null;
      currentTeam = payload.team || null;
      if (roleBadgeEl) {
        roleBadgeEl.textContent = currentRole
          ? `${currentRole} (${currentTeam || 'Unknown team'})`
          : 'unassigned';
      }
      appendSystem(
        currentRole
          ? `You have been assigned the role: ${currentRole} (${currentTeam || 'Unknown team'}).`
          : 'No role could be assigned.',
      );
      return;
    }

    if (payload.type !== 'chat') return;
    const sender = payload.sender || 'Anon';
    const text = payload.text || '';
    const currentName = (nameInputEl && nameInputEl.value.trim()) || '';
    const isOwn = currentName && sender === currentName;
    appendMessage(sender, text, isOwn);
  });

  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!isOpen) {
      appendSystem('Not connected to server.');
      return;
    }
    const text = messageInputEl.value.trim();
    if (!text) return;
    const sender = (nameInputEl && nameInputEl.value.trim()) || 'Anon';
    const payload = { sender, text };
    socket.send(JSON.stringify(payload));
    messageInputEl.value = '';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <main style="max-width: 720px; margin: 40px auto; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center;">
      <h1 style="margin-bottom: 8px; font-size: 28px;">TattleTale</h1>
      <p style="margin-top: 0; margin-bottom: 24px; color: #4b5563; font-size: 15px;">
        A communication-first social deduction sandbox.
      </p>
      <button id="playButton"
        style="padding: 10px 26px; border-radius: 999px; border: none; background: #2563eb; color: white; font-size: 16px; cursor: pointer;">
        Play
      </button>
    </main>
  `;

  const playButton = document.getElementById('playButton');
  if (playButton) {
    playButton.addEventListener('click', () => {
      renderChatScreen(root);
    });
  }
});

