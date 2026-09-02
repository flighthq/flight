import type { ImportDiagnostic } from '@flighthq/types/contract';

import { parseLibgdxAtlasSpritesheet } from './libgdxAtlasParse';

const MINIMAL_ATLAS = `
atlas.png
  size: 128, 64
  format: RGBA8888
  filter: Linear, Linear
  repeat: none
hero
  rotate: false
  xy: 0, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: -1
coin
  rotate: false
  xy: 64, 0
  size: 32, 32
  orig: 32, 32
  offset: 0, 0
  index: -1
`;

// Animations are inferred from the `baseName_NNN` frame-naming convention.
const ANIMATED_ATLAS = `
run.png
  size: 256, 64
  format: RGBA8888
  filter: Nearest, Nearest
  repeat: none
run_0
  rotate: false
  xy: 0, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: -1
run_1
  rotate: false
  xy: 64, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: -1
run_2
  rotate: false
  xy: 128, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: -1
`;

describe('parseLibgdxAtlasSpritesheet', () => {
  it('parses frame names', () => {
    const data = parseLibgdxAtlasSpritesheet(MINIMAL_ATLAS);
    expect(data.frames).toHaveLength(2);
    expect(data.frames[0]?.name).toBe('hero');
    expect(data.frames[1]?.name).toBe('coin');
  });

  it('parses frame positions and dimensions', () => {
    const data = parseLibgdxAtlasSpritesheet(MINIMAL_ATLAS);
    expect(data.frames[0]?.x).toBe(0);
    expect(data.frames[0]?.y).toBe(0);
    expect(data.frames[0]?.width).toBe(64);
    expect(data.frames[0]?.height).toBe(64);
    expect(data.frames[1]?.x).toBe(64);
    expect(data.frames[1]?.y).toBe(0);
    expect(data.frames[1]?.width).toBe(32);
    expect(data.frames[1]?.height).toBe(32);
  });

  it('parses page image file and dimensions', () => {
    const data = parseLibgdxAtlasSpritesheet(MINIMAL_ATLAS);
    expect(data.imageFile).toBe('atlas.png');
    expect(data.imageWidth).toBe(128);
    expect(data.imageHeight).toBe(64);
  });

  it('infers animations from baseName_NNN frame names', () => {
    const data = parseLibgdxAtlasSpritesheet(ANIMATED_ATLAS);
    expect(data.frames).toHaveLength(3);
    expect(data.frames[0]?.name).toBe('run_0');
    expect(data.animations).toHaveLength(1);
    expect(data.animations[0]?.name).toBe('run');
    expect(data.animations[0]?.frameNames).toEqual(['run_0', 'run_1', 'run_2']);
    expect(data.animations[0]?.repeatCount).toBe(-1);
  });

  it('respects custom frameDuration option', () => {
    const data = parseLibgdxAtlasSpritesheet(ANIMATED_ATLAS, { frameDuration: 200 });
    expect(data.animations[0]?.frameDuration).toBe(200);
  });

  it('sets non-indexed frames without rotation', () => {
    const data = parseLibgdxAtlasSpritesheet(MINIMAL_ATLAS);
    expect(data.frames[0]?.rotated).toBe(false);
  });

  it('emits no diagnostics on well-formed atlas with page header', () => {
    const diagnostics: ImportDiagnostic[] = [];
    parseLibgdxAtlasSpritesheet(MINIMAL_ATLAS, undefined, diagnostics);
    expect(diagnostics).toHaveLength(0);
  });

  it('emits Recover diagnostic when page has no filename', () => {
    const noPageAtlas = `
hero
  rotate: false
  xy: 0, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: -1
`;
    const diagnostics: ImportDiagnostic[] = [];
    const data = parseLibgdxAtlasSpritesheet(noPageAtlas, undefined, diagnostics);
    expect(data.imageFile).toBe('');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].kind).toBe('spritesheet.libgdx-atlas.missing-page-header');
    expect(diagnostics[0].severity).toBe('Recover');
  });
});
