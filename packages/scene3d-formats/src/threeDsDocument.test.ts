import { getNodeChildren } from '@flighthq/node/contract';
import type { ImportDiagnostic, ThreeDsChunkHandler } from '@flighthq/types/contract';
import {
  THREE_DS_CAMERA,
  THREE_DS_EDITOR,
  THREE_DS_KEYFRAME,
  THREE_DS_KEYFRAME_NODE_HEADER,
  THREE_DS_KEYFRAME_OBJECT_NODE,
  THREE_DS_KEYFRAME_PIVOT,
  THREE_DS_LIGHT,
  THREE_DS_MAIN,
  THREE_DS_MATERIAL,
  THREE_DS_MATERIAL_NAME,
  THREE_DS_OBJECT,
  THREE_DS_TRIMESH,
  THREE_DS_TRANSFORM_MATRIX,
  THREE_DS_VERTICES,
  THREE_DS_FACES,
  THREE_DS_FACE_MATERIAL,
} from '@flighthq/types/contract';

import { threeDsCameraHandler } from './threeDsCameraHandler.ts';
import { threeDsAllChunkHandlers } from './threeDsChunkRegistry.ts';
import { createScene3DFrom3ds, parse3ds } from './threeDsDocument.ts';
import { threeDsKeyframeHandler } from './threeDsKeyframeHandler.ts';
import { threeDsLightHandler } from './threeDsLightHandler.ts';
import { threeDsMaterialHandler } from './threeDsMaterialHandler.ts';
import { threeDsMeshHandler } from './threeDsMeshHandler.ts';

// ★ OMITTING A HANDLER REMOVES ONE FEATURE AND NOTHING ELSE. Each case drops a single handler and checks
// both halves: the feature it owns disappears, AND every other feature is untouched. The second half is
// what catches a handler that quietly did someone else's work too — the failure a "the refactor preserved
// everything" claim is most likely to hide.
describe('createScene3DFrom3ds', () => {
  it('assembles a live scene through the same family parse3ds uses', () => {
    const scene = createScene3DFrom3ds(fullFile());
    expect(scene).not.toBeNull();
  });

  // Asserted on the scene's CHILDREN, not on its JSON. A live Scene3D stringifies to
  // `{animations, metadata, resources, root}` and `root` is an Entity whose children are not
  // JSON-visible, so two scenes built from different documents serialize identically — a JSON comparison
  // here would pass no matter what this function did with its options.
  it('forwards options to the parse it delegates to', () => {
    const full = createScene3DFrom3ds(fullFile());
    const withoutMeshes = createScene3DFrom3ds(fullFile(), [], { handlers: without(threeDsMeshHandler) });
    expect(getNodeChildren(full.root).length).toBeGreaterThan(0);
    expect(getNodeChildren(withoutMeshes.root)).toEqual([]);
  });

  it('builds a scene for any family, including an empty one, rather than throwing', () => {
    expect(createScene3DFrom3ds(fullFile(), [], { handlers: [] })).not.toBeNull();
  });
});

