import { DomainError } from '../errors.js';

const LOBBY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DEFAULT_LOBBY_CODE_LENGTH = 6;

export function generateLobbyCode(random = Math.random): string {
  let code = '';

  for (let index = 0; index < DEFAULT_LOBBY_CODE_LENGTH; index += 1) {
    const offset = Math.floor(random() * LOBBY_CODE_ALPHABET.length);
    code += LOBBY_CODE_ALPHABET[offset];
  }

  return code;
}

export function normalizeLobbyCode(value: string): string {
  return value.trim().toUpperCase();
}

export function validateDisplayName(value: string): string {
  const displayName = value.trim();

  if (displayName.length < 2 || displayName.length > 24) {
    throw new DomainError(
      'INVALID_DISPLAY_NAME',
      'Display name must be between 2 and 24 characters.',
    );
  }

  return displayName;
}
