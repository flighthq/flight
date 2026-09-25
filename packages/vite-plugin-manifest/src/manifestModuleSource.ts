import type { RequirementBackend, RequirementCatalogEntry } from '@flighthq/types/contract';

import { BACKEND_OPTION_FIELDS, PARSER_HANDLER_FIELDS, REQUIREMENT_OPTION_FIELDS } from './requirementOptionFields';

/** The backends a manifest module always exports a fragment for, and the export name each one uses. */
export const MANIFEST_BACKEND_EXPORTS: Readonly<Record<string, string>> = Object.freeze({
  canvas: 'canvasOptions',
  dom: 'domOptions',
  gl: 'glOptions',
  wgpu: 'wgpuOptions',
});

/**
 * The second export per backend: a COMPLETE working configuration, usable as it stands.
 *
 * ★ WHY TWO. `canvasOptions` carries only what the CONTENT implies, which is the right thing to
 * tree-shake and the wrong thing to hand to `createCanvasRenderState`. A canvas state also needs the
 * shape-drawing command table and the blend-mode application, and neither can be a catalog row —
 * `blendModeApplication` is a plain function with no kind to key on. Spreading the content fragment
 * where a preset belonged therefore typechecked, built, and rendered a BLACK FRAME: shapes had
 * renderers and no commands to draw with, with nothing to report because every field present was
 * valid. So the module exports the composed object too, and the caller picks: `canvasOptions` to wire
 * the rest themselves, `canvasFullOptions` to get something that works.
 *
 * The composition happens HERE rather than at the call site so a consumer never has to know which
 * pieces a backend needs — that knowledge is exactly what they lacked when the frame came out black.
 * Only the host stays theirs, because it is a handle to their canvas and nothing else can supply it.
 */
export const MANIFEST_BACKEND_FULL_EXPORTS: Readonly<Record<string, string>> = Object.freeze({
  canvas: 'canvasFullOptions',
  dom: 'domFullOptions',
  gl: 'glFullOptions',
  wgpu: 'wgpuFullOptions',
});

/**
 * The catalog backend whose rows become `parserOptions` rather than a render-state fragment.
 *
 * A row's DESTINATION is its backend, not its facet: the same `document.format` requirement resolves
 * to a tag handler for the parser and to a node renderer for `canvas`, and only the catalog author
 * knows which row is which. Routing by facet alone would send both to the same place.
 */
export const MANIFEST_PARSER_BACKEND = 'parser';

/** One resolved row: the catalog entry, and the requirement kind it satisfies. */
export interface ManifestModuleEntry {
  readonly entry: Readonly<RequirementCatalogEntry>;
  readonly kind: string;
}

/** What the emitter produced, and every row it could not place. */
export interface ManifestModuleResult {
  /** Rows dropped with the reason, so a caller reports them instead of losing them silently. */
  readonly problems: readonly string[];
  readonly source: string;
}

/**
 * Emits the per-file manifest module for one content file.
 *
 * Flat named exports — `canvasOptions`, `glOptions`, `wgpuOptions`, `domOptions`, `parserOptions` — so
 * an application writes `import { glOptions } from './asset.swf?manifest'` and spreads it straight
 * into `createGlRenderState`. Flat flat named bindings are what make the module shakable: a bundler
 * that sees only `glOptions` imported can drop every other fragment AND the implementation modules
 * only they referenced, which it could not do if the fragments hung off one default object.
 *
 * Every referenced symbol gets a precise named import from the module the catalog row names. There is
 * no barrel import and no dynamic lookup, so the import graph states exactly which implementations
 * this one file needs.
 *
 * Deterministic: imports are grouped by module with modules and symbols sorted, map entries are
 * emitted in sorted kind order, and array entries keep catalog order. The same inputs always produce
 * byte-identical source.
 */
