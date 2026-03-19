import TypingGame from '../../apps/TypingGame';
import TypingChallenge from '../../apps/TypingChallenge';
import SnakeGame from '../../apps/SnakeGame';
import SnakeChallenge from '../../apps/SnakeChallenge';

export function launchTypingGame(createWindow) {
  createWindow(TypingGame.id, TypingGame);
}

export function launchTypingChallenge(createWindow) {
  createWindow(TypingChallenge.id, TypingChallenge);
}

export function launchSnakeGame(createWindow) {
  createWindow(SnakeGame.id, SnakeGame);
}

export function launchSnakeChallenge(createWindow) {
  createWindow(SnakeChallenge.id, SnakeChallenge);
}

// Central Game Registry (used by Game Store)
export const gameRegistry = [
  {
    id: 'typing-game',
    name: 'Typing Game',
    description: 'Test your typing speed and accuracy.',
    icon: TypingGame.icon,
    isUnlocked: false,
    launchFunction: launchTypingGame,
    challengeFunction: launchTypingChallenge,
    app: TypingGame,
    challengeApp: TypingChallenge,
    allowPlayFromStore: true,
  },
  {
    id: 'snake',
    name: 'Snake',
    description: 'Eat food, grow longer, and avoid crashing!',
    icon: SnakeGame.icon,
    isUnlocked: false,
    launchFunction: launchSnakeGame,
    challengeFunction: launchSnakeChallenge,
    app: SnakeGame,
    challengeApp: SnakeChallenge,
    // Requirement: full game should be launched from desktop only after install.
    allowPlayFromStore: false,
  },
];

export default gameRegistry;

