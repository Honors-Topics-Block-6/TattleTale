import { useEffect, useMemo, useState } from 'react';
import { equipAvatar, fetchAccount, fetchAvatarCatalog, purchaseAvatar } from '../../lib/account-api';

export function AvatarShopComponent() {
  const [catalog, setCatalog] = useState([]);
  const [ownedIds, setOwnedIds] = useState([]);
  const [user, setUser] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const activeAvatar = user?.avatar ?? '🙂';

  async function refresh() {
    const [catalogData, accountData] = await Promise.all([
      fetchAvatarCatalog(),
      fetchAccount(),
    ]);
    setCatalog(catalogData.avatars || []);
    setOwnedIds(catalogData.ownedAvatarIds || []);
    setUser(accountData.user || null);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err?.message || 'Failed to load avatar shop'));
  }, []);

  const ownedSet = useMemo(() => new Set(ownedIds), [ownedIds]);

  const handlePurchase = async (avatarId) => {
    setBusyId(avatarId);
    setError('');
    try {
      await purchaseAvatar(avatarId);
      await refresh();
    } catch (err) {
      const msg = err?.message || 'Purchase failed';
      setError(msg === 'INSUFFICIENT_POINTS' ? 'Not enough points for that avatar.' : msg);
    } finally {
      setBusyId('');
    }
  };

  const handleEquip = async (avatarId) => {
    setBusyId(avatarId);
    setError('');
    try {
      await equipAvatar(avatarId);
      await refresh();
    } catch (err) {
      setError(err?.message || 'Equip failed');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div style={{ padding: 10, height: '100%', boxSizing: 'border-box', overflow: 'auto' }}>
      <div style={{ marginBottom: 8, fontWeight: 'bold' }}>Avatar Shop</div>
      <div style={{ marginBottom: 10, fontSize: 12 }}>
        Points: <strong>{user?.totalPoints ?? 0}</strong> | Equipped: <strong>{activeAvatar}</strong>
      </div>
      {error && <div style={{ color: '#b00020', marginBottom: 8, fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(160px, 1fr))', gap: 8 }}>
        {catalog.map((avatar) => {
          const isOwned = ownedSet.has(avatar.id);
          const isEquipped = activeAvatar === avatar.icon;
          const canAfford = (user?.totalPoints ?? 0) >= avatar.cost;
          return (
            <div
              key={avatar.id}
              style={{
                border: '1px solid #b7b7b7',
                background: '#fff',
                padding: 8,
                borderRadius: 2,
              }}
            >
              <div style={{ fontSize: 28 }}>{avatar.icon}</div>
              <div style={{ fontWeight: 'bold', fontSize: 12 }}>{avatar.name}</div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>{avatar.cost} pts</div>
              {isOwned ? (
                <button
                  onClick={() => handleEquip(avatar.id)}
                  disabled={isEquipped || busyId === avatar.id}
                  style={{ fontSize: 11 }}
                >
                  {isEquipped ? 'Equipped' : busyId === avatar.id ? 'Working...' : 'Equip'}
                </button>
              ) : (
                <button
                  onClick={() => handlePurchase(avatar.id)}
                  disabled={!canAfford || busyId === avatar.id}
                  style={{ fontSize: 11 }}
                  title={!canAfford ? 'Insufficient points' : ''}
                >
                  {busyId === avatar.id ? 'Buying...' : canAfford ? 'Buy' : 'Need more points'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const avatarShopIcon = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect x="3" y="6" width="26" height="22" rx="2" fill="#fff8e1" stroke="#8d6e63" stroke-width="1"/>
    <circle cx="16" cy="16" r="6" fill="#42a5f5"/>
    <circle cx="16" cy="14" r="2" fill="#fff"/>
    <path d="M12 20c1.2-2 6.8-2 8 0" fill="#fff"/>
  </svg>
`);

const AvatarShop = {
  id: 'avatar-shop',
  name: 'Avatar Shop',
  icon: avatarShopIcon,
  component: AvatarShopComponent,
  defaultWindow: {
    width: 520,
    height: 460,
    resizable: true,
    minWidth: 420,
    minHeight: 320,
  },
  startMenu: {
    show: true,
    section: 'programs',
    description: 'Unlock and equip avatars',
  },
};

export default AvatarShop;