export function generateManifestModuleSource(
  rows: readonly ManifestModuleEntry[],
  extension: string,
  backends: readonly Readonly<RequirementBackend>[] = [],
): ManifestModuleResult {
  const importsByModule = new Map<string, Set<string>>();
  const byBackend = new Map<string, ManifestModuleEntry[]>();
  const parserRows: ManifestModuleEntry[] = [];

  const problems: string[] = [];
  for (const row of rows) {
    if (row.entry.backend === MANIFEST_PARSER_BACKEND) {
      addImport(importsByModule, row.entry.implementationImport, row.entry.implementationSymbol);
      parserRows.push(row);
      continue;
    }
    // Two ways a render-backend row cannot be placed, and NEITHER is a silent skip. A facet with no
    // render-state field at all (compression, physics, resource mime type) has nowhere to go; and a
    // field this particular backend does not declare — blendRealizations on WGPU, say — would emit a
    // fragment that spreads into nothing. Both are reported so the build can see what it lost.
    const field = REQUIREMENT_OPTION_FIELDS[row.entry.facet];
    if (field === undefined) {
      problems.push(
        `facet ${row.entry.facet} has no render-state options field: dropped ${row.kind} for ${row.entry.backend}`,
      );
      continue;
    }
    const accepted = BACKEND_OPTION_FIELDS[row.entry.backend];
    if (accepted === undefined) {
      problems.push(`unknown backend ${row.entry.backend}: dropped ${row.entry.facet} ${row.kind}`);
      continue;
    }
    if (!accepted.has(field)) {
      problems.push(`backend ${row.entry.backend} has no ${field} field: dropped ${row.entry.facet} ${row.kind}`);
      continue;
    }
    addImport(importsByModule, row.entry.implementationImport, row.entry.implementationSymbol);
    let list = byBackend.get(row.entry.backend);
    if (list === undefined) {
      list = [];
      byBackend.set(row.entry.backend, list);
    }
    list.push(row);
  }

  const lines: string[] = [
    '// GENERATED by @flighthq/vite-plugin-manifest. Do not edit.',
    `// Requirements of one ${extension} file, resolved for every backend in the catalog.`,
  ];
  // Registered before the import block is rendered: the full-options exports below reference these
  // symbols, and an import added after the lines are built is emitted nowhere and fails at run time.
  const infrastructureByBackend = new Map(backends.map((backend) => [backend.name, backend]));
  for (const backend of infrastructureByBackend.values()) {
    addImport(importsByModule, backend.infrastructureImport, backend.infrastructureSymbol);
  }

  const importLines = [...importsByModule.keys()]
    .sort()
    .map((module) => `import { ${[...importsByModule.get(module)!].sort().join(', ')} } from '${module}';`);
  if (importLines.length > 0) lines.push('', ...importLines);

  for (const backend of Object.keys(MANIFEST_BACKEND_EXPORTS).sort()) {
    lines.push('', ...backendFragment(MANIFEST_BACKEND_EXPORTS[backend], byBackend.get(backend) ?? []));
    // Only a backend the catalog DECLARES gets a full-options export. A catalog that names no
    // infrastructure still produces the content fragment, and omitting the composed object is how the
    // module avoids implying a working configuration it cannot actually assemble.
    const infrastructure = infrastructureByBackend.get(backend);
    if (infrastructure !== undefined) {
      lines.push(
        '',
        `export const ${MANIFEST_BACKEND_FULL_EXPORTS[backend]} = {`,
        `  ...${infrastructure.infrastructureSymbol},`,
        `  ...${MANIFEST_BACKEND_EXPORTS[backend]},`,
        '};',
      );
    }
  }
  lines.push('', ...parserFragment(parserRows, PARSER_HANDLER_FIELDS[extension] ?? 'handlers'));
  return { problems, source: `${lines.join('\n')}\n` };
}

function addImport(importsByModule: Map<string, Set<string>>, module: string, symbol: string): void {
  let symbols = importsByModule.get(module);
  if (symbols === undefined) {
    symbols = new Set();
    importsByModule.set(module, symbols);
  }
  symbols.add(symbol);
}

function backendFragment(exportName: string, rows: readonly ManifestModuleEntry[]): string[] {
  const byField = new Map<string, ManifestModuleEntry[]>();
  for (const row of rows) {
    const field = REQUIREMENT_OPTION_FIELDS[row.entry.facet]!;
    let list = byField.get(field);
    if (list === undefined) {
      list = [];
      byField.set(field, list);
    }
    list.push(row);
  }
  // An empty fragment is still exported. A backend this content needs nothing for must spread to
  // nothing rather than fail to import, so an application can spread every fragment unconditionally.
  if (byField.size === 0) return [`export const ${exportName} = {};`];

  const fields = [...byField.keys()].sort().map((field) => {
    const entries = [...byField.get(field)!]
      .sort((a, b) => a.kind.localeCompare(b.kind))
      .map((row) => `    ['${row.kind}', ${row.entry.implementationSymbol}],`);
    return `  ${field}: new Map([\n${entries.join('\n')}\n  ]),`;
  });
  return [`export const ${exportName} = {`, ...fields, '};'];
}

function parserFragment(rows: readonly ManifestModuleEntry[], field: string): string[] {
  if (rows.length === 0) return ['export const parserOptions = {};'];
  // Emitted in the order the rows arrive, which is NOT catalog order: `createRequirementSet`
  // canonicalizes by facet then key, and the codegen plan walks that, so handlers come out sorted by
  // kind. Downstream measurement confirmed this is safe — AWD2 build phases run in caller array order
  // but read state populated by the Map-driven walk, which is order-independent, and PolarBear.awd and
  // tictac.awd produce byte-identical documents under sorted versus preset order. Recorded because the
  // ordering here is a CONSEQUENCE of canonicalization rather than a guarantee this function makes: a
  // format whose handlers genuinely contend for the same key would need its own ordering, and this
  // comment is the warning that it would not get one for free.
  const handlers = rows.map((row) => `    ${row.entry.implementationSymbol},`);
  return [`export const parserOptions = {`, `  ${field}: [`, ...handlers, '  ],', '};'];
}
