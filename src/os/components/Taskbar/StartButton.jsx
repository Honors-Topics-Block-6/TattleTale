import useMenuStore from '../../store/menuStore';

export default function StartButton() {
  const toggleStartMenu = useMenuStore((state) => state.toggleStartMenu);

  // Simple Windows logo SVG
  const windowsLogo = 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
      <rect x="1" y="1" width="8" height="8" fill="#ff0000"/>
      <rect x="11" y="1" width="8" height="8" fill="#00ff00"/>
      <rect x="1" y="11" width="8" height="8" fill="#0000ff"/>
      <rect x="11" y="11" width="8" height="8" fill="#ffff00"/>
    </svg>
  `);

  const handleClick = (e) => {
    e.stopPropagation();
    toggleStartMenu();
  };

  return (
    <button className="xp-start-button" onClick={handleClick}>
      <img src={windowsLogo} alt="Windows" />
      <span>start</span>
    </button>
  );
}
