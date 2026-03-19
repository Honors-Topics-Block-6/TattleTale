import { useState } from 'react';

// ─── Shared styles ────────────────────────────────────────────────────────────

const FRIEND_COLOR = '#1a6abf';
const HACKER_COLOR = '#bf2020';
const NEUTRAL_COLOR = '#8a6a00';

const pill = (bg, text) => ({
  display: 'inline-block',
  background: bg,
  color: '#fff',
  fontSize: '10px',
  fontWeight: 'bold',
  padding: '1px 7px',
  borderRadius: '8px',
  letterSpacing: '0.5px',
  marginLeft: '6px',
  verticalAlign: 'middle',
});

// ─── Tab content components ───────────────────────────────────────────────────

function SectionHeader({ children }) {
  return (
    <div style={{
      fontWeight: 'bold',
      fontSize: '13px',
      color: '#003080',
      borderBottom: '2px solid #3a7ad5',
      marginBottom: '8px',
      marginTop: '16px',
      paddingBottom: '2px',
    }}>
      {children}
    </div>
  );
}

function Para({ children, style }) {
  return (
    <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#222', marginBottom: '8px', ...style }}>
      {children}
    </p>
  );
}

function OverviewTab() {
  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #1a3a8f 0%, #0a1a5f 100%)',
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
      }}>
        <div style={{ fontSize: '40px' }}>🕵️</div>
        <div>
          <div style={{ color: '#fff', fontSize: '16px', fontWeight: 'bold', letterSpacing: '1px' }}>
            TattleTale
          </div>
          <div style={{ color: '#aac', fontSize: '11px', marginTop: '2px' }}>
            A social deduction game about who you can trust — and who you can talk to.
          </div>
        </div>
      </div>

      <SectionHeader>What is TattleTale?</SectionHeader>
      <Para>
        TattleTale is a 10–20 minute pick-up-and-play social deduction game for groups. Like Mafia
        or Werewolf, players are secretly split into two teams — <strong>Friends</strong> and{' '}
        <strong>Hackers</strong>. But instead of a single town square, your battleground is{' '}
        <em>communication itself</em>.
      </Para>
      <Para>
        Special roles let players create, restrict, monitor, or sabotage chat channels — leading to
        misinformation, paranoia, and strategic social engineering across group chats, DMs, and
        hidden channels.
      </Para>

      <SectionHeader>The Two Teams</SectionHeader>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          flex: 1, background: '#e8f0ff', border: '1px solid #3a7ad5',
          borderRadius: '6px', padding: '10px',
        }}>
          <div style={{ fontWeight: 'bold', color: FRIEND_COLOR, fontSize: '12px', marginBottom: '4px' }}>
            👥 Friends <span style={pill('#1a6abf', '')}>GOOD TEAM</span>
          </div>
          <div style={{ fontSize: '11px', color: '#333', lineHeight: '1.5' }}>
            Work together using a shared secret keyword. Find and expose all Hackers before they
            take over. Win by eliminating every Hacker.
          </div>
        </div>
        <div style={{
          flex: 1, background: '#fff0f0', border: '1px solid #bf4040',
          borderRadius: '6px', padding: '10px',
        }}>
          <div style={{ fontWeight: 'bold', color: HACKER_COLOR, fontSize: '12px', marginBottom: '4px' }}>
            💻 Hackers <span style={pill('#bf2020', '')}>BAD TEAM</span>
          </div>
          <div style={{ fontSize: '11px', color: '#333', lineHeight: '1.5' }}>
            Know each other from the start. Blend in, manipulate chats, and eliminate Friends.
            Win when Hackers make up half or more of surviving players.
          </div>
        </div>
      </div>

      <SectionHeader>Win Conditions</SectionHeader>
      <Para>
        🏆 <strong>Friends win</strong> when all Hackers have been eliminated.
      </Para>
      <Para>
        💥 <strong>Hackers win</strong> when they equal or outnumber the remaining Friends.
      </Para>
    </div>
  );
}

