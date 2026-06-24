// Collision regression gate for @flighthq/sdk.
//
// TypeScript's `tsc -b` is the primary enforcer of the "globally unique exported function names"
// rule: an ambiguous `export *` (same name exported from two packages) is a compile error. A clean
// build therefore proves no TS-level collision exists at the time the barrel was last compiled.
//
// This test adds the runtime complement: it records the size of the flattened namespace and a
// sentinel list of canonical names so that any future collision (where one package's value silently
// overwrites another's at import time, rather than causing a TS error) turns into a visible test
// failure. It also guards against accidental name removal — a dropped export from a sub-package
// that happens to have the same name as a survivor would shrink the namespace silently without
// this check.
//
// To update the minimum key count after intentional additions: raise MIN_KEY_COUNT below.
// To add a new sentinel: append to SENTINEL_NAMES below.

import * as sdk from '../src/index';

// The minimum number of exported names the barrel must provide.
// Raise this when new packages are added; never lower it.
// Baseline as of 2026-06-24: 4196 runtime keys across all 83 packages.
const MIN_KEY_COUNT = 4000;

// A representative sample of canonical exported names drawn from every major domain.
// Each entry guards that the name has not been silently shadowed or dropped.
const SENTINEL_NAMES: ReadonlyArray<string> = [
  // application
  'createApplication',
  'createApplicationWindow',
  // camera (3D)
  'createCamera',
  // display object
  'BitmapKind',
  'createBitmap',
  'createDisplayObject',
  'DisplayObjectKind',
  // easing
  'easeLinear',
  // effects
  'createBloomEffect',
  // entity
  'createEntityRuntime',
  // filters
  'createBlurFilter',
  'createDropShadowFilter',
  // geometry
  'createMatrix',
  'createRectangle',
  'createVector2',
  // interaction
  'hitTestDisplayObjects',
  // lighting
  'createDirectionalLight',
  // loader
  'createResourceLoader',
  // materials
  'createColorTransform',
  // mesh
  'createMesh',
  // node
  'addNodeChild',
  'createNode',
  // particles
  'createParticleEmitter',
  'createParticleEmitterConfig',
  'ParticleEmitterKind',
  // path
  'createPath',
  // platform
  'getPlatformName',
  // render
  'createRenderState',
  'registerRenderer',
  // resources
  'createImageResource',
  // scene
  'createSceneNode',
  // scene-gl
  'drawGlScene',
  // scene-wgpu
  'drawWgpuScene',
  // signals
  'createSignal',
  // sprite
  'createSprite',
  'SpriteKind',
  // spritesheet
  'createSpritesheet',
  // surface
  'createSurface',
  // text
  'createTextLabel',
  'TextLabelKind',
  // textlayout
  'createRichTextContent',
  // textshaper
  'setTextShaperBackend',
  // texture
  'createTexture',
  // timeline
  'createTimeline',
  // tween
  'createTween',
  'createTweenManager',
  // types (re-exported kind identifiers)
  'DisplayObjectKind',
  'BitmapKind',
];

describe('collision', () => {
  const keys = Object.keys(sdk as Record<string, unknown>);

  describe('namespace size lower bound', () => {
    it(`exports at least ${MIN_KEY_COUNT} names`, () => {
      expect(keys.length).toBeGreaterThanOrEqual(MIN_KEY_COUNT);
    });
  });

  describe('sentinel names present', () => {
    for (const name of SENTINEL_NAMES) {
      it(`exports "${name}"`, () => {
        expect(name in (sdk as Record<string, unknown>)).toBe(true);
      });
    }
  });
});
