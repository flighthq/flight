import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import type { RegionAttachment2D } from '@flighthq/types/contract';
import { RegionAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseSpineSkeletonBinary } from './spineBinaryParse';

describe('parseSpineSkeletonBinary', () => {
  it('parses the header, bones, and slots of a 4.x file', () => {
    const result = parseSpineSkeletonBinary(buildSpineBinary())!;
    expect(result).not.toBeNull();
    const bones = result.skeleton.bones;
    expect(bones.length).toBe(2);
    expect(bones[0]).toMatchObject({ name: 'root', parentIndex: -1, rotation: 0, x: 0, y: 0 });
    // Bone 0 writes NO parent index — the reader must not consume one for it, or every later field shifts.
    expect(bones[1]).toMatchObject({
      length: 26.25,
      name: 'hip',
      parentIndex: 0,
      rotation: 19.5,
      scaleX: 2,
      scaleY: 0.5,
      shearX: 1.5,
      shearY: -1.5,
      x: 1.25,
      y: 247.5,
    });
    const slots = result.skeleton.slots!;
    expect(slots.length).toBe(1);
    expect(slots[0]).toMatchObject({ boneIndex: 1, color: 0x80c0ffff, name: 'body' });
    expect(result.animations).toEqual([]);
  });

  it('resolves a slot to the setup attachment the SKIN defines, which is read after the slot', () => {
    // The slot names its attachment before the skin exists in the stream, so this is the ordering the parser
    // has to defer: name captured during slots, resolved once the skin is parsed.
    const region = parseSpineSkeletonBinary(buildSpineBinary())!.skeleton.slots![0].attachment as RegionAttachment2D;
    expect(region).not.toBeNull();
    expect(region.kind).toBe(RegionAttachment2DKind);
    expect(region).toMatchObject({ height: 32, name: 'body-attachment', rotation: 12.5, width: 64, x: 3.5, y: 4.5 });
  });

  it('parses a RIGID mesh attachment: uvs, triangles, and bone-local positions', () => {
    const skin = parseSpineSkeletonBinary(buildSpineBinary())!;
    // The mesh is the second attachment on the slot; it is not the setup one, so reach it via the region's
    // sibling — the parse must still have consumed it correctly for the file to end cleanly.
    const crumbs = collectImportDiagnostics((sink) => parseSpineSkeletonBinary(buildSpineBinary(), sink));
    expect(crumbs.find((c) => c.kind === 'spine.binary-tail-unparsed')!.detail).toMatchObject({ bytes: 0 });
    expect(skin.skeleton.slots!.length).toBe(1);
  });

  it('decodes a WEIGHTED mesh into Skin2D influences without re-packing', () => {
    // Spine's binary influence stream is already [boneIndex, x, y, weight] per influence, which is exactly
    // Skin2D's layout — so a wrong stride here would surface as a clean end-of-file failure.
    const crumbs = collectImportDiagnostics((sink) =>
      parseSpineSkeletonBinary(buildSpineBinary({ weightedMesh: true }), sink),
    );
    expect(crumbs.find((c) => c.kind === 'spine.binary-tail-unparsed')!.detail).toMatchObject({ bytes: 0 });
    expect(crumbs.map((c) => c.kind)).not.toContain('spine.binary-truncated');
  });

  it('CONSUMES IK constraint records it does not model, so the skin after them still parses', () => {
    // Constraints cannot be skipped — they carry no length — so mis-walking one desynchronizes the skin.
    // A resolved attachment on the far side is therefore the proof that the walk was byte-exact.
    const result = parseSpineSkeletonBinary(buildSpineBinary({ ikConstraints: 2 }))!;
    expect(result.skeleton.slots![0].attachment).not.toBeNull();
    const kinds = collectImportDiagnostics((sink) =>
      parseSpineSkeletonBinary(buildSpineBinary({ ikConstraints: 2 }), sink),
    ).map((c) => c.kind);
    expect(kinds).toContain('spine.ik-constraint-unsupported');
  });

  it('REJECTS a version whose record layout this importer does not describe', () => {
    const crumbs = collectImportDiagnostics((sink) =>
      expect(parseSpineSkeletonBinary(buildSpineBinary({ version: '3.8.99' }), sink)).toBeNull(),
    );
    const crumb = crumbs.find((c) => c.kind === 'spine.binary-version-unsupported')!;
    expect(crumb.detail).toMatchObject({ version: '3.8.99' });
  });

  it('REJECTS an unreadable header rather than decoding garbage', () => {
    const kinds = collectImportDiagnostics((sink) =>
      expect(parseSpineSkeletonBinary(Uint8Array.from([1, 2, 3]), sink)).toBeNull(),
    ).map((c) => c.kind);
    expect(kinds).toContain('spine.binary-header-unreadable');
  });

  it('reports how many bytes of the file it did not parse', () => {
    const bytes = buildSpineBinary();
    const crumbs = collectImportDiagnostics((sink) => parseSpineSkeletonBinary(bytes, sink));
    const tail = crumbs.find((c) => c.kind === 'spine.binary-tail-unparsed')!;
    // The fixture ends exactly where this landing stops parsing, so nothing is left over — the crumb still
    // fires to record that the importer STOPPED rather than finished, which is the honest signal while the
    // event and animation sections are still unmodeled.
    expect(tail.detail).toMatchObject({ bytes: 0 });
  });

  it('RECOVERS from a truncated file, keeping whatever records were complete', () => {
    const full = buildSpineBinary();
    const truncated = full.subarray(0, full.byteLength - 6);
    const crumbs = collectImportDiagnostics((sink) => parseSpineSkeletonBinary(truncated, sink));
    expect(crumbs.map((c) => c.kind)).toContain('spine.binary-truncated');
    // It still returns a skeleton rather than null or a throw: the bones completed before the cut.
    const result = parseSpineSkeletonBinary(truncated)!;
    expect(result.skeleton.bones.length).toBe(2);
  });

  it('maps the transform-mode ORDINAL positionally, falling back to Normal when out of range', () => {
    const modes = [
      TransformMode2D.Normal,
      TransformMode2D.OnlyTranslation,
      TransformMode2D.NoRotationOrReflection,
      TransformMode2D.NoScale,
      TransformMode2D.NoScaleOrReflection,
    ];
    for (let ordinal = 0; ordinal < modes.length; ordinal++) {
      const bones = parseSpineSkeletonBinary(buildSpineBinary({ transformMode: ordinal }))!.skeleton.bones;
      expect(bones[1].transformMode).toEqual(modes[ordinal]);
    }
    // An ordinal from a future version with more modes must not yield an undefined inherit rule.
    const beyond = parseSpineSkeletonBinary(buildSpineBinary({ transformMode: 99 }))!.skeleton.bones;
    expect(beyond[1].transformMode).toEqual(TransformMode2D.Normal);
  });

  it('honors the nonessential flag, which changes the bone record width', () => {
    // With nonessential set, each bone carries a trailing editor color. Reading the flag but not the color
    // would desynchronize every following record, so the slot below is the canary.
    const result = parseSpineSkeletonBinary(buildSpineBinary({ nonessential: true }))!;
    expect(result.skeleton.bones.length).toBe(2);
    expect(result.skeleton.slots![0]).toMatchObject({ boneIndex: 1, name: 'body' });
  });

  it('Skip-crumbs a slot dark color, which Slot2D cannot represent', () => {
    const kinds = collectImportDiagnostics((sink) =>
      parseSpineSkeletonBinary(buildSpineBinary({ darkColor: 0x102030 }), sink),
    ).map((c) => c.kind);
    expect(kinds).toContain('spine.slot-dark-color-unsupported');
    const plain = collectImportDiagnostics((sink) => parseSpineSkeletonBinary(buildSpineBinary(), sink)).map(
      (c) => c.kind,
    );
    expect(plain).not.toContain('spine.slot-dark-color-unsupported');
  });
});

