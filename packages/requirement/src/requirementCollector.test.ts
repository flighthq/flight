// Generated from crates/flight-requirement/tests/requirement_collector_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { collectScene2DRequirements, reportRequirement } from './contract.ts';
import type { Requirement } from './contract.ts';

describe('collectScene2DRequirements', () => {
  function reportSceneFacts(sink: Requirement[]): void {
    reportRequirement(sink, 'scene.node-kind', 'Shape');
    reportRequirement(sink, 'scene.blend-mode', 'Multiply');
    reportRequirement(sink, 'scene.node-kind', 'Shape');
  }
  it('returns distinct sorted facts and the exact inspected facets', () => {
    const result = collectScene2DRequirements(reportSceneFacts);
    expect(result.covers).toEqual([
      'scene.blend-mode',
      'scene.material-kind',
      'scene.node-kind',
      'scene.shape-command',
    ]);
    expect(result.requirements).toEqual([
      { facet: 'scene.blend-mode', key: 'Multiply' },
      { facet: 'scene.node-kind', key: 'Shape' },
    ]);
  });
});

describe('reportRequirement', () => {
  it('records only when a collector is engaged', () => {
    let sink: Requirement[] = [] as never[];
    reportRequirement(undefined, 'scene.node-kind', 'Ignored');
    reportRequirement(sink, 'scene.node-kind', 'Shape');
    expect(sink).toEqual([{ facet: 'scene.node-kind', key: 'Shape' }]);
  });
});
