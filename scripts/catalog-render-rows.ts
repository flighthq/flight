import {
  canvasScene2DRenderPreset,
  canvasShapeCommands,
  canvasTextureShapeCommands,
  applyCanvasBlendMode,
} from '@flighthq/scene2d-canvas';
import * as canvas from '@flighthq/scene2d-canvas';
import { domScene2DRenderPreset } from '@flighthq/scene2d-dom';
import * as dom from '@flighthq/scene2d-dom';
import { glScene2DRenderPreset } from '@flighthq/scene2d-gl';
import * as gl from '@flighthq/scene2d-gl';
import { wgpuScene2DRenderPreset } from '@flighthq/scene2d-wgpu';
import * as wgpu from '@flighthq/scene2d-wgpu';
import { glScene3DRenderPreset } from '@flighthq/scene3d-gl';
import * as scene3dGl from '@flighthq/scene3d-gl';
import { wgpuScene3DRenderPreset } from '@flighthq/scene3d-wgpu';
import * as scene3dWgpu from '@flighthq/scene3d-wgpu';
import { SWF_DOCUMENT_NODE_KINDS, SWF_REQUIREMENT_KEY_NAMESPACE, SWF_TAG_NODE_KINDS } from '@flighthq/swf/contract';
import { getSwfTagName } from '@flighthq/swf/contract';
import type {
  CanvasShapeCommand,
  Kind,
  NodeRenderer,
  RequirementBackend,
  RequirementCatalogEntry,
  RequirementTranslation,
} from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

/**
 * The render half of the built-in catalog: which renderer serves a node kind on each backend, and which
 * node kinds a document format implies.
 *
 * ★ THE BINDINGS ARE READ FROM THE SHIPPED PRESETS, NOT TRANSCRIBED. Each 2D backend exports a preset
 * whose `nodeRenderers` map IS the binding, so the rows are taken from the same object a running app
 * uses, and each renderer is matched back to the symbol that exports it by identity rather than by
 * name. A renderer that moved, was renamed, or dropped out of the preset therefore changes the rows on
 * the next generate instead of leaving a row pointing at something that no longer serves that kind — a
 * failure that costs nothing at build time and silently draws nothing at run time.
 */
export function buildRenderCatalogRows(): readonly RequirementCatalogEntry[] {
  const rows: RequirementCatalogEntry[] = [];
  for (const backend of PRESET_BACKENDS) {
    for (const [kind, renderer] of backend.renderers) {
      const symbol = backend.symbols.get(renderer);
      // A preset entry whose renderer is not exported cannot be named in generated source, so it is
      // dropped loudly by the accompanying test rather than emitted as an unresolvable import.
      if (symbol === undefined) continue;
      rows.push(renderRow(backend.name, backend.module, symbol, kind));
    }
  }
  rows.push(...buildShapeCommandCatalogRows());
  rows.push(...buildBlendModeCatalogRows());
  rows.push(...buildMaterialKindCatalogRows());
  rows.push(...buildModifierKindCatalogRows());
  return rows.sort(
    (a, b) => a.backend.localeCompare(b.backend) || a.facet.localeCompare(b.facet) || a.kind.localeCompare(b.kind),
  );
}

/**
 * Shape command catalog rows: each canvas shape command is individually keyed and exported.
 *
 * All four backends consume the same `CanvasShapeCommand` objects — GL and WGPU use them for their
 * canvas-rasterized fallback paths. The implementation module is always `@flighthq/scene2d-canvas`
 * because that is where the commands are defined and exported.
 */
function buildShapeCommandCatalogRows(): RequirementCatalogEntry[] {
  const canvasSymbols = symbolsOf(canvas);
  const rows: RequirementCatalogEntry[] = [];
  const allCommands: readonly CanvasShapeCommand[] = [...canvasShapeCommands, ...canvasTextureShapeCommands];
  for (const command of allCommands) {
    const symbol = canvasSymbols.get(command);
    if (symbol === undefined) continue;
    for (const backend of SHAPE_COMMAND_BACKENDS) {
      rows.push({
        backend,
        facet: RequirementFacet.SceneShapeCommand,
        implementationImport: '@flighthq/scene2d-canvas',
        implementationSymbol: symbol,
        kind: command.key,
      });
    }
  }
  return rows;
}