function GameFlowTab() {
  const phase = (emoji, title, time, desc) => (
    <div key={title} style={{
      display: 'flex', gap: '10px', marginBottom: '8px',
      background: '#f5f8ff', border: '1px solid #c0d0f0',
      borderRadius: '5px', padding: '8px 10px',
    }}>
      <div style={{ fontSize: '18px', lineHeight: 1 }}>{emoji}</div>
      <div>
        <div style={{ fontWeight: 'bold', fontSize: '11px', color: '#003080' }}>
          {title}
          {time && <span style={{ fontWeight: 'normal', color: '#666', marginLeft: '6px' }}>{time}</span>}
        </div>
        <div style={{ fontSize: '11px', color: '#444', lineHeight: 1.5, marginTop: '2px' }}>{desc}</div>
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader>How a Round Works</SectionHeader>
      <Para>
        The game alternates between <strong>Day Cycles</strong> and <strong>Night Cycles</strong>{' '}
        until one team wins. Each cycle is timed to keep things fast and social.
      </Para>

      <div style={{
        background: '#fffbe8', border: '1px solid #c4a000',
        borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '11px', color: '#5a4000',
      }}>
        🕐 Default game length: ~10–20 minutes &nbsp;·&nbsp; Day Cycle: 3 min &nbsp;·&nbsp; Night Cycle: 1 min
      </div>

      <SectionHeader>☀️ Day Cycle (3 minutes)</SectionHeader>
      {phase('💬', 'Phase 1 — Open Communication', '1:30', 'All players chat freely across any channel they have access to. Discuss, accuse, coordinate, or deceive. Friends complete tasks to unlock their vote.')}
      {phase('📢', 'Phase 2 — Final Statements', '0:30', '(Optional) Private messages are locked. Only the main group chat stays open for last-minute persuasion.')}
      {phase('🗳️', 'Phase 3 — Voting', '0:30', 'Each player casts one secret vote to eliminate a player — or votes for no elimination. Ties result in no elimination.')}
      {phase('📣', 'Phase 4 — Resolution', '0:10', 'The most-voted player is eliminated. Their role may or may not be revealed depending on lobby settings.')}

      <SectionHeader>🌙 Night Cycle (1 minute)</SectionHeader>
      {phase('🖥️', 'Phase 1 — Hacker Discussion', '0:30', 'Hackers talk freely in their private Hacker Chat to coordinate their target and strategy.')}
      {phase('🎯', 'Phase 2 — Role Actions', '0:10', 'All players with night abilities submit their action — hack, investigate, protect, jam, monitor, or create chats.')}
      {phase('⚙️', 'Phase 3 — Resolution', 'auto', 'Actions resolve in priority order: Protection → Investigation → Interference → Elimination → Chat changes.')}
      {phase('🔔', 'Phase 4 — Reveal', '0:10', 'Night eliminations are announced. New chat restrictions take effect. The next Day Cycle begins immediately.')}
    </div>
  );
}

