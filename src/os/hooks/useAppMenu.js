import { useCallback, useEffect, useRef } from 'react';

// Registry of menu action handlers per window
const windowHandlers = new Map();

export function registerMenuHandler(windowId, actionId, handler) {
  if (!windowHandlers.has(windowId)) {
    windowHandlers.set(windowId, new Map());
  }
  windowHandlers.get(windowId).set(actionId, handler);
}

export function unregisterMenuHandlers(windowId) {
  windowHandlers.delete(windowId);
}

export function executeMenuAction(windowId, actionId) {
  const handlers = windowHandlers.get(windowId);
  if (handlers && handlers.has(actionId)) {
    handlers.get(actionId)();
    return true;
  }
  return false;
}

export default function useAppMenu(windowId, handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Register handlers on mount
  useEffect(() => {
    Object.entries(handlersRef.current).forEach(([actionId, handler]) => {
      registerMenuHandler(windowId, actionId, handler);
    });

    return () => {
      unregisterMenuHandlers(windowId);
    };
  }, [windowId]);

  // Update handlers when they change
  const updateHandlers = useCallback((newHandlers) => {
    Object.entries(newHandlers).forEach(([actionId, handler]) => {
      registerMenuHandler(windowId, actionId, handler);
    });
  }, [windowId]);

  return { updateHandlers };
}
