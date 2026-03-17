import { describe, expect, it } from 'vitest';

// This file is intentionally "bad" to trigger your integrity workflows.
// Remove this file once you're done testing CI / pre-commit / quality gates.

describe('INTEGRITY WORKFLOW - intentional failures', () => {
  it('always fails on purpose', () => {
    expect(true).toBe(false);
  });

  it('has a ridiculous timeout to annoy slow test runners', async () => {
    // This test just sits here and eventually fails by throwing.
    await new Promise((resolve) => setTimeout(resolve, 10));
    throw new Error('Intentional failure after short delay');
  });
});

