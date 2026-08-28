import { describe, expect, it } from 'vitest';

import { formatBackendLifecycleReport } from './backend-lifecycle-core';
import { formatBackendOperationSeamReport } from './backend-operation-seam-core';
import { formatTransportBypassReport } from './check-transport-bypasses';
import { GATE_PROVENANCE_FIELDS, formatGateProvenance, readGateTreeState } from './gate-provenance';
import { formatP5HostBypassReport } from './p5-host-bypass';

const PROVENANCE = {
  command: 'npm run example (scripts/example.ts)',
  counting: 'one unit = one thing',
  scope: 'everything, minus nothing',
};

describe('formatGateProvenance', () => {
  it('emits all four fields', () => {
    const text = formatGateProvenance(PROVENANCE, { commit: 'abc123', dirty: false });
    for (const field of GATE_PROVENANCE_FIELDS) {
      expect(text).toContain(field);
    }
    expect(text).toContain('npm run example (scripts/example.ts)');
    expect(text).toContain('everything, minus nothing');
    expect(text).toContain('one unit = one thing');
  });

  // ★ The dirty marker is part of the tree's identity. A count measured on a dirty tree belongs to no
  // commit anyone can check out, so reporting the SHA alone would name a tree that was never measured.
  it('marks a clean tree clean and a dirty tree dirty', () => {
    expect(formatGateProvenance(PROVENANCE, { commit: 'abc123', dirty: false })).toContain('abc123 (clean)');
    expect(formatGateProvenance(PROVENANCE, { commit: 'abc123', dirty: true })).toContain('abc123 (dirty)');
  });

  it('names an unknown commit rather than omitting the tree line', () => {
    const text = formatGateProvenance(PROVENANCE, { commit: null, dirty: true });
    expect(text).toContain('tree');
    expect(text).toContain('unknown-commit');
  });
});

describe('readGateTreeState', () => {
  it('reads a commit for this repository', () => {
    const state = readGateTreeState(process.cwd());
    expect(state.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof state.dirty).toBe('boolean');
  });

  // Unknown is reported as DIRTY, never clean: claiming a clean tree that could not be verified is what
  // makes a count look reproducible when it is not.
  it('reports dirty when the directory is not a repository', () => {
    expect(readGateTreeState('/').dirty).toBe(true);
  });
});

// ★ THE INVENTORY, asserted rather than described. Every checked-in derived gate that prints a
// population must carry all four provenance fields. A new gate added without them fails here, and a
// mutation removing any one field from the shared helper fails for all four at once.
describe('every derived gate prints its provenance', () => {
  const GATES: readonly { name: string; render: () => string }[] = [
    {
      name: 'backend-operation-seam',
      render: () =>
        formatBackendOperationSeamReport({
          entries: [],
          enforced: 0,
          notMigrated: 0,
          total: 0,
          violations: [],
        }),
    },
    {
      name: 'backend-lifecycle',
      render: () =>
        formatBackendLifecycleReport({ entries: [], enforced: 0, noTeardownHook: 0, total: 0, violations: [] }),
    },
    {
      name: 'check-transport-bypasses',
      render: () => formatTransportBypassReport({ allowed: [], excluded: [], scannedFiles: 0, violations: [] }),
    },
    {
      name: 'p5-host-bypass',
      render: () => formatP5HostBypassReport({ excluded: [], p5: [], scannedFiles: 0 }),
    },
  ];

  for (const gate of GATES) {
    it(`${gate.name} carries command, tree, scope and counting`, () => {
      const text = gate.render();
      for (const field of GATE_PROVENANCE_FIELDS) {
        expect(text).toContain(field);
      }
      // The command field must name a real entrypoint, not a placeholder.
      expect(text).toMatch(/gate {6}\S+.*\(scripts\/\S+\.ts\)/);
    });
  }
});
