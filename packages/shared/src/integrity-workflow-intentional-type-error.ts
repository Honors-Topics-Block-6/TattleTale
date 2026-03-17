// This file is intentionally wrong to trigger shared package integrity checks.
// It should cause TypeScript build failures when running the shared build.

export interface IntegrityWorkflowBadInterface {
  id: string;
  // @ts-expect-error - invalid type on purpose
  createdAt: Date | 'totally-not-a-date';
}

export function integrityWorkflowSharedBadFunction(): number {
  // @ts-expect-error - assigning string to number on purpose
  const value: number = 'not-a-number';

  // @ts-ignore - property does not exist
  value.thisPropertyDoesNotExist();

  return value;
}

