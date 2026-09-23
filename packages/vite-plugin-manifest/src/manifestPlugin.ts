import { readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, resolve } from 'node:path';

import { logWarn } from '@flighthq/log/contract';
import { findRequirementCatalogEntries } from '@flighthq/requirement-catalog/contract';
import type { NonEntityCreateResult, RequirementCatalog } from '@flighthq/types/contract';

import type { ContentAnalyzer } from './contentAnalyzers';
import { DEFAULT_CONTENT_ANALYZERS } from './contentAnalyzers';
import type { ManifestModuleEntry } from './manifestModuleSource';
import {
  generateManifestModuleSource,
  MANIFEST_BACKEND_EXPORTS,
  MANIFEST_PARSER_BACKEND,
} from './manifestModuleSource';

/** The import suffix that asks this plugin for a file's manifest instead of the file itself. */
export const MANIFEST_QUERY_SUFFIX = '?manifest';

/** What `createManifestPlugin` accepts. Every input is explicit; nothing is discovered by convention. */
export interface ManifestPluginOptions {
  /**
   * Extra or replacement analyzers by lowercase extension, merged over the built-in table. Supplying
   * one is how a project adds a format without this package learning it.
   */
  readonly analyzers?: Readonly<Record<string, ContentAnalyzer>>;
  /** The catalog mapping a requirement to the implementation that satisfies it, for every backend. */
  readonly catalog: Readonly<RequirementCatalog>;
  /**
   * Called for every unsupported format, unreadable file, analyzer failure and unresolved requirement.
   * Defaults to a warning on the `flight-manifest` channel through `@flighthq/log`. A requirement the
   * build cannot place is reported rather than skipped: silently dropping one is how a bundle ends up
   * missing an implementation it needed.
   */
  readonly onDiagnostic?: (message: string) => void;
}

/** The subset of Vite's plugin surface this factory produces. Structural, so Vite is a peer, not a dep. */
export interface ManifestPlugin {
  /**
   * Runs in Vite's `pre` stage. Without it Vite's own asset handling claims `./asset.swf?manifest`
   * first and hands rollup the binary to parse as JavaScript — the plugin must see the id before the
   * default resolver treats the path as a file to serve.
   */
  readonly enforce: 'pre';
  readonly handleHotUpdate: (context: { readonly file: string }) => void;
  readonly load: (id: string) => Promise<string | null>;
  readonly name: string;
  readonly resolveId: (id: string, importer?: string) => string | null;
}

/**
 * Creates the plugin. Explicit factory, no default export and no module-level state: importing this
 * package configures nothing.
 *
 * It intercepts a per-file import — `import { glOptions } from './asset.swf?manifest'` — reads THAT
 * file, picks the analyzer by extension, resolves the requirements against the catalog for every
 * backend, and serves a module of flat per-backend fragments. Per-file rather than project-wide
 * because the import graph is then the truth: a document nothing imports contributes nothing, and a
 * bundler can see which implementations each document actually pulled in.
 *
 * The pipeline is the SDK's own — `parse*Requirements` to read content, the catalog to resolve. This
 * package contributes the Vite lifecycle and the module text, nothing else.
 */
export function createManifestPlugin(
  options: Readonly<ManifestPluginOptions>,
): NonEntityCreateResult<ManifestPlugin, 'descriptor'> {
  const analyzers = { ...DEFAULT_CONTENT_ANALYZERS, ...options.analyzers };
  const report = options.onDiagnostic ?? ((message: string) => logWarn(message, MANIFEST_LOG_CHANNEL));
  // Keyed by the absolute content path, so invalidation is per imported source: editing one document
  // rebuilds that document's module and leaves every other file's cached module untouched.
  const sourceByPath = new Map<string, string>();

  async function build(path: string): Promise<string> {
    const extension = extname(path).toLowerCase();
    const analyze = analyzers[extension];
    if (analyze === undefined) {
      report(`unsupported content format, no analyzer for ${extension}: ${path}`);
      return generateManifestModuleSource([], extension);
    }
    let requirements;
    try {
      requirements = analyze(new Uint8Array(await readFile(path)));
    } catch (error) {
      report(`analyzer failed for ${path}: ${(error as Error).message}`);
      return generateManifestModuleSource([], extension);
    }

    const rows: ManifestModuleEntry[] = [];
    for (const requirement of requirements.requirements) {
      let placed = false;
      // Every backend is resolved, not a configured one: the module exports a fragment per backend and
      // the application's import decides which survive the bundle. The parser is queried alongside them
      // because parserOptions is one of those exports.
      for (const backend of MANIFEST_RESOLVED_BACKENDS) {
        for (const entry of findRequirementCatalogEntries(
          options.catalog,
          backend,
          requirement.facet,
          requirement.key,
        )) {
          rows.push({ entry, kind: requirement.key });
          placed = true;
        }
      }
      if (!placed) report(`no catalog entry for ${requirement.facet} ${requirement.key}: ${path}`);
    }
    return generateManifestModuleSource(rows, extension);
  }

  return {
    enforce: 'pre',
    handleHotUpdate: (context) => {
      sourceByPath.delete(context.file);
    },
    load: async (id) => {
      if (!id.startsWith(MANIFEST_RESOLVED_PREFIX)) return null;
      const path = id.slice(MANIFEST_RESOLVED_PREFIX.length);
      let source = sourceByPath.get(path);
      if (source === undefined) {
        source = await build(path);
        sourceByPath.set(path, source);
      }
      return source;
    },
    name: 'flight-manifest',
    resolveId: (id, importer) => {
      if (!id.endsWith(MANIFEST_QUERY_SUFFIX)) return null;
      const request = id.slice(0, -MANIFEST_QUERY_SUFFIX.length);
      const base = importer === undefined ? process.cwd() : dirname(importer);
      return `${MANIFEST_RESOLVED_PREFIX}${isAbsolute(request) ? request : resolve(base, request)}`;
    },
  };
}

// Rollup treats a leading NUL as "this id belongs to a plugin", which keeps the resolved id out of
// filesystem resolution while still carrying the path the module was built from.
const MANIFEST_RESOLVED_PREFIX = '\0flight-manifest:';
const MANIFEST_LOG_CHANNEL = 'flight-manifest';
const MANIFEST_RESOLVED_BACKENDS = [...Object.keys(MANIFEST_BACKEND_EXPORTS), MANIFEST_PARSER_BACKEND].sort();
