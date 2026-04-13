import { createContext, useContext } from 'react';

export const SocketContext = createContext(null);

export function useSocket() {
  return useContext(SocketContext);
}