function RolesTab() {
  const [team, setTeam] = useState('friends');

  const roleCard = (emoji, name, tag, ability, desc) => (
    <div key={name} style={{
      background: team === 'friends' ? '#f0f5ff' : team === 'hackers' ? '#fff0f0' : '#fffbe8',
      border: `1px solid ${team === 'friends' ? '#b0c8f0' : team === 'hackers' ? '#f0b0b0' : '#e0c040'}`,
      borderRadius: '5px', padding: '8px 10px', marginBottom: '6px',
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '2px' }}>
        {emoji} {name}
        {tag && <span style={pill(team === 'friends' ? '#2a6abf' : team === 'hackers' ? '#bf2020' : '#8a6a00', '')}>{tag}</span>}
      </div>
      <div style={{ fontSize: '11px', color: '#555', fontStyle: 'italic', marginBottom: '2px' }}>
        Ability: {ability}
      </div>
      <div style={{ fontSize: '11px', color: '#333', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );

  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setTeam(id)}
      style={{
        padding: '4px 12px', fontSize: '11px', fontFamily: 'Tahoma, sans-serif',
        cursor: 'pointer', borderRadius: '3px 3px 0 0',
        background: team === id
          ? (id === 'friends' ? '#1a6abf' : id === 'hackers' ? '#bf2020' : '#8a6a00')
          : '#ddd',
        color: team === id ? '#fff' : '#333',
        border: '1px solid #888',
        borderBottom: team === id ? 'none' : '1px solid #888',
        marginRight: '2px',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <Para>Each player is randomly assigned one role. Roles belong to a team and define your special night ability.</Para>
      <div style={{ marginBottom: '8px' }}>
        {tabBtn('friends', '👥 Friends')}
        {tabBtn('hackers', '💻 Hackers')}
        {tabBtn('neutral', '⚖️ Neutral')}
      </div>
      <div style={{
        border: '1px solid #888', borderRadius: '0 4px 4px 4px',
        padding: '10px', background: '#fafafa',
      }}>
        {team === 'friends' && <>
          {roleCard('🤝', 'Friend', 'MVP', 'None', 'The standard role. No special powers, but has full chat access and one vote per day cycle.')}
          {roleCard('🎉', 'Extrovert', 'MVP', 'Temporary Group Chat', 'Each night, create a temporary group chat and invite any players. The chat lasts through the next day cycle.')}
          {roleCard('🔍', 'White Hat Hacker', 'MVP', 'Investigate', 'Each night, privately learn the true role of one player.')}
          {roleCard('🛡️', 'Security Specialist', 'MVP', 'Protect', 'Each night, shield one player from being eliminated by a hack.')}
          {roleCard('🔮', 'Psychic', '', 'Commune', 'Each night, receive a limited message from hacked Friends beyond the veil.')}
          {roleCard('😤', 'Vengeful', '', 'Spite', 'When you are hacked or kicked, drag one other player down with you.')}
          {roleCard('🔒', 'Firewall', '', 'Channel Lock', 'Once per game, lock one chat channel for the rest of the day cycle. Everyone can see it\'s locked.')}
          {roleCard('📢', 'DM Leaks', '', 'The Snitch', 'Randomly leak confidential chats to players who shouldn\'t have access. The sender\'s identity stays hidden.')}
        </>}
        {team === 'hackers' && <>
          {roleCard('💻', 'Hacker', 'MVP', 'None', 'Standard Hacker. Knows the other Hackers and participates in night coordination via the Hacker Chat.')}
          {roleCard('👑', 'The Boss', '', 'Final Elimination Choice', 'Each night, you make the final call on who gets hacked — overriding any internal disagreements.')}
          {roleCard('📡', 'Signal Jammer', '', 'Jam Private Messages', 'Each night, choose one player who cannot send or receive DMs during the next day cycle.')}
          {roleCard('👂', 'Eavesdropper', '', 'Monitor Private Messages', 'Each night, choose one player and silently read all their DMs the next day.')}
          {roleCard('🃏', 'Troller', '', 'Misdirection', 'Each night, pick a player. Their first DM next day is altered by the moderator in a misleading way — and they won\'t know it.')}
          {roleCard('🎭', 'Imitator', '', 'Mimic', 'Each night, choose a player. Next day they can\'t chat — but you can post in their name to the group.')}
        </>}
        {team === 'neutral' && <>
          {roleCard('😈', 'The Jealous', '', 'Identity Theft', 'Once per game, swap roles with any player. Whoever you swap with becomes the plain default version of their team.')}
        </>}
      </div>
    </div>
  );
}

function StartJoinTab() {
  const [lobbyCode, setLobbyCode] = useState('');
  const [name, setName] = useState('');

  const inputStyle = {
    width: '100%', padding: '5px 8px', fontSize: '12px',
    fontFamily: 'Tahoma, sans-serif', border: '2px inset #888',
    background: '#fff', marginBottom: '8px', boxSizing: 'border-box',
  };

  const btnStyle = (color) => ({
    width: '100%', padding: '6px', fontSize: '12px', fontFamily: 'Tahoma, sans-serif',
    cursor: 'not-allowed', opacity: 0.6, borderRadius: '3px',
    background: `linear-gradient(180deg, ${color}cc 0%, ${color} 100%)`,
    color: '#fff', border: `1px solid ${color}88`, fontWeight: 'bold',
  });

  return (
    <div>
      <div style={{
        background: '#fffbe8', border: '1px solid #c4a000',
        borderRadius: '6px', padding: '10px 12px', marginBottom: '14px',
        fontSize: '11px', color: '#5a4000', display: 'flex', gap: '8px', alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: '16px' }}>🚧</span>
        <span>
          <strong>Coming Soon!</strong> The multiplayer lobby system is still being built.
          The controls below show what starting and joining a game will look like once it's ready.
        </span>
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        {/* Host a Game */}
        <div style={{
          flex: 1, background: '#e8f0ff', border: '1px solid #3a7ad5',
          borderRadius: '6px', padding: '12px',
        }}>
          <div style={{ fontWeight: 'bold', color: FRIEND_COLOR, fontSize: '12px', marginBottom: '8px' }}>
            🌐 Host a Game
          </div>
          <label style={{ fontSize: '11px', color: '#333' }}>Your name</label>
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name..."
            disabled
          />
          <label style={{ fontSize: '11px', color: '#333' }}>Player count</label>
          <select style={{ ...inputStyle, marginBottom: '10px' }} disabled>
            <option>4–6 players</option>
            <option>7–10 players</option>
            <option>11–15 players</option>
          </select>
          <button style={btnStyle('#1a6abf')} disabled>
            Create Lobby
          </button>
        </div>

        {/* Join a Game */}
        <div style={{
          flex: 1, background: '#fff0f0', border: '1px solid #bf4040',
          borderRadius: '6px', padding: '12px',
        }}>
          <div style={{ fontWeight: 'bold', color: HACKER_COLOR, fontSize: '12px', marginBottom: '8px' }}>
            🔗 Join a Game
          </div>
          <label style={{ fontSize: '11px', color: '#333' }}>Your name</label>
          <input
            style={inputStyle}
            placeholder="Enter your name..."
            disabled
          />
          <label style={{ fontSize: '11px', color: '#333' }}>Lobby code</label>
          <input
            style={inputStyle}
            value={lobbyCode}
            onChange={(e) => setLobbyCode(e.target.value.toUpperCase())}
            placeholder="e.g. ABCD-1234"
            disabled
          />
          <button style={btnStyle('#bf2020')} disabled>
            Join Lobby
          </button>
        </div>
      </div>

      <SectionHeader>Quick Rules Reminder</SectionHeader>
      <div style={{ fontSize: '11px', color: '#333', lineHeight: 1.7 }}>
        <div>✅ You need <strong>4+ players</strong> to start a game.</div>
        <div>✅ Roles are assigned <strong>randomly and secretly</strong> at the start.</div>
        <div>✅ <strong>Friends</strong> see a shared keyword. <strong>Hackers</strong> see each other.</div>
        <div>✅ The game ends when <strong>all Hackers</strong> are out, or <strong>Hackers equal/outnumber Friends</strong>.</div>
        <div>✅ All role abilities can be <strong>toggled on/off</strong> by the host in lobby settings.</div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',  label: '📖 Overview' },
  { id: 'flow',      label: '🔄 Game Flow' },
  { id: 'roles',     label: '🎭 Roles' },
  { id: 'startjoin', label: '🎮 Start / Join' },
];

function TattleTaleGuideComponent() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: '#fff', fontFamily: 'Tahoma, sans-serif',
    }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: '1px solid #888',
        background: 'linear-gradient(180deg, #e8eaf8 0%, #d0d4f0 100%)',
        padding: '4px 6px 0',
        gap: '2px',
        flexShrink: 0,
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              fontFamily: 'Tahoma, sans-serif',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              border: '1px solid #888',
              borderBottom: activeTab === tab.id ? '1px solid #fff' : '1px solid #888',
              background: activeTab === tab.id
                ? '#fff'
                : 'linear-gradient(180deg, #d8daf0 0%, #b8bcdc 100%)',
              color: activeTab === tab.id ? '#003080' : '#444',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              marginBottom: activeTab === tab.id ? '-1px' : '0',
              position: 'relative',
              zIndex: activeTab === tab.id ? 1 : 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 14px',
      }}>
        {activeTab === 'overview'  && <OverviewTab />}
        {activeTab === 'flow'      && <GameFlowTab />}
        {activeTab === 'roles'     && <RolesTab />}
        {activeTab === 'startjoin' && <StartJoinTab />}
      </div>
    </div>
  );
}