// ★ THE ORACLE FOR THIS REFACTOR IS threeDsParse.test.ts, NOT THIS FILE. Its 91 cases exercise the full
// parser and passed unchanged when the hard-coded dispatch became a handler family — that is the evidence
// observable output and diagnostics are preserved. This file asserts the two things those cases cannot:
// that the default IS the family rather than a second path that agrees with it, and that omitting a
// handler removes exactly one feature.
describe('parse3ds', () => {
  it('parses identically with the default and with the full family named explicitly', () => {
    const implicitDiagnostics: ImportDiagnostic[] = [];
    const explicitDiagnostics: ImportDiagnostic[] = [];
    const implicit = parse3ds(fullFile(), implicitDiagnostics);
    const explicit = parse3ds(fullFile(), explicitDiagnostics, { handlers: threeDsAllChunkHandlers });

    // JSON rather than toEqual: document nodes are Entities carrying a symbol-keyed runtime slot unique
    // per allocation, so two structurally identical parses never compare equal — vitest reports "no
    // visual difference" and fails anyway. JSON drops symbol keys and keeps every observable field.
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(implicit));
    expect(explicitDiagnostics).toEqual(implicitDiagnostics);
  });

  it('reads every feature of the fixture, so the omission cases below are subtracting something real', () => {
    const document = parse3ds(fullFile());
    expect(document.meshes.length, 'meshes').toBeGreaterThan(0);
    expect(document.materials.length, 'materials').toBeGreaterThan(0);
    expect(document.cameras.length, 'cameras').toBeGreaterThan(0);
    expect(document.lights.length, 'lights').toBeGreaterThan(0);
  });

  it('parses with NO handlers rather than failing, yielding an empty document', () => {
    const document = parse3ds(fullFile(), [], { handlers: [] });
    expect(document.meshes).toEqual([]);
    expect(document.materials).toEqual([]);
    expect(document.cameras).toEqual([]);
    expect(document.lights).toEqual([]);
  });

  // A malformed file must still be rejected the same way whatever the family is: the header guards are
  // the walker's, not a handler's, so no composition can lose them.
  it('keeps the read-integrity guards regardless of the family', () => {
    for (const handlers of [undefined, threeDsAllChunkHandlers, []]) {
      const diagnostics: ImportDiagnostic[] = [];
      parse3ds(new Uint8Array([0x00]), diagnostics, handlers === undefined ? undefined : { handlers });
      expect(
        diagnostics.map((d) => d.kind),
        String(handlers?.length),
      ).toContain('3ds.input-too-small');
    }
  });
});

describe('parse3ds handler omission', () => {
  it.each([
    ['Material', threeDsMaterialHandler, 'materials'],
    ['Mesh', threeDsMeshHandler, 'meshes'],
    ['Camera', threeDsCameraHandler, 'cameras'],
    ['Light', threeDsLightHandler, 'lights'],
  ] as const)('omitting the %s handler empties only its own table', (_label, omitted, table) => {
    const full = parse3ds(fullFile());
    const partial = parse3ds(fullFile(), [], { handlers: without(omitted) });

    expect(full[table].length, `${table} present with the full family`).toBeGreaterThan(0);
    expect(partial[table].length, `${table} after omission`).toBe(0);

    for (const other of ['materials', 'meshes', 'cameras', 'lights'] as const) {
      if (other === table) continue;
      // ★ ONE REAL COUPLING, MEASURED RATHER THAN ASSUMED. `document.materials` is filled by MESH
      // assembly — a material is registered when a face names it, not when the material chunk is read —
      // so dropping the mesh handler necessarily empties the material table too. That is a property of
      // the format's by-reference material model, not a handler reaching outside its feature. Every
      // other pair is independent, and asserting this exception explicitly is what keeps the rule
      // meaningful instead of loosened.
      if (table === 'meshes' && other === 'materials') {
        expect(partial.materials.length, 'materials are registered through mesh faces').toBe(0);
        continue;
      }
      expect(partial[other].length, `${other} must survive omitting ${_label}`).toBe(full[other].length);
    }
  });

  // Pivots have no table of their own: the keyframe handler collects them and the mesh assembly applies
  // them, so its omission shows up as mesh geometry positioned differently rather than as a missing list.
  it('omitting the Keyframe handler changes only how meshes are positioned', () => {
    const full = parse3ds(fullFile());
    const partial = parse3ds(fullFile(), [], { handlers: without(threeDsKeyframeHandler) });

    expect(partial.meshes.length).toBe(full.meshes.length);
    expect(partial.materials.length).toBe(full.materials.length);
    expect(partial.cameras.length).toBe(full.cameras.length);
    expect(partial.lights.length).toBe(full.lights.length);
    // The fixture's pivot is non-zero, so applying it and not applying it must differ. Without this the
    // test would pass for a keyframe handler that never ran at all.
    expect(JSON.stringify(partial.meshes)).not.toBe(JSON.stringify(full.meshes));
  });

  it('keeps a handler that is named, even when every other one is dropped', () => {
    const document = parse3ds(fullFile(), [], { handlers: [threeDsCameraHandler] });
    expect(document.cameras.length).toBeGreaterThan(0);
    expect(document.meshes).toEqual([]);
    expect(document.materials).toEqual([]);
    expect(document.lights).toEqual([]);
  });
});

