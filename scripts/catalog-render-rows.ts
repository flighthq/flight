import { canvasScene2DRenderPreset } from '@flighthq/scene2d-canvas';
import * as canvas from '@flighthq/scene2d-canvas';
import * as dom from '@flighthq/scene2d-dom';
import { glScene2DRenderPreset } from '@flighthq/scene2d-gl';
import * as gl from '@flighthq/scene2d-gl';
import { wgpuScene2DRenderPreset } from '@flighthq/scene2d-wgpu';
import * as wgpu from '@flighthq/scene2d-wgpu';
import { SWF_DOCUMENT_NODE_KINDS, SWF_REQUIREMENT_KEY_NAMESPACE, SWF_TAG_NODE_KINDS } from '@flighthq/swf/contract';
import { getSwfTagName } from '@flighthq/swf/contract';
import type { Kind, NodeRenderer, RequirementCatalogEntry, RequirementTranslation } from '@flighthq/types/contract';
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
  // DOM ships no preset: its runtime seeds an EMPTY renderer table and a caller supplies the bindings.
  // So its rows come from the pairs the package's OWN tests exercise — evidence from inside the package
  // rather than a guess from matching names. The renderers with no such evidence are deliberately
  // absent: a wrong binding registers a renderer under a kind no node carries and silently draws
  // nothing, which is strictly worse than an honest gap the build reports.
  for (const [kind, symbol] of DOM_TESTED_BINDINGS) {
    rows.push(renderRow('dom', '@flighthq/scene2d-dom', symbol, kind));
  }
  return rows.sort((a, b) => a.backend.localeCompare(b.backend) || a.kind.localeCompare(b.kind));
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

/** The kind-to-renderer pairs `scene2d-dom`'s own tests exercise. */
export const DOM_TESTED_BINDINGS: ReadonlyMap<Kind, string> = new Map([
  ['HtmlView' as Kind, 'domHtmlViewRenderer'],
  ['NativeText' as Kind, 'domNativeTextRenderer'],
  ['RichText' as Kind, 'domRichTextRenderer'],
  ['Scale9Sprite' as Kind, 'domScale9SpriteRenderer'],
  ['Shape' as Kind, 'domShapeRenderer'],
  ['Sprite' as Kind, 'domSpriteRenderer'],
  ['TextLabel' as Kind, 'domTextLabelRenderer'],
]);

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
];

/** The dom namespace is referenced so a renamed renderer fails the build rather than the generate. */
export const DOM_MODULE: Readonly<Record<string, unknown>> = dom as unknown as Record<string, unknown>;

function renderRow(backend: string, module: string, symbol: string, kind: Kind): RequirementCatalogEntry {
  return {
    backend,
    facet: RequirementFacet.SceneNodeKind,
    implementationImport: module,
    implementationSymbol: symbol,
    kind,
  };
}

// Identity, not name: the preset holds renderer OBJECTS, and matching them back by value is what makes
// a row name the symbol that actually holds the renderer serving that kind.
function symbolsOf(module: object): ReadonlyMap<unknown, string> {
  return new Map(Object.entries(module).map(([name, value]) => [value, name]));
}
