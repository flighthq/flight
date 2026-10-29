// Generated from crates/flight-requirement/tests/requirement_set_raw_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import * as flightEntity from '@flighthq/entity/contract';
import { describe, expect, it } from 'vitest';

import {
  createRequirementSet,
  diffRequirementSets,
  initializeRequirementSet,
  mergeRequirementSets,
} from './contract.ts';
import type { Requirement, RequirementFacet } from './contract.ts';

function requirement(facet: RequirementFacet, key: string): Requirement {
  return { facet: facet, key: String(key) };
}

describe('createRequirementSet', () => {
  it('copies sorts and deduplicates both dimensions', () => {
    const covers = ['scene.node-kind', 'scene.blend-mode', 'scene.node-kind'] as const;
    let requirements = [
      requirement('scene.node-kind', 'Shape'),
      requirement('scene.blend-mode', 'Multiply'),
      requirement('scene.node-kind', 'Shape'),
    ];
    const result = createRequirementSet(covers, requirements);
    requirements.length = 0;
    expect(result.covers).toEqual(['scene.blend-mode', 'scene.node-kind']);
    expect(result.requirements).toEqual([
      requirement('scene.blend-mode', 'Multiply'),
      requirement('scene.node-kind', 'Shape'),
    ]);
  });
  it('orders keys by utf16 code unit across planes', () => {
    const covers: RequirementFacet[] = ['scene.node-kind'];
    const facts: Requirement[] = [requirement('scene.node-kind', '\u{e000}'), requirement('scene.node-kind', '𐀀')];
    const result = createRequirementSet(covers, facts);
    const expected: Requirement[] = [requirement('scene.node-kind', '𐀀'), requirement('scene.node-kind', '\u{e000}')];
    expect(result.requirements).toEqual(expected);
  });
  it('orders bmp keys by code unit with uppercase first', () => {
    const covers: RequirementFacet[] = ['scene.blend-mode'];
    const facts: Requirement[] = [
      requirement('scene.blend-mode', 'blend'),
      requirement('scene.blend-mode', 'acme.Blend'),
      requirement('scene.blend-mode', 'Multiply'),
    ];
    const result = createRequirementSet(covers, facts);
    const expected: Requirement[] = [
      requirement('scene.blend-mode', 'Multiply'),
      requirement('scene.blend-mode', 'acme.Blend'),
      requirement('scene.blend-mode', 'blend'),
    ];
    expect(result.requirements).toEqual(expected);
  });
  it('creates an entity with an empty runtime slot', () => {
    const result = createRequirementSet([], []);
    expect(!flightEntity.hasEntityRuntime(result)).toBe(true);
  });
});

describe('diffRequirementSets', () => {
  it('subtracts facts only for facets both operands cover', () => {
    const requirementsCovers: RequirementFacet[] = ['scene.blend-mode', 'scene.node-kind'];
    const requirementsFacts: Requirement[] = [
      requirement('scene.blend-mode', 'Multiply'),
      requirement('scene.node-kind', 'Shape'),
    ];
    const requirements = createRequirementSet(requirementsCovers, requirementsFacts);
    const baselineCovers: RequirementFacet[] = ['scene.node-kind'];
    const baselineFacts: Requirement[] = [requirement('scene.node-kind', 'Sprite')];
    const baseline = createRequirementSet(baselineCovers, baselineFacts);
    const result = diffRequirementSets(requirements, baseline);
    expect(result.covers).toEqual(['scene.node-kind']);
    expect(result.requirements).toEqual([requirement('scene.node-kind', 'Shape')]);
  });
  it('removes an identical fact within shared coverage', () => {
    const requirementsCovers: RequirementFacet[] = ['document.format'];
    const requirementsFacts: Requirement[] = [requirement('document.format', 'application/x-test')];
    const requirements = createRequirementSet(requirementsCovers, requirementsFacts);
    const baselineCovers: RequirementFacet[] = ['document.format'];
    const baselineFacts: Requirement[] = [requirement('document.format', 'application/x-test')];
    const baseline = createRequirementSet(baselineCovers, baselineFacts);
    const result = diffRequirementSets(requirements, baseline);
    expect(result.requirements.length === 0).toBe(true);
  });
});

describe('initializeRequirementSet', () => {
  it('replaces canonical data without replacing the entity runtime', () => {
    let out = createRequirementSet([], []);
    flightEntity.setEntityUid(out, 'requirement-set');
    const covers: RequirementFacet[] = ['scene.node-kind'];
    const facts: Requirement[] = [requirement('scene.node-kind', 'Shape')];
    initializeRequirementSet(out, covers, facts);
    expect(flightEntity.getEntityUid(out)).toEqual('requirement-set');
    expect(out.covers).toEqual(['scene.node-kind']);
    expect(out.requirements).toEqual([requirement('scene.node-kind', 'Shape')]);
  });
});

describe('mergeRequirementSets', () => {
  it('returns an empty set for no inputs', () => {
    const result = mergeRequirementSets([]);
    expect(result.covers.length === 0).toBe(true);
    expect(result.requirements.length === 0).toBe(true);
  });
  it('unions facts while intersecting completeness', () => {
    const firstCovers: RequirementFacet[] = ['scene.blend-mode', 'scene.node-kind'];
    const firstFacts: Requirement[] = [requirement('scene.node-kind', 'Shape')];
    const first = createRequirementSet(firstCovers, firstFacts);
    const secondCovers: RequirementFacet[] = ['scene.node-kind'];
    const secondFacts: Requirement[] = [
      requirement('scene.node-kind', 'Sprite'),
      requirement('scene.node-kind', 'Shape'),
    ];
    const second = createRequirementSet(secondCovers, secondFacts);
    const result = mergeRequirementSets([first, second]);
    expect(result.covers).toEqual(['scene.node-kind']);
    expect(result.requirements).toEqual([
      requirement('scene.node-kind', 'Shape'),
      requirement('scene.node-kind', 'Sprite'),
    ]);
  });
});