function without(omitted: Readonly<ThreeDsChunkHandler>): readonly Readonly<ThreeDsChunkHandler>[] {
  return threeDsAllChunkHandlers.filter((handler) => handler !== omitted);
}

function chunk(id: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(6 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, out.length, true);
  out.set(payload, 6);
  return out;
}

function bytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function name(value: string): Uint8Array {
  return Uint8Array.from([...[...value].map((c) => c.charCodeAt(0)), 0]);
}

function floats(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, i) => view.setFloat32(i * 4, value, true));
  return out;
}

// A pivot is applied only to a mesh that carries TRI_LOCAL — `appendMeshDocument` localizes positions
// under `if (mesh.localMatrix !== null)`. Without this chunk the keyframe handler collects a pivot that
// nothing consumes, and the omission test would pass while proving nothing. Identity basis, offset origin.
function localMatrix(): Uint8Array {
  return chunk(THREE_DS_TRANSFORM_MATRIX, floats(1, 0, 0, 0, 1, 0, 0, 0, 1, 2, 3, 4));
}

function vertices(): Uint8Array {
  const count = new Uint8Array(2);
  new DataView(count.buffer).setUint16(0, 3, true);
  return chunk(THREE_DS_VERTICES, bytes(count, floats(0, 0, 0, 1, 0, 0, 0, 1, 0)));
}

function faceMaterial(materialName: string): Uint8Array {
  const count = new Uint8Array(2);
  new DataView(count.buffer).setUint16(0, 1, true); // one face uses it
  const face = new Uint8Array(2);
  new DataView(face.buffer).setUint16(0, 0, true); // face index 0
  return chunk(THREE_DS_FACE_MATERIAL, bytes(name(materialName), count, face));
}

function faces(): Uint8Array {
  const payload = new Uint8Array(2 + 8);
  const view = new DataView(payload.buffer);
  view.setUint16(0, 1, true); // one face
  view.setUint16(2, 0, true);
  view.setUint16(4, 1, true);
  view.setUint16(6, 2, true);
  view.setUint16(8, 0, true); // flags
  // FACE_MATERIAL is a SUB-chunk of FACES, which is what makes the material referenced and therefore
  // registered into the document's table.
  return chunk(THREE_DS_FACES, bytes(payload, faceMaterial('mat')));
}

/** One 3DS file carrying all five features, so an omission has something to remove. */
function fullFile(): Uint8Array {
  const material = chunk(THREE_DS_MATERIAL, chunk(THREE_DS_MATERIAL_NAME, name('mat')));
  const mesh = chunk(
    THREE_DS_OBJECT,
    bytes(name('box'), chunk(THREE_DS_TRIMESH, bytes(vertices(), faces(), localMatrix()))),
  );
  // The camera payload is a fixed 32-byte record: position, target, bank, lens.
  const camera = chunk(THREE_DS_OBJECT, bytes(name('cam'), chunk(THREE_DS_CAMERA, floats(0, 0, 10, 0, 0, 0, 0, 35))));
  const light = chunk(THREE_DS_OBJECT, bytes(name('lit'), chunk(THREE_DS_LIGHT, floats(1, 2, 3))));
  const editor = chunk(THREE_DS_EDITOR, bytes(material, mesh, camera, light));
  // A non-zero pivot for "box", so applying it is observable in the mesh's positions.
  const node = chunk(
    THREE_DS_KEYFRAME_OBJECT_NODE,
    bytes(chunk(THREE_DS_KEYFRAME_NODE_HEADER, name('box')), chunk(THREE_DS_KEYFRAME_PIVOT, floats(5, 6, 7))),
  );
  return chunk(THREE_DS_MAIN, bytes(editor, chunk(THREE_DS_KEYFRAME, node)));
}
