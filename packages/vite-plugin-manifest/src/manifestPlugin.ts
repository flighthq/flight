import { readdir, readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, resolve } from 'node:path';

import { logWarn } from '@flighthq/log/contract';
import { createRequirementCodegenPlan } from '@flighthq/requirement-codegen/contract';
import { mergeRequirementSets } from '@flighthq/requirement/contract';
import type { NonEntityCreateResult, RequirementCatalog, RequirementSet } from '@flighthq/types/contract';

import type { ContentAnalyzer } from './contentAnalyzers';
import { DEFAULT_CONTENT_ANALYZERS } from './contentAnalyzers';
import { generateRequirementModuleSource } from './requirementModuleSource';

/** The specifier an application imports to reach the generated registration module. */
export const MANIFEST_VIRTUAL_MODULE_ID = 'virtual:flight-manifest';

/** What `createManifestPlugin` accepts. Every input is explicit; nothing is discovered by convention. */
export interface ManifestPluginOptions {
  /**
   * Extra or replacement analyzers by lowercase extension, merged over the built-in table. Supplying
   * one is how a project adds a format without this package learning it.
   */
  readonly analyzers?: Readonly<Record<string, ContentAnalyzer>>;
  /** The backend whose catalog rows the plan resolves against, for example `canvas` or `webgl`. */
  readonly backend: string;
  /** The catalog mapping a requirement to the registrar that satisfies it. */
  readonly catalog: Readonly<RequirementCatalog>;
  /** Directories to scan, relative to the Vite project root unless absolute. */
  readonly contentDirectories: readonly string[];
  /**
   * Called for every file whose extension has no analyzer, and for every analyzer that throws.
   *
   * Defaults to a warning on the `flight-manifest` channel through `@flighthq/log`. A file the build
   * cannot read is reported rather than skipped: silently ignoring content is how a bundle ends up
   * missing a registrar it needed.
   */
  readonly onDiagnostic?: (message: string) => void;
}

/** The subset of Vite's plugin surface this factory produces. Structural, so Vite is a peer, not a dep. */
export interface ManifestPlugin {
  readonly buildStart: () => Promise<void>;
  readonly configResolved: (config: { readonly root: string }) => void;
  readonly handleHotUpdate: (context: { readonly file: string }) => void;
  readonly load: (id: string) => Promise<string | null>;
  readonly name: string;
  readonly resolveId: (id: string) => string | null;
}

/**
 * Creates the plugin. Explicit factory, no default export and no module-level state: importing this
 * package configures nothing, which is what lets a config file decide when the scan happens.
 *
 * The pipeline it drives is the SDK's own — `parse*Requirements` to read content, `mergeRequirementSets`
 * to combine, the catalog to resolve, `createRequirementCodegenPlan` to plan. This package contributes
 * the Vite lifecycle and the module text, nothing else.
 */
export function createManifestPlugin(
  options: Readonly<ManifestPluginOptions>,
): NonEntityCreateResult<ManifestPlugin, 'descriptor'> {
  const analyzers = { ...DEFAULT_CONTENT_ANALYZERS, ...options.analyzers };
  const resolvedVirtualId = `\0${MANIFEST_VIRTUAL_MODULE_ID}`;
  const report = options.onDiagnostic ?? ((message: string) => logWarn(message, MANIFEST_LOG_CHANNEL));
  let root = process.cwd();
  let source: string | null = null;

  async function build(): Promise<string> {
    const sets: RequirementSet[] = [];
    // Directories and their entries are both walked in sorted order so the merged set, and therefore
    // the emitted module, does not depend on filesystem enumeration order.
    for (const directory of [...options.contentDirectories].sort()) {
      const absolute = isAbsolute(directory) ? directory : resolve(root, directory);
      let names: string[];
      try {
        names = (await readdir(absolute)).sort();
      } catch {
        report(`content directory not readable: ${directory}`);
        continue;
      }
      for (const name of names) {
        const analyze = analyzers[extname(name).toLowerCase()];
        if (analyze === undefined) {
          report(`unsupported content format, skipped: ${join(directory, name)}`);
          continue;
        }
        try {
          sets.push(analyze(new Uint8Array(await readFile(join(absolute, name)))));
        } catch (error) {
          // One unreadable file must not lose the requirements of every other file in the build.
          report(`analyzer failed for ${join(directory, name)}: ${(error as Error).message}`);
        }
      }
    }
    const plan = createRequirementCodegenPlan(options.catalog, mergeRequirementSets(sets), options.backend);
    for (const requirement of plan.unresolved) {
      report(`no catalog entry for ${requirement.facet} ${requirement.key} on backend ${options.backend}`);
    }
    return generateRequirementModuleSource(plan);
  }

  return {
    buildStart: async () => {
      source = await build();
    },
    configResolved: (config) => {
      root = config.root;
    },
    // Content files are inputs no module graph knows about, so a change to one cannot invalidate the
    // virtual module by itself. Dropping the cache is what makes the next load rescan.
    handleHotUpdate: (context) => {
      if (analyzers[extname(context.file).toLowerCase()] !== undefined) source = null;
    },
    load: async (id) => {
      if (id !== resolvedVirtualId) return null;
      source ??= await build();
      return source;
    },
    name: 'flight-manifest',
    resolveId: (id) => (id === MANIFEST_VIRTUAL_MODULE_ID ? resolvedVirtualId : null),
  };
}

const MANIFEST_LOG_CHANNEL = 'flight-manifest';
