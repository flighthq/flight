import { describe, expect, it } from 'vitest';

import { createEmptyBackendLifecycleReport, formatBackendLifecycleReport } from './backend-lifecycle-core';
import { createEmptyBackendOperationSeamReport, formatBackendOperationSeamReport } from './backend-operation-seam-core';
import { createEmptyTransportBypassReport, formatTransportBypassReport } from './check-transport-bypasses';
import { GATE_PROVENANCE_FIELDS, formatGateProvenance, readGateTreeState } from './gate-provenance';
import { createEmptyP5HostBypassReport, formatP5HostBypassReport } from './p5-host-bypass';

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
//
// Every fixture below is built by its report type's own `createEmpty*Report` factory rather than
// written out here. These fixtures need a VALID report, never a particular one — nothing in this file
// reads a report's contents — so a hand-written literal would pin a field list this file has no reason
// to know, and would go stale the moment the report gained a field. That is not hypothetical: it is
// how `enforcedNames` broke the root typecheck at the `backend-lifecycle` entry.
describe('every derived gate prints its provenance', () => {
  const GATES: readonly { name: string; renderEmpty: () => string; renderPopulated: () => string }[] = [
    {
      name: 'backend-operation-seam',
      renderEmpty: () => formatBackendOperationSeamReport(createEmptyBackendOperationSeamReport()),
      renderPopulated: () =>
        formatBackendOperationSeamReport({
          ...createEmptyBackendOperationSeamReport(),
          enforced: 12,
          notMigrated: 32,
          total: 44,
        }),
    },
    {
      name: 'backend-lifecycle',
      renderEmpty: () => formatBackendLifecycleReport(createEmptyBackendLifecycleReport()),
      renderPopulated: () =>
        formatBackendLifecycleReport({
          ...createEmptyBackendLifecycleReport(),
          enforced: 3,
          noTeardownHook: 39,
          total: 42,
        }),
    },
    {
      name: 'check-transport-bypasses',
      renderEmpty: () => formatTransportBypassReport(createEmptyTransportBypassReport()),
      renderPopulated: () => formatTransportBypassReport({ ...createEmptyTransportBypassReport(), scannedFiles: 17 }),
    },
    {
      name: 'p5-host-bypass',
      renderEmpty: () => formatP5HostBypassReport(createEmptyP5HostBypassReport()),
      renderPopulated: () => formatP5HostBypassReport({ ...createEmptyP5HostBypassReport(), scannedFiles: 17 }),
    },
  ];

  for (const gate of GATES) {
    it(`${gate.name} carries command, tree, scope and counting`, () => {
      const text = gate.renderEmpty();
      for (const field of GATE_PROVENANCE_FIELDS) {
        expect(text).toContain(field);
      }
      // The command field must name a real entrypoint, not a placeholder.
      expect(text).toMatch(/gate {6}\S+.*\(scripts\/\S+\.ts\)/);
    });

    // ★ PROVENANCE IS SCOPED TO PROVENANCE. The header describes how a number was produced, so it must
    // depend on the gate's identity and the tree — never on the population it happens to be reporting.
    // Two renders whose report bodies differ must emit a byte-identical header; a formatter that
    // interpolated a count into `counting` would make the header describe one run instead of the method,
    // and this fails. The body assertion is what keeps this honest: it proves the two renders really do
    // differ, so an identical header is scoping rather than two identical outputs.
    it(`${gate.name} renders an identical provenance header whatever the report contains`, () => {
      const empty = gate.renderEmpty();
      const populated = gate.renderPopulated();
      expect(provenanceHeaderOf(populated)).toBe(provenanceHeaderOf(empty));
      expect(bodyOf(populated)).not.toBe(bodyOf(empty));
    });
  }
});

function bodyOf(text: string): string {
  return text.split('\n').slice(GATE_PROVENANCE_FIELDS.length).join('\n');
}

function provenanceHeaderOf(text: string): string {
  return text.split('\n').slice(0, GATE_PROVENANCE_FIELDS.length).join('\n');
}
