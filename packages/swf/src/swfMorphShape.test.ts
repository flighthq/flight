import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import { setMorphShapeProgress } from '@flighthq/shape/contract';
import { createTexture } from '@flighthq/texture/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type { Texture2D } from '@flighthq/types/contract';

import { createSwfMorphShape } from './swfMorphShape';
import { SwfReader } from './swfReader';
import { ShapeWriter } from './swfShapeTestHelper';

describe('createSwfMorphShape', () => {
  it('morphs a solid fill’s geometry and its colour under one progress', () => {
    const shape = readMorph(buildMorph({ endWidth: 400, startWidth: 200 }));

    // Progress 0 and 1 are the authored endpoints; the interesting assertion is the midpoint, where both
    // halves must move together — geometry from the edge sets, paint from the style pair.
    setMorphShapeProgress(shape!, 0);
    expect(fillOf(shape!)).toEqual([0xff0000ff, 1]);
    expect(widthOf(shape!)).toBeCloseTo(10);

    setMorphShapeProgress(shape!, 1);
    expect(fillOf(shape!)).toEqual([0x0000ffff, 0]);
    expect(widthOf(shape!)).toBeCloseTo(20);

    setMorphShapeProgress(shape!, 0.5);
    expect(fillOf(shape!)).toEqual([0x800080ff, 0.5]);
    expect(widthOf(shape!)).toBeCloseTo(15);
  });

  it('carries every fill of a compound morph in one node, each on its own path', () => {
    const shape = readMorph(buildCompoundMorph())!;

    // Two fill styles, so two path morphs and two paint bindings under a single MorphShape — the shape
    // is not split into one node per region.
    expect(shape.data.pathBindings).toHaveLength(2);
    expect(shape.data.paintBindings.map((binding) => binding.kind)).toEqual(['color', 'color']);

    setMorphShapeProgress(shape, 0.5);
    const fills = shape.data.commands
      .map((token, i) => (token === 'beginFill' ? [shape.data.commands[i + 2], shape.data.commands[i + 3]] : null))
      .filter((entry) => entry !== null);
    expect(fills).toEqual([
      [0x800080ff, 1],
      [0x008000ff, 1],
    ]);
  });

  it('morphs a stroke’s thickness and colour', () => {
    const shape = readMorph(buildStrokeMorph())!;

    setMorphShapeProgress(shape, 0.5);
    const index = shape.data.commands.indexOf('lineStyle');
    expect(shape.data.commands[index + 2]).toBeCloseTo(15);
    expect(shape.data.commands[index + 3]).toBe(0x808000ff);
  });

  it('shares one texture across both endpoints and morphs only its matrix', () => {
    const texture = createTexture();
    const shape = readMorph(buildBitmapMorph(), 1, () => texture)!;

    expect(shape.data.paintBindings.map((binding) => binding.kind)).toEqual(['texture']);
    const index = shape.data.commands.indexOf('beginTextureFill');
    expect(shape.data.commands[index + 2]).toBe(texture);
  });

  // No fire proof: the two edge streams are read in lockstep by readSwfMorphShapePaths, which breaks the
  // moment either runs out, so both paths of a pair are built with identical structure and the mismatches
  // createPathMorph declines on cannot arise from SWF bytes. The wire stays as a guard; the absence of a
  // fire proof is recorded rather than papered over with a fixture that does not reach it.
  it('stays silent when every path pair morphs, so the declined count carries information', () => {
    const body = buildMorph({ endWidth: 400, startWidth: 200 });
    let shape: ReturnType<typeof createSwfMorphShape> = null;
    const diagnostics = collectImportDiagnostics((sink) => {
      shape = createSwfMorphShape(new SwfReader(body, 0, body.length), 1, null, sink);
    });

    // Non-vacuous: a run that produced no morph at all would be silent for the wrong reason.
    expect(shape).not.toBeNull();
    expect(diagnostics).toEqual([]);
  });

  it('returns null for a body that does not decode rather than throwing', () => {
    expect(readMorph(new Uint8Array())).toBeNull();
    expect(readMorph(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
    // An end-edge offset past the body is the truncation case a bounded reader must reject.
    expect(readMorph(buildMorph({ endEdgesOffset: 0xffff }))).toBeNull();
  });

  it('never throws on arbitrary bytes, whatever they happen to encode', () => {
    let seed = 0x51f3a20b;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 400; i++) {
      const bytes = buildMorph({});
      for (let f = 0; f < 3; f++) bytes[next() % bytes.length] = next() & 0xff;
      expect(() => readMorph(bytes)).not.toThrow();
    }
  });
});

function readMorph(bytes: Uint8Array, version = 1, resolveBitmapFill?: () => Texture2D | null) {
  return createSwfMorphShape(new SwfReader(bytes, 0, bytes.length), version, resolveBitmapFill ?? null);
}

// The first `beginFill`'s sampled colour and alpha.
function fillOf(shape: { data: { commands: unknown[] } }): [number, number] {
  const index = shape.data.commands.indexOf('beginFill');
  return [shape.data.commands[index + 2] as number, shape.data.commands[index + 3] as number];
}

// The sampled path's width, measured as its horizontal extent. Read rather than indexed, because
// createPathMorph resamples both endpoints to a common vertex count and the authored corners move.
function widthOf(shape: { data: { pathBindings: { path: { data: number[] } }[] } }): number {
  const data = shape.data.pathBindings[0].path.data;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i += 2) {
    min = Math.min(min, data[i]);
    max = Math.max(max, data[i]);
  }
  return max - min;
}

