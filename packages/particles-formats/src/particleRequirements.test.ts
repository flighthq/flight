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
// A representative ParticleDesigner export, trimmed to the emitter parameters every one of them carries. The
// bare `<plist><dict></dict></plist>` this used to be is NOT one: the plist container is shared with Cocos
// spritesheets, so "is a plist" was never the same question as "is a particle config".
const PARTICLE_DESIGNER = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<plist version="1.0">',
  '<dict>',
  '  <key>maxParticles</key><integer>200</integer>',
  '  <key>emitterType</key><integer>0</integer>',
  '  <key>particleLifespan</key><real>1.0</real>',
  '</dict>',
  '</plist>',
].join('\n');

// The container alone, and a Cocos spritesheet plist: both are plists and neither is addressed to this family.
const BARE_PLIST = '<?xml version="1.0"?>\n<plist version="1.0"><dict></dict></plist>';
const COCOS_SPRITESHEET_PLIST = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<plist version="1.0">',
  '<dict>',
  '  <key>frames</key>',
  '  <dict><key>hero.png</key><dict><key>textureRect</key><string>{{0,0},{64,64}}</string></dict></dict>',
  '  <key>metadata</key>',
  '  <dict><key>textureFileName</key><string>atlas.png</string></dict>',
  '</dict>',
  '</plist>',
].join('\n');
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
    // ★ A PLIST IS A CONTAINER, NOT A FORMAT. Cocos writes spritesheets as plists and
    // `@flighthq/spritesheet-formats` reads them, so claiming every plist put this family's parser into any
    // build whose only plist was a sheet. The detector now asks for a key the emitter itself declares.
    ['a bare plist with no emitter keys', BARE_PLIST],
    ['a Cocos spritesheet plist', COCOS_SPRITESHEET_PLIST],
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

  // ★ THE DISCRIMINATION IS A KEY THE EMITTER DECLARES, NOT THE CONTAINER. Both documents below are well-formed
  // plists; only one is addressed to this family. Asserting the negative in the same place as the positive is what
  // keeps the two from drifting apart — the previous fixture was a bare plist, which passed while claiming every
  // plist in existence.
  it('claims a plist only when it declares an emitter key', () => {
    expect(keyOf(PARTICLE_DESIGNER)).toBe('particles.ParticleDesigner');
    expect(parseParticleRequirements(COCOS_SPRITESHEET_PLIST).requirements).toEqual([]);
    expect(parseParticleRequirements(BARE_PLIST).requirements).toEqual([]);
  });

  // Each of the three keys is sufficient on its own: an export that omits two of them is still an export, and the
  // parser reads every field with a default, so the detector must not demand a schema it does not need.
  it.each([
    ['maxParticles', '<key>maxParticles</key><integer>200</integer>'],
    ['particleLifespan', '<key>particleLifespan</key><real>1.0</real>'],
    ['emitterType', '<key>emitterType</key><integer>1</integer>'],
  ])('claims a plist declaring only %s', (_label, entry) => {
    const plist = `<?xml version="1.0"?>\n<plist version="1.0"><dict>${entry}</dict></plist>`;
    expect(keyOf(plist)).toBe('particles.ParticleDesigner');
  });

  // `particleLifespan` is a PREFIX of `particleLifespanVariance`, so the key is matched as a whole element. A
  // substring test would have accepted the variance key alone — and, worse, any sheet that happened to name a
  // frame after one of these words.
  it('matches a whole key element, not a substring of a longer key or a value', () => {
    const varianceOnly =
      '<?xml version="1.0"?>\n<plist version="1.0"><dict><key>particleLifespanVariance</key><real>0</real></dict></plist>';
    expect(parseParticleRequirements(varianceOnly).requirements).toEqual([]);
    const frameNamedLikeAKey =
      '<?xml version="1.0"?>\n<plist version="1.0"><dict><key>frames</key><dict><key>maxParticles.png</key><dict/></dict></dict></plist>';
    expect(parseParticleRequirements(frameNamedLikeAKey).requirements).toEqual([]);
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
