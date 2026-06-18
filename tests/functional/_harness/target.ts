import type { DisplayObject, RenderState, SceneGraphSyncPolicy } from '@flighthq/sdk';

// Shared shape for the per-backend functional-test targets. Test-scoped only — see ./README.md.
export interface FunctionalTargetOptions {
  // Logical stage size. The scene is authored against these, DPI-independent; the target sizes the
  // backing store and device transform from devicePixelRatio so it stays consistent across displays.
  width: number;
  height: number;
  // Packed RGBA background color. Omitted leaves the backend default.
  background?: number;
  // Node kinds the scene renders. The target registers the matching renderer (and shape commands /
  // default material) for the backend. Declare what the scene uses; the target wires the rest.
  kinds?: readonly symbol[];
  // Canvas/WebGL context attributes. Defaults to { alpha: false } for the opaque-stage tests.
  contextAttributes?: { alpha?: boolean };
  // Defaults to the render state default ('refreshDerivedState'); pass 'requiresInvalidation' for
  // tests that drive their own invalidation.
  syncPolicy?: SceneGraphSyncPolicy;
}

export interface FunctionalTarget {
  state: RenderState;
  // Logical stage size the scene is authored against (matches the requested width/height). DPI lives
  // in the device transform, not the scene, so the scene is authored in these logical units directly.
  width: number;
  height: number;
  render(root: DisplayObject): void;
}
