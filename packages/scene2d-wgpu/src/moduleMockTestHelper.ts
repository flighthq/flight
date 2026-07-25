import { afterAll, beforeAll, vi } from 'vitest';

/**
 * Makes vi.doMock-based module mocking safe under the shared (isolate:false) worker the root vitest
 * config uses. Call once at the top of a test file with every module id the file mocks, then apply
 * the mocks and dynamically import the subject inside a beforeAll — both must stay in the test file
 * so relative ids resolve against it. (This helper is colocated in the same package src, so the
 * doUnmock ids passed here resolve to the same modules the test's doMock ids do.)
 *
 * It brackets the file with two vi.resetModules() calls. The first is registered here so it runs
 * before the file's own beforeAll applies the mocks: it forces a subject a sibling already evaluated
 * against the real modules to re-evaluate under the mocks (otherwise the dynamic import returns the
 * cached, real-bound copy). The second, after unmocking, drops the mocked instances so a later file
 * re-imports the real modules instead of the mock left in the shared registry.
 */
export function scopeModuleMocks(mockedIds: readonly string[]): void {
  beforeAll(() => {
    vi.resetModules();
  });
  afterAll(() => {
    for (const id of mockedIds) vi.doUnmock(id);
    vi.resetModules();
  });
}
