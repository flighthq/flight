import type { Manifest } from './manifest.js';

/**
 * How one feature id is reached in generated code: the binding to import and the module to import it
 * from. `spread` marks a binding that is an array whose elements belong in the output array, which is
 * what lets a family constant and a single handler sit side by side in one generated literal.
 */
export interface ManifestImportEntry {
  readonly binding: string;
  readonly module: string;
  readonly spread?: boolean;
}

/**
 * Feature id to import, per group: `registry[group][featureId]`.
 *
 * Supplied by the caller as data — the domain that owns a group owns its registry. This package never
 * ships one, which is why it can generate code for a format it knows nothing about.
 */
export type ManifestImportRegistry = Readonly<Record<string, Readonly<Record<string, ManifestImportEntry>>>>;

/** The imports a manifest resolves to, plus every feature the registry could not place. */
export interface ManifestImportResolution {
  readonly entries: Readonly<Record<string, readonly ManifestImportEntry[]>>;
  readonly missing: readonly string[];
}

/**
 * Resolves each required feature to its import entry, preserving the manifest's group order and the
 * sorted id order inside each group so the generated file is stable across runs.
 *
 * A feature with no registry entry goes to `missing` rather than being skipped: generating a file that
 * silently omits a handler the content needs is the failure this whole pipeline exists to prevent.
 */
export function resolveManifestImports(
  manifest: Readonly<Manifest>,
  registry: ManifestImportRegistry,
): ManifestImportResolution {
  const entries: Record<string, readonly ManifestImportEntry[]> = {};
  const missing: string[] = [];

  for (const group of Object.keys(manifest.features).sort()) {
    const groupRegistry = registry[group];
    const resolved: ManifestImportEntry[] = [];
    for (const id of manifest.features[group]!) {
      const entry = groupRegistry?.[id];
      if (entry === undefined) {
        missing.push(`${group}:${id}`);
        continue;
      }
      resolved.push(entry);
    }
    if (resolved.length > 0) entries[group] = resolved;
  }

  return { entries, missing: [...new Set(missing)].sort() };
}