const SHAPE_COMMAND_BACKENDS = ['canvas', 'dom', 'gl', 'wgpu'];

/**
 * Blend mode application catalog rows.
 *
 * Canvas blend mode application is a single function, not a kind-keyed map. The catalog entry uses
 * the key `standard` to represent the standard blend mode set (Normal, Multiply, Screen, etc.).
 * GL uses `blendRealizations` (a per-mode map) which is a different mechanism — its entries would be
 * per blend mode value, not a single function. For now, only canvas is populated.
 */
function buildBlendModeCatalogRows(): RequirementCatalogEntry[] {
  const canvasSymbols = symbolsOf(canvas);
  const symbol = canvasSymbols.get(applyCanvasBlendMode);
  if (symbol === undefined) return [];
  return [
    {
      backend: 'canvas',
      facet: RequirementFacet.SceneBlendMode,
      implementationImport: '@flighthq/scene2d-canvas',
      implementationSymbol: symbol,
      kind: 'standard',
    },
  ];
}

/** Format-to-render implications, derived from the kinds each tag actually builds. */
export function buildRequirementTranslations(): readonly RequirementTranslation[] {
  const translations: RequirementTranslation[] = [];
  for (const [code, kinds] of SWF_TAG_NODE_KINDS) {
    translations.push({
      from: { facet: RequirementFacet.DocumentFormat, key: `${SWF_REQUIREMENT_KEY_NAMESPACE}.${getSwfTagName(code)}` },
      to: kinds.map((kind) => ({ facet: RequirementFacet.SceneNodeKind, key: kind })),
    });
  }
  // The namespace-keyed row: every SWF document gets these regardless of which tags it carries. See
  // RequirementTranslation for why a per-tag table cannot express it.
  translations.push({
    from: { facet: RequirementFacet.DocumentFormat, key: SWF_REQUIREMENT_KEY_NAMESPACE },
    to: SWF_DOCUMENT_NODE_KINDS.map((kind) => ({ facet: RequirementFacet.SceneNodeKind, key: kind })),
  });
  return translations.sort((a, b) => a.from.key.localeCompare(b.from.key));
}

export const PRESET_BACKENDS: readonly {
  readonly module: string;
  readonly name: string;
  readonly renderers: ReadonlyMap<Kind, NodeRenderer>;
  readonly symbols: ReadonlyMap<unknown, string>;
}[] = [
  {
    module: '@flighthq/scene2d-canvas',
    name: 'canvas',
    renderers: canvasScene2DRenderPreset.nodeRenderers,
    symbols: symbolsOf(canvas),
  },
  {
    module: '@flighthq/scene2d-gl',
    name: 'gl',
    renderers: glScene2DRenderPreset.nodeRenderers,
    symbols: symbolsOf(gl),
  },
  {
    module: '@flighthq/scene2d-wgpu',
    name: 'wgpu',
    renderers: wgpuScene2DRenderPreset.nodeRenderers,
    symbols: symbolsOf(wgpu),
  },
  // DOM had no preset until one was added: its runtime seeds an EMPTY table, so the only statement of
  // which renderer serves which kind lived in examples and tests, unreadable to anything else. It now
  // declares the same way the other three do, which is what lets this read all four uniformly instead
  // of guessing DOM's bindings from renderer names — a guess the naming convention cannot settle,
  // since `DisplayObject` is served by `domScene2DRenderer`.
  {
    module: '@flighthq/scene2d-dom',
    name: 'dom',
    renderers: domScene2DRenderPreset.nodeRenderers!,
    symbols: symbolsOf(dom),
  },
];