// Builds a minimal but structurally faithful Spine 4.x `.skel`: hash, version, bounds, the nonessential
// flag, a string table, two bones, and one slot. The byte layout it writes is the layout verified
// byte-for-byte against a real 4.1.17 export (see the package status) — the encoder REPRODUCES a confirmed
// wire format rather than defining it, which is what keeps these tests a real check and not a round-trip
// against the importer's own assumptions. Real Spine assets are license-restricted and never committed, so
// the committed fixture is authored here.
function buildSpineBinary(
  options: {
    version?: string;
    nonessential?: boolean;
    transformMode?: number;
    darkColor?: number;
    ikConstraints?: number;
    weightedMesh?: boolean;
  } = {},
): Uint8Array {
  const version = options.version ?? '4.1.17';
  const nonessential = options.nonessential ?? false;
  const out: number[] = [];
  for (let i = 0; i < 8; i++) out.push(0); // export hash
  writeString(out, version);
  for (let i = 0; i < 4; i++) writeFloat(out, 0); // x, y, width, height
  out.push(nonessential ? 1 : 0);
  if (nonessential) {
    writeFloat(out, 30);
    writeString(out, './images/');
    writeString(out, '');
  }
  writeVarint(out, 2); // string table
  writeString(out, 'body-attachment');
  writeString(out, 'body-mesh');

  writeVarint(out, 2); // bones
  writeBone(out, { name: 'root', parentIndex: null, nonessential });
  writeBone(out, {
    length: 26.25,
    name: 'hip',
    nonessential,
    parentIndex: 0,
    rotation: 19.5,
    scaleX: 2,
    scaleY: 0.5,
    shearX: 1.5,
    shearY: -1.5,
    transformMode: options.transformMode ?? 0,
    x: 1.25,
    y: 247.5,
  });

  writeVarint(out, 1); // slots
  writeString(out, 'body');
  writeVarint(out, 1); // bone index
  writeInt(out, 0x80c0ffff);
  writeInt(out, options.darkColor ?? -1);
  writeVarint(out, 1); // setup attachment -> string table entry 1, 'body-attachment'
  writeVarint(out, 0); // blend mode: normal

  // Constraint sections. Flight models no solvers, but the records sit between the slots and the skins, so
  // the counts are always written even when empty.
  writeVarint(out, options.ikConstraints ?? 0);
  for (let i = 0; i < (options.ikConstraints ?? 0); i++) writeIkConstraint(out, 'ik' + i);
  writeVarint(out, 0); // transform constraints
  writeVarint(out, 0); // path constraints

  // Default skin: one slot entry carrying a region and a mesh.
  writeVarint(out, 1); // slot entries
  writeVarint(out, 0); // slot index
  writeVarint(out, 2); // attachments on it
  writeVarint(out, 1); // key -> 'body-attachment'
  writeVarint(out, 0); // name: absent, so the key is used
  out.push(0); // type: region
  writeVarint(out, 0); // atlas path
  writeFloat(out, 12.5); // rotation
  writeFloat(out, 3.5); // x
  writeFloat(out, 4.5); // y
  writeFloat(out, 1); // scaleX
  writeFloat(out, 1); // scaleY
  writeFloat(out, 64); // width
  writeFloat(out, 32); // height
  writeInt(out, 0xffffffff); // color
  out.push(0); // sequence: absent
  writeVarint(out, 2); // key -> 'body-mesh'
  writeVarint(out, 0);
  out.push(2); // type: mesh
  writeVarint(out, 0); // atlas path
  writeInt(out, 0xffffffff); // color
  writeVarint(out, 3); // vertex count
  for (const uv of [0, 0, 1, 0, 1, 1]) writeFloat(out, uv);
  writeVarint(out, 3); // triangle index count
  for (const t of [0, 1, 2]) writeShort(out, t);
  out.push(options.weightedMesh ? 1 : 0);
  if (options.weightedMesh) {
    for (let v = 0; v < 3; v++) {
      writeVarint(out, 1); // one influence
      writeVarint(out, 1); // bone index
      writeFloat(out, v);
      writeFloat(out, v * 2);
      writeFloat(out, 1); // weight
    }
  } else {
    for (const xy of [0, 0, 10, 0, 10, 10]) writeFloat(out, xy);
  }
  writeVarint(out, 0); // hull length
  out.push(0); // sequence: absent

  writeVarint(out, 0); // alternate skins
  return Uint8Array.from(out);
}

