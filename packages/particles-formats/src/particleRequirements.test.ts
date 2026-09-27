import { RequirementFacet } from '@flighthq/types/contract';

import {
  isReadableParticleConfig,
  PARTICLE_REQUIREMENT_KEY_NAMESPACE,
  parseParticleRequirements,
} from './particleRequirements.ts';

// One minimal document per built-in codec, in the registry's own detection order: Libgdx, StarlingPex,
// ParticleDesigner, Unity, Pixi, Spine. Each is the smallest text that codec's `detect` accepts.
const LIBGDX = 'Particle Effect\n- Delay -\ndelay: 0\n';
const STARLING_PEX = '<?xml version="1.0"?>\n<particleEmitterConfig></particleEmitterConfig>';
const PARTICLE_DESIGNER = '<?xml version="1.0"?>\n<plist version="1.0"><dict></dict></plist>';
const UNITY = JSON.stringify({ startLifetime: { mode: 'TwoConstants' } });
const PIXI = JSON.stringify({ alpha: { end: 0, start: 1 }, pos: { x: 0, y: 0 } });
const SPINE = JSON.stringify({ continuous: true });

describe('isReadableParticleConfig', () => {
  it.each([
    ['Libgdx', LIBGDX],
    ['StarlingPex', STARLING_PEX],
    ['ParticleDesigner', PARTICLE_DESIGNER],
    ['Unity', UNITY],
    ['Pixi', PIXI],
    ['Spine', SPINE],
  ])('recognises a %s document', (_kind, text) => {
    expect(isReadableParticleConfig(text)).toBe(true);
  });

  // ★ UNKNOWN CONTENT STAYS UNREADABLE RATHER THAN CLAIMING A FALLBACK. There is no default codec, so a build
  // that treated "unrecognised" as some format would ship an implementation that cannot read the file.
  it.each([
    ['empty text', ''],
    ['unrelated JSON', '{"hello":"world"}'],
    ['unrelated XML', '<?xml version="1.0"?><root/>'],
    ['malformed JSON', '{ not json'],
    ['prose', 'this is not a particle config'],
  ])('reports %s unreadable', (_label, text) => {
    expect(isReadableParticleConfig(text)).toBe(false);
  });
});

describe('parseParticleRequirements', () => {
  it.each([
    ['Libgdx', LIBGDX],
    ['StarlingPex', STARLING_PEX],
    ['ParticleDesigner', PARTICLE_DESIGNER],
    ['Unity', UNITY],
    ['Pixi', PIXI],
    ['Spine', SPINE],
  ])('emits exactly the requirement for the %s codec', (kind, text) => {
    expect(parseParticleRequirements(text).requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: `${PARTICLE_REQUIREMENT_KEY_NAMESPACE}.${kind}` },
    ]);
  });

  it('emits nothing for content no codec recognises', () => {
    expect(parseParticleRequirements('{"hello":"world"}').requirements).toEqual([]);
  });

  // ★ THE REGISTRY'S OWN WINNER, NOT A SECOND OPINION. A plist is XML, so the StarlingPex codec's `isXml` half
  // is satisfied by a ParticleDesigner document too — the two only differ on which element they look for, and
  // registration order is what settles any text both accept. Asserting the winner here is what proves this
  // function asks the registry rather than re-deciding: a re-implementation could reasonably pick either.
  it('returns the registry-defined winner for content more than one codec inspects', () => {
    expect(keyOf(PARTICLE_DESIGNER)).toBe('particles.ParticleDesigner');
    expect(keyOf(STARLING_PEX)).toBe('particles.StarlingPex');
  });

  // Unity and Spine both read JSON objects and both key off value SHAPES rather than a marker, so a document
  // carrying both discriminants is accepted by both codecs. Unity registers first, so Unity wins.
  it('gives Unity precedence over Spine for a document both accept, as registration order does', () => {
    const both = JSON.stringify({ continuous: true, startLifetime: { mode: 'TwoConstants' } });
    expect(keyOf(both)).toBe('particles.Unity');
  });

  it('covers the document.format facet, so a build knows the question was asked', () => {
    expect(parseParticleRequirements(LIBGDX).covers).toEqual([RequirementFacet.DocumentFormat]);
  });

  it('namespaces the key, since Spine and Unity are names other families reuse', () => {
    expect(keyOf(SPINE)!.startsWith(`${PARTICLE_REQUIREMENT_KEY_NAMESPACE}.`)).toBe(true);
  });
});

function keyOf(text: string): string | undefined {
  return parseParticleRequirements(text).requirements[0]?.key;
}
