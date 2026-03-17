// This file intentionally introduces a TypeScript error for integrity testing.
// Remove this file once you're done testing CI / type-check workflows.

export function integrityWorkflowIntentionalTypeError(): number {
  // @ts-expect-error - assigning a string to a number on purpose
  const definitelyANumber: number = 'this is not a number';

  // @ts-ignore - calling a non-existent method on purpose
  (definitelyANumber as unknown as { notAMethod(): void }).notAMethod();

  return definitelyANumber;
}