// A single-fill morph: a box `startWidth` twips wide becoming `endWidth`, filled red-opaque becoming
// blue-transparent.
function buildMorph(options: { endEdgesOffset?: number; endWidth?: number; startWidth?: number }): Uint8Array {
  const startEdges = boxEdges(options.startWidth ?? 200);
  const endEdges = boxEdges(options.endWidth ?? 400);
  const styles = joinBytes(
    new Uint8Array([1, 0x00]),
    rgba(0xff, 0x00, 0x00, 0xff),
    rgba(0x00, 0x00, 0xff, 0x00),
    new Uint8Array([0]),
  );
  const offset = options.endEdgesOffset ?? styles.length + startEdges.length;
  return joinBytes(uint32(offset), styles, startEdges, endEdges);
}

// Two fill styles, each with its own contour in both endpoints.
function buildCompoundMorph(): Uint8Array {
  const startEdges = twoBoxEdges(200);
  const endEdges = twoBoxEdges(400);
  const styles = joinBytes(
    new Uint8Array([2, 0x00]),
    rgba(0xff, 0x00, 0x00, 0xff),
    rgba(0x00, 0x00, 0xff, 0xff),
    new Uint8Array([0x00]),
    rgba(0x00, 0xff, 0x00, 0xff),
    rgba(0x00, 0x00, 0x00, 0xff),
    new Uint8Array([0]),
  );
  return joinBytes(uint32(styles.length + startEdges.length), styles, startEdges, endEdges);
}

function buildStrokeMorph(): Uint8Array {
  const startEdges = boxEdges(200, 0, false, 1);
  const endEdges = boxEdges(400, 0, false, 1);
  const styles = joinBytes(
    new Uint8Array([0, 1]),
    uint16(200),
    uint16(400),
    rgba(0xff, 0x00, 0x00, 0xff),
    rgba(0x00, 0xff, 0x00, 0xff),
  );
  return joinBytes(uint32(styles.length + startEdges.length), styles, startEdges, endEdges);
}

function buildBitmapMorph(): Uint8Array {
  const startEdges = boxEdges(200);
  const endEdges = boxEdges(400);
  const identity = new ShapeWriter();
  identity.writeIdentityMatrix(0, 0);
  const matrix = identity.toBytes();
  const styles = joinBytes(new Uint8Array([1, 0x41]), uint16(9), matrix, matrix, new Uint8Array([0]));
  return joinBytes(uint32(styles.length + startEdges.length), styles, startEdges, endEdges);
}

// Two closed boxes in one record stream, the second under fill style 2 — a single SHAPE with two style
// changes, which is how a shape carries more than one fill.
function twoBoxEdges(width: number): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeStyleBits(2, 2);
  writer.writeStyleChange({ fill1: 1, moveToX: 0, moveToY: 0 }, 2);
  writeBox(writer, width);
  writer.writeStyleChange({ fill1: 2, moveToX: 1000, moveToY: 0 }, 2);
  writeBox(writer, width);
  writer.writeEndShape();
  return writer.toBytes();
}

function writeBox(writer: ShapeWriter, width: number): void {
  writer.writeStraightEdge(width, 0);
  writer.writeStraightEdge(0, width);
  writer.writeStraightEdge(-width, 0);
  writer.writeStraightEdge(0, -width);
}

// A closed box `width` twips across, referencing one fill (or line) style index.
function boxEdges(width: number, fill = 1, moveOnly = false, line = 0): Uint8Array {
  const writer = new ShapeWriter();
  writer.writeStyleBits(2, 2);
  writer.writeStyleChange({ fill1: fill, line, moveToX: moveOnly ? 1000 : 0, moveToY: 0 }, 2);
  writer.writeStraightEdge(width, 0);
  writer.writeStraightEdge(0, width);
  writer.writeStraightEdge(-width, 0);
  writer.writeStraightEdge(0, -width);
  writer.writeEndShape();
  return writer.toBytes();
}

function rgba(red: number, green: number, blue: number, alpha: number): Uint8Array {
  return new Uint8Array([red, green, blue, alpha]);
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

function joinBytes(...parts: ReadonlyArray<Uint8Array>): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