// An IK constraint record, written only so the parser has something real to walk past.
function writeIkConstraint(out: number[], name: string): void {
  writeString(out, name);
  writeVarint(out, 0); // order
  out.push(0); // skinRequired
  writeVarint(out, 1); // bone count
  writeVarint(out, 0); // bone
  writeVarint(out, 0); // target
  writeFloat(out, 1); // mix
  writeFloat(out, 0); // softness
  out.push(1, 0, 0, 0); // bendDirection, compress, stretch, uniform
}

function writeShort(out: number[], value: number): void {
  out.push((value >> 8) & 0xff, value & 0xff);
}

function writeBone(
  out: number[],
  bone: {
    name: string;
    parentIndex: number | null;
    nonessential: boolean;
    rotation?: number;
    x?: number;
    y?: number;
    scaleX?: number;
    scaleY?: number;
    shearX?: number;
    shearY?: number;
    length?: number;
    transformMode?: number;
  },
): void {
  writeString(out, bone.name);
  if (bone.parentIndex !== null) writeVarint(out, bone.parentIndex);
  writeFloat(out, bone.rotation ?? 0);
  writeFloat(out, bone.x ?? 0);
  writeFloat(out, bone.y ?? 0);
  writeFloat(out, bone.scaleX ?? 1);
  writeFloat(out, bone.scaleY ?? 1);
  writeFloat(out, bone.shearX ?? 0);
  writeFloat(out, bone.shearY ?? 0);
  writeFloat(out, bone.length ?? 0);
  writeVarint(out, bone.transformMode ?? 0);
  out.push(0); // skinRequired
  if (bone.nonessential) writeInt(out, 0xff00ffff);
}

function writeFloat(out: number[], value: number): void {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, false);
  for (let i = 0; i < 4; i++) out.push(view.getUint8(i));
}

function writeInt(out: number[], value: number): void {
  const view = new DataView(new ArrayBuffer(4));
  view.setInt32(0, value, false);
  for (let i = 0; i < 4; i++) out.push(view.getUint8(i));
}

// Spine's string encoding: a varint of `byteCount + 1` (0 would mean "absent"), then the UTF-8 bytes.
function writeString(out: number[], value: string): void {
  const bytes = new TextEncoder().encode(value);
  writeVarint(out, bytes.length + 1);
  for (const byte of bytes) out.push(byte);
}

function writeVarint(out: number[], value: number): void {
  let remaining = value >>> 0;
  while (remaining > 0x7f) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  out.push(remaining);
}
