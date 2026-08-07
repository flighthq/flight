import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SCAN_SKIP_DIRECTORIES } from './scanSkipDirectories';

describe('SCAN_SKIP_DIRECTORIES', () => {
  it('skips the fixture cache, which is the drift this set exists to have ended', () => {
    expect(SCAN_SKIP_DIRECTORIES.has('.cache')).toBe(true);
  });

  // The one entry whose ABSENCE is load-bearing. `docs.ts` builds its markdown corpus from this walk
  // and reads skill documents out of `.claude/skills`; adding `.claude` here would empty that half of
  // the corpus in the disk-mode fallback and turn documents a skill points at into reported orphans —
  // a gate going quiet in exactly the case it exists to catch. `order.ts` and `mocks.ts` skip
  // `.claude` at their own call sites instead, which is why this stays a per-scan concern.
  it('does not skip .claude, because the docs gate resolves its skills corpus from this same walk', () => {
    expect(SCAN_SKIP_DIRECTORIES.has('.claude')).toBe(false);
  });

  it('holds bare directory names rather than paths, since it is matched against one dirent at a time', () => {
    for (const name of SCAN_SKIP_DIRECTORIES) {
      expect(name).not.toContain('/');
      expect(name).not.toContain(join('a', 'b').slice(1, 2));
    }
  });

  it('carries only generated output and tool state, never a directory holding source or documents', () => {
    for (const name of ['agents', 'packages', 'scripts', 'examples', 'functional', 'tools', '.claude', '.github']) {
      expect(SCAN_SKIP_DIRECTORIES.has(name)).toBe(false);
    }
  });
});
