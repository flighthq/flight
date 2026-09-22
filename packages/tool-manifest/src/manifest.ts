// The manifest model, and the only file that decides what a manifest IS.
//
// Deliberately domain-agnostic: a manifest names FEATURE GROUPS and the feature ids inside them, and
// nothing here knows what a group means. A SWF or AWD2 domain contributes the vocabulary as data —
// group names, feature ids, and the mappings that produce them — so this package never has to learn a
// format to serve it, and a new domain needs no change here at all.

/** A scalar a manifest setting may hold. JSON-serializable by construction, like the whole model. */
export type ManifestScalar = boolean | number | string;

/**
 * One build's declared requirements: named groups of feature ids, plus scalar settings.
 *
 * Feature ids inside a group are kept sorted and unique so that two manifests describing the same build
 * are byte-identical once written — the property every downstream diff, hash and codegen step relies on.
 */
export interface Manifest {
  readonly features: Readonly<Record<string, readonly string[]>>;
  readonly schemaVersion: 1;
  readonly settings: Readonly<Record<string, ManifestScalar>>;
}

/** What `validateManifest` reports: the parsed manifest, or the reasons it is not one. */
export interface ManifestValidation {
  readonly manifest: Manifest | null;
  readonly problems: readonly string[];
}

export const MANIFEST_SCHEMA_VERSION = 1;

/**
 * A manifest with its groups and settings normalized — ids sorted and de-duplicated, groups in key
 * order. Passing nothing yields the empty manifest, which is the identity `unionManifests` folds from.
 */
export function createManifest(
  features: Readonly<Record<string, readonly string[]>> = {},
  settings: Readonly<Record<string, ManifestScalar>> = {},
): Manifest {
  const normalized: Record<string, readonly string[]> = {};
  for (const group of Object.keys(features).sort()) {
    normalized[group] = [...new Set(features[group])].sort();
  }
  const orderedSettings: Record<string, ManifestScalar> = {};
  for (const key of Object.keys(settings).sort()) orderedSettings[key] = settings[key]!;
  return { features: normalized, schemaVersion: MANIFEST_SCHEMA_VERSION, settings: orderedSettings };
}

/** The feature ids a group declares, or an empty array when the manifest does not name that group. */
export function getManifestFeatures(manifest: Readonly<Manifest>, group: string): readonly string[] {
  return manifest.features[group] ?? [];
}

/**
 * Parses JSON text into a manifest. Returns the problems rather than throwing, because the input is a
 * file a user wrote and every reason it is unusable is worth reporting at once.
 */
export function readManifest(text: string): ManifestValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { manifest: null, problems: [`not valid JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  return validateManifest(parsed);
}

/**
 * Checks an unknown value against the model and normalizes it on success. Every problem is collected,
 * so a malformed file reports all of its faults in one run instead of one per fix.
 */
export function validateManifest(value: unknown): ManifestValidation {
  const problems: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { manifest: null, problems: ['manifest must be an object'] };
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    problems.push(`schemaVersion must be ${MANIFEST_SCHEMA_VERSION}, got ${JSON.stringify(record.schemaVersion)}`);
  }

  const features: Record<string, readonly string[]> = {};
  if (record.features !== undefined) {
    if (typeof record.features !== 'object' || record.features === null || Array.isArray(record.features)) {
      problems.push('features must be an object');
    } else {
      for (const [group, ids] of Object.entries(record.features as Record<string, unknown>)) {
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
          problems.push(`features.${group} must be an array of strings`);
          continue;
        }
        features[group] = ids as readonly string[];
      }
    }
  }

  const settings: Record<string, ManifestScalar> = {};
  if (record.settings !== undefined) {
    if (typeof record.settings !== 'object' || record.settings === null || Array.isArray(record.settings)) {
      problems.push('settings must be an object');
    } else {
      for (const [key, setting] of Object.entries(record.settings as Record<string, unknown>)) {
        if (typeof setting !== 'boolean' && typeof setting !== 'number' && typeof setting !== 'string') {
          problems.push(`settings.${key} must be a boolean, number, or string`);
          continue;
        }
        settings[key] = setting;
      }
    }
  }

  return problems.length > 0
    ? { manifest: null, problems }
    : { manifest: createManifest(features, settings), problems: [] };
}

/**
 * Serializes a manifest as JSON with a trailing newline. `createManifest` already ordered the keys, so
 * the same manifest always writes the same bytes and a diff of two builds shows only real differences.
 */
export function writeManifest(manifest: Readonly<Manifest>): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
