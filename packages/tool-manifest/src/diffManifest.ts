import type { Manifest } from './manifest.js';

/**
 * What a build needs measured against what its registry can supply, per feature group.
 *
 * `missing` is the one that fails a build: content needs a feature nothing provides. `unused` is the
 * opposite and is only ever advisory — a registry offering more than this build happens to need is
 * normal, and it is exactly what the selective-import story is meant to shake out.
 */
export interface ManifestDiff {
  readonly missing: Readonly<Record<string, readonly string[]>>;
  readonly supported: Readonly<Record<string, readonly string[]>>;
  readonly unused: Readonly<Record<string, readonly string[]>>;
}

/**
 * Compares the features a build requires against those available to it.
 *
 * Groups are compared independently, and a group named by only one side is handled as though the other
 * declared it empty — so a required group the registry has never heard of reports every one of its ids
 * as missing rather than being skipped for want of a counterpart.
 */
export function diffManifest(required: Readonly<Manifest>, available: Readonly<Manifest>): ManifestDiff {
  const missing: Record<string, readonly string[]> = {};
  const supported: Record<string, readonly string[]> = {};
  const unused: Record<string, readonly string[]> = {};

  for (const group of [...new Set([...Object.keys(required.features), ...Object.keys(available.features)])].sort()) {
    const requiredIds = required.features[group] ?? [];
    const availableIds = new Set(available.features[group] ?? []);
    const requiredSet = new Set(requiredIds);

    const supportedIds = requiredIds.filter((id) => availableIds.has(id));
    const missingIds = requiredIds.filter((id) => !availableIds.has(id));
    const unusedIds = [...availableIds].filter((id) => !requiredSet.has(id)).sort();

    if (supportedIds.length > 0) supported[group] = supportedIds;
    if (missingIds.length > 0) missing[group] = missingIds;
    if (unusedIds.length > 0) unused[group] = unusedIds;
  }

  return { missing, supported, unused };
}

/** True when nothing a build requires is absent from what is available. */
export function isManifestDiffSatisfied(diff: Readonly<ManifestDiff>): boolean {
  return Object.keys(diff.missing).length === 0;
}
