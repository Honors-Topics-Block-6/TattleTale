const root = document.getElementById('root');

if (root) {
  root.innerHTML = `
    <main style="max-width: 640px; margin: 40px auto; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <h1 style="margin-bottom: 4px;">TattleTale Sandbox</h1>
      <p style="margin-top: 0; margin-bottom: 16px; color: #4b5563; font-size: 14px;">
        Minimal text-box version for jotting down roles, chats, and notes.
      </p>

      <section style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; margin-bottom: 4px;">
          Lobby notes
        </label>
        <textarea
          style="width: 100%; min-height: 60px; padding: 8px; border-radius: 8px; border: 1px solid #d1d5db; font: inherit; resize: vertical;"
          placeholder="Player list, roles, and any setup info..."
        ></textarea>
      </section>

      <section style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; margin-bottom: 4px;">
          Main group chat
        </label>
        <textarea
          style="width: 100%; min-height: 120px; padding: 8px; border-radius: 8px; border: 1px solid #d1d5db; font: inherit; resize: vertical;"
          placeholder="Public discussion transcript goes here..."
        ></textarea>
      </section>

      <section style="margin-bottom: 16px;">
        <label style="display: block; font-size: 13px; margin-bottom: 4px;">
          Night / hacker chat
        </label>
        <textarea
          style="width: 100%; min-height: 80px; padding: 8px; border-radius: 8px; border: 1px solid #d1d5db; font: inherit; resize: vertical;"
          placeholder="Secret hacker coordination or night actions..."
        ></textarea>
      </section>

      <section>
        <label style="display: block; font-size: 13px; margin-bottom: 4px;">
          Notes & outcomes
        </label>
        <textarea
          style="width: 100%; min-height: 80px; padding: 8px; border-radius: 8px; border: 1px solid #d1d5db; font: inherit; resize: vertical;"
          placeholder="Eliminations, reveals, and any interesting moments..."
        ></textarea>
      </section>
    </main>
  `;
}