export const SCENE3D_PRESET_BACKENDS: readonly {
  readonly materialRenderers: ReadonlyMap<Kind, unknown>;
  readonly modifierSnippets: ReadonlyMap<Kind, unknown>;
  readonly modules: ReadonlyArray<{ readonly importPath: string; readonly symbols: ReadonlyMap<unknown, string> }>;
  readonly name: string;
}[] = [
  {
    materialRenderers: glScene3DRenderPreset.materialRenderers,
    modifierSnippets: glScene3DRenderPreset.modifierSnippets,
    modules: [
      { importPath: '@flighthq/scene3d-gl', symbols: symbolsOf(scene3dGl) },
      { importPath: '@flighthq/scene2d-gl', symbols: symbolsOf(gl) },
    ],
    name: 'gl',
  },
  {
    materialRenderers: wgpuScene3DRenderPreset.materialRenderers,
    modifierSnippets: wgpuScene3DRenderPreset.modifierSnippets,
    modules: [
      { importPath: '@flighthq/scene3d-wgpu', symbols: symbolsOf(scene3dWgpu) },
      { importPath: '@flighthq/scene2d-wgpu', symbols: symbolsOf(wgpu) },
    ],
    name: 'wgpu',
  },
];

function renderRow(backend: string, module: string, symbol: string, kind: Kind): RequirementCatalogEntry {
  return {
    backend,
    facet: RequirementFacet.SceneNodeKind,
    implementationImport: module,
    implementationSymbol: symbol,
    kind,
  };
}

function buildMaterialKindCatalogRows(): RequirementCatalogEntry[] {
  const rows: RequirementCatalogEntry[] = [];
  for (const backend of SCENE3D_PRESET_BACKENDS) {
    for (const [kind, renderer] of backend.materialRenderers) {
      const resolved = resolveMultiModuleSymbol(renderer, backend.modules);
      if (resolved === undefined) continue;
      rows.push({
        backend: backend.name,
        facet: RequirementFacet.SceneMaterialKind,
        implementationImport: resolved.importPath,
        implementationSymbol: resolved.symbol,
        kind,
      });
    }
  }
  return rows;
}

function buildModifierKindCatalogRows(): RequirementCatalogEntry[] {
  const rows: RequirementCatalogEntry[] = [];
  for (const backend of SCENE3D_PRESET_BACKENDS) {
    for (const [kind, snippet] of backend.modifierSnippets) {
      const resolved = resolveMultiModuleSymbol(snippet, backend.modules);
      if (resolved === undefined) continue;
      rows.push({
        backend: backend.name,
        facet: RequirementFacet.SceneModifierKind,
        implementationImport: resolved.importPath,
        implementationSymbol: resolved.symbol,
        kind,
      });
    }
  }
  return rows;
}

function resolveMultiModuleSymbol(
  value: unknown,
  modules: ReadonlyArray<{ readonly importPath: string; readonly symbols: ReadonlyMap<unknown, string> }>,
): { importPath: string; symbol: string } | undefined {
  for (const mod of modules) {
    const symbol = mod.symbols.get(value);
    if (symbol !== undefined) return { importPath: mod.importPath, symbol };
  }
  return undefined;
}

// Identity, not name: the preset holds renderer OBJECTS, and matching them back by value is what makes
// a row name the symbol that actually holds the renderer serving that kind.
function symbolsOf(module: object): ReadonlyMap<unknown, string> {
  return new Map(Object.entries(module).map(([name, value]) => [value, name]));
}

/**
 * What each built-in backend needs beyond the renderers a document implies.
 *
 * Declared as catalog DATA rather than known by the plugin, so the plugin stays ignorant of which
 * render packages exist and a caller's own backend is served the same way. The symbols are the public
 * `*RenderInfrastructure` exports each backend package ships for exactly this purpose.
 */
export function buildRequirementBackends(): readonly RequirementBackend[] {
  return [
    {
      infrastructureImport: '@flighthq/scene2d-canvas',
      infrastructureSymbol: 'canvasRenderInfrastructure',
      name: 'canvas',
    },
    { infrastructureImport: '@flighthq/scene2d-dom', infrastructureSymbol: 'domRenderInfrastructure', name: 'dom' },
    { infrastructureImport: '@flighthq/scene2d-gl', infrastructureSymbol: 'glRenderInfrastructure', name: 'gl' },
    { infrastructureImport: '@flighthq/scene2d-wgpu', infrastructureSymbol: 'wgpuRenderInfrastructure', name: 'wgpu' },
  ];
}
