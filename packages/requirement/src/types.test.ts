// Generated from crates/flight-requirement/tests/types_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { getRequirementFacetString, parseRequirementFacet } from './contract.ts';

describe('getRequirementFacetString', () => {
  it('returns every exact ts facet string', () => {
    const cases = [
      ['compression.kind', 'compression.kind'],
      ['document.format', 'document.format'],
      ['physics2d.joint-kind', 'physics2d.joint-kind'],
      ['scene.blend-mode', 'scene.blend-mode'],
      ['scene.material-kind', 'scene.material-kind'],
      ['scene.modifier-kind', 'scene.modifier-kind'],
      ['scene.node-kind', 'scene.node-kind'],
      ['scene.resource-mime-type', 'scene.resource-mime-type'],
      ['scene.shape-command', 'scene.shape-command'],
      ['scene.texture-source-kind', 'scene.texture-source-kind'],
    ] as const;
    for (const [facet, string] of cases) {
      expect(getRequirementFacetString(facet)).toEqual(string);
    }
  });
});

describe('parseRequirementFacet', () => {
  it('round trips exact strings and rejects other spellings', () => {
    const facets = [
      'compression.kind',
      'document.format',
      'physics2d.joint-kind',
      'scene.blend-mode',
      'scene.material-kind',
      'scene.modifier-kind',
      'scene.node-kind',
      'scene.resource-mime-type',
      'scene.shape-command',
      'scene.texture-source-kind',
    ] as const;
    for (const facet of facets) {
      expect(parseRequirementFacet(getRequirementFacetString(facet))).toEqual(facet);
    }
    expect(parseRequirementFacet('SceneNodeKind')).toEqual(undefined);
    expect(parseRequirementFacet('')).toEqual(undefined);
  });
});
