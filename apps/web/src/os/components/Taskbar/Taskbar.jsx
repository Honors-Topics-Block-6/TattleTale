import StartButton from './StartButton';
import TaskbarApps from './TaskbarApps';
import Clock from './Clock';
import useGameStore from '../../store/gameStore';

export default function Taskbar() {
  const isInGame = useGameStore((state) => state.isInGame);
  const requestSamplePrompt = useGameStore(
    (state) => state.requestSamplePrompt
  );

  const handleShowSampleTask = () => {
    requestSamplePrompt();
  };

  return (
    <div className="xp-taskbar">
      <StartButton />
      <TaskbarApps />
      {!isInGame && (
        <button
          type="button"
          onClick={handleShowSampleTask}
          className="xp-taskbar-sample-button"
          style={{
            marginRight: 8,
            padding: '2px 6px',
            fontSize: 10,
            cursor: 'pointer',
          }}
        >
          Practice Task
        </button>
      )}
      <Clock />
    </div>
  );
}