// ─── App icon ─────────────────────────────────────────────────────────────────

const guideIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="3" y="2" width="26" height="28" rx="2" fill="#1a3a8f" stroke="#0a1a5f" stroke-width="1"/>
    <rect x="5" y="4" width="22" height="24" rx="1" fill="#fff"/>
    <rect x="7" y="7" width="10" height="2" rx="1" fill="#1a3a8f"/>
    <rect x="7" y="11" width="18" height="1" rx="0.5" fill="#ccc"/>
    <rect x="7" y="13" width="16" height="1" rx="0.5" fill="#ccc"/>
    <rect x="7" y="15" width="18" height="1" rx="0.5" fill="#ccc"/>
    <rect x="7" y="17" width="14" height="1" rx="0.5" fill="#ccc"/>
    <rect x="7" y="21" width="8" height="1" rx="0.5" fill="#bf2020"/>
    <rect x="7" y="23" width="12" height="1" rx="0.5" fill="#1a6abf"/>
    <circle cx="25" cy="7" r="4" fill="#f7d040" stroke="#c4a000" stroke-width="0.5"/>
    <text x="25" y="10" text-anchor="middle" fill="#5a3a00" font-size="6" font-family="sans-serif" font-weight="bold">?</text>
  </svg>
`);

// ─── App config ───────────────────────────────────────────────────────────────

const TattleTaleGuide = {
  id: 'tattletale-guide',
  name: 'TattleTale Guide',
  icon: guideIcon,
  component: TattleTaleGuideComponent,
  defaultWindow: {
    width: 560,
    height: 480,
    resizable: true,
    minWidth: 460,
    minHeight: 360,
  },
  desktopIcon: {
    show: true,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Learn how to play TattleTale',
  },
};

export default TattleTaleGuide;
