import type { ColladaElementDecoder } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { colladaGeometryDecoder } from './colladaGeometryDecoder.ts';
import { parseColladaWithDecoders } from './colladaParse.ts';

const MINIMAL = '<COLLADA><asset><up_axis>Y_UP</up_axis></asset><scene/></COLLADA>';

// ★ THE BUILD PASS ONLY RUNS WHEN THERE IS A VISUAL SCENE TO WALK, which `MINIMAL` deliberately lacks. My first
// phase-ordering test used MINIMAL and saw no build calls at all — the walk returns before the dispatch when no
// `<instance_visual_scene>` resolves, which is the shipped behaviour and worth stating rather than working around.
const WITH_SCENE =
  '<COLLADA><asset><up_axis>Y_UP</up_axis></asset>' +
  '<library_visual_scenes><visual_scene id="s"><node id="n"/></visual_scene></library_visual_scenes>' +
  '<scene><instance_visual_scene url="#s"/></scene></COLLADA>';
const Z_UP = '<COLLADA><asset><up_axis>Z_UP</up_axis></asset><scene/></COLLADA>';

describe('parseColladaWithDecoders', () => {
  // ★ THE CORE TAKES THE FAMILY AND NAMES NO DEFAULT. That is the property this whole module exists for: the
  // orchestrator cannot reach a decoder it was not handed, so a caller asking for geometry alone does not link
  // cameras, lights, controllers or animations. `parseCollada` in `colladaDocument.ts` owns the default.
  it('runs exactly the decoders it is handed, in the order given', () => {
    const order: string[] = [];
    const first = probe('first', order);
    const second = probe('second', order);
    parseColladaWithDecoders(MINIMAL, [first, second]);
    expect(order).toEqual(['first', 'second']);

    order.length = 0;
    parseColladaWithDecoders(MINIMAL, [second, first]);
    expect(order).toEqual(['second', 'first']);
  });

  it('parses a document with an EMPTY family, reading everything that is not a feature', () => {
    const result = parseColladaWithDecoders(MINIMAL, []);
    expect(result.diagnostics).toEqual([]);
    expect(result.upAxis).toBe('Y_UP');
    expect(result.document.meshes).toEqual([]);
  });

  // Up-axis handling belongs to the orchestrator, not to any feature, so it survives an empty family — including
  // the conversion diagnostic, which a build reads to know the document was rotated.
  it('reports the up-axis conversion with no decoders at all', () => {
    const result = parseColladaWithDecoders(Z_UP, []);
    expect(result.upAxis).toBe('Z_UP');
    expect(result.rootTransform[6]).toBe(-1);
    expect(result.diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['collada.coordinate-conversion']);
  });

  it('rejects a document whose root is not COLLADA, whatever family it is given', () => {
    const result = parseColladaWithDecoders('<NOTCOLLADA/>', [colladaGeometryDecoder]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['collada.invalid-document']);
    expect(result.document.meshes).toEqual([]);
  });

  // ★ BUILD PHASES ARE SORTED, SO A CALLER'S ARRAY ORDER CANNOT CHANGE THE PARSE. The decode pass runs in the
  // caller's order — asserted above — and the build pass runs in declared phase order regardless of it.
  it('runs build phases in declared order even when the family is reversed', () => {
    const order: string[] = [];
    const late = probe('late', order, 90);
    const early = probe('early', order, 10);
    parseColladaWithDecoders(WITH_SCENE, [late, early]);
    expect(order.filter((entry) => entry.endsWith(':build'))).toEqual(['early:build', 'late:build']);
  });

  it('skips the build pass entirely when no visual scene resolves', () => {
    const order: string[] = [];
    parseColladaWithDecoders(MINIMAL, [probe('only', order, 10)]);
    expect(order).toEqual(['only']);
  });

  it('runs a decoder with no build phase last', () => {
    const order: string[] = [];
    const phased = probe('phased', order, 50);
    const unphased = probe('unphased', order);
    parseColladaWithDecoders(WITH_SCENE, [unphased, phased]);
    expect(order.filter((entry) => entry.endsWith(':build'))).toEqual(['phased:build', 'unphased:build']);
  });
});

// A decoder that records when it ran rather than reading anything. `buildPhase` is left undefined when no phase is
// given, which is the case the sort has to place last.
function probe(name: string, order: string[], buildPhase?: number): ColladaElementDecoder {
  return {
    build() {
      order.push(`${name}:build`);
    },
    ...(buildPhase === undefined ? {} : { buildPhase }),
    decode() {
      order.push(name);
    },
    elements: [],
    features: [],
  };
}
