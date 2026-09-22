import type { Manifest } from './manifest.js';
import { createManifest } from './manifest.js';

/**
 * Layers `extension` over `base`: feature arrays are ADDITIVE (the union of both), scalar settings are
 * OVERRIDDEN by the extension.
 *
 * The asymmetry is the point. A feature array says "this build needs these", so dropping one because a
 * later layer did not mention it would silently narrow the build — two layers each needing one handler
 * must yield both. A scalar says "this build is configured this way", where two answers is a conflict
 * and the later layer is the one that spoke last.
 */
export function extendManifest(base: Readonly<Manifest>, extension: Readonly<Manifest>): Manifest {
  const features: Record<string, readonly string[]> = { ...base.features };
  for (const [group, ids] of Object.entries(extension.features)) {
    features[group] = [...(features[group] ?? []), ...ids];
  }
  return createManifest(features, { ...base.settings, ...extension.settings });
}

/**
 * Folds several manifests into one, left to right, with `extendManifest`'s rules — so features union
 * and the last manifest to name a setting wins.
 *
 * Deliberately no conflict detection: two builds legitimately disagree about a scalar, and deciding
 * which is right is the caller's policy, not this function's. `diffManifest` is where disagreement is
 * made visible.
 */
export function unionManifests(manifests: readonly Readonly<Manifest>[]): Manifest {
  return manifests.reduce<Manifest>((accumulated, manifest) => extendManifest(accumulated, manifest), createManifest());
}
