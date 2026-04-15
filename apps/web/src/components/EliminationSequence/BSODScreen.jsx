const BSOD_VARIANTS = {
  VOTED_OUT: [
    { name: 'TRUST_VIOLATION_FATAL', stop: '0x000000FE', sys: 'socialnet.sys', desc: 'Session terminated by network vote', weight: 3 },
    { name: 'SOCIAL_ENGINEERING_SUCCESS', stop: '0x00000C04', sys: 'consensus.sys', desc: 'Majority override engaged', weight: 3 },
    { name: 'CONNECTION_TERMINATED_BY_HOST', stop: '0x0000DEAD', sys: 'groupchat.sys', desc: 'User removed by collective decision', weight: 2 },
    { name: 'HACKER_INTRUSION_DETECTED', stop: '0x00BADFED', sys: 'firewall.sys', desc: 'Unauthorized access detected', weight: 1 },
    { name: 'FIREWALL_BREACH', stop: '0x000000BE', sys: 'defense.sys', desc: 'Perimeter compromised', weight: 1 },
    { name: 'ROOTKIT_INSTALLED', stop: '0x00C0FFEE', sys: 'kernel.sys', desc: 'System integrity violation', weight: 1 },
  ],
  NIGHT_KILL: [
    { name: 'TRUST_VIOLATION_FATAL', stop: '0x000000FE', sys: 'socialnet.sys', desc: 'Session terminated by network vote', weight: 1 },
    { name: 'SOCIAL_ENGINEERING_SUCCESS', stop: '0x00000C04', sys: 'consensus.sys', desc: 'Majority override engaged', weight: 1 },
    { name: 'CONNECTION_TERMINATED_BY_HOST', stop: '0x0000DEAD', sys: 'groupchat.sys', desc: 'User removed by collective decision', weight: 1 },
    { name: 'HACKER_INTRUSION_DETECTED', stop: '0x00BADFED', sys: 'firewall.sys', desc: 'Unauthorized access detected', weight: 3 },
    { name: 'FIREWALL_BREACH', stop: '0x000000BE', sys: 'defense.sys', desc: 'Perimeter compromised', weight: 3 },
    { name: 'ROOTKIT_INSTALLED', stop: '0x00C0FFEE', sys: 'kernel.sys', desc: 'System integrity violation', weight: 3 },
  ],
};

function pickWeighted(variants) {
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const v of variants) {
    roll -= v.weight;
    if (roll <= 0) return v;
  }
  return variants[variants.length - 1];
}

export default function BSODScreen({ cause }) {
  const variants = BSOD_VARIANTS[cause] || BSOD_VARIANTS.NIGHT_KILL;
  const variant = pickWeighted(variants);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0000AA',
        color: '#fff',
        fontFamily: '"Lucida Console", "Courier New", monospace',
        fontSize: 14,
        padding: '10% 15%',
        zIndex: 200000,
        whiteSpace: 'pre-wrap',
        lineHeight: 1.6,
      }}
    >
      {`A problem has been detected and TattleTale has been shut down to protect your network.

${variant.name}

*** STOP: ${variant.stop} (0xDEADBEEF, 0x00000001, 0x00000000)

Technical Information:
*** ${variant.sys} — ${variant.desc}

Beginning memory dump... Complete.
Contact your system administrator for help.`}
    </div>
  );
}
