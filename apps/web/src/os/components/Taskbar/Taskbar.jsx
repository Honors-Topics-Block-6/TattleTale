import StartButton from './StartButton';
import TaskbarApps from './TaskbarApps';
import Clock from './Clock';

export default function Taskbar() {
  return (
    <div className="xp-taskbar">
      <StartButton />
      <TaskbarApps />
      <Clock />
    </div>
  );
}
