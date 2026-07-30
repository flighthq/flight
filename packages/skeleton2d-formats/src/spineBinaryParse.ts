import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type {
  Attachment2D,
  Bone2D,
  ByteReader,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  Skeleton2DImport,
  Skin2D,
  Slot2D,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  MeshAttachment2DKind,
  RegionAttachment2DKind,
  TransformMode2D,
} from '@flighthq/types/contract';

import {
  createSpineBinaryReader,
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryByte,
  readSpineBinaryFloat,
  readSpineBinaryInt,
  readSpineBinaryString,
  readSpineBinaryUnsignedShort,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader';

// Parses Spine's `.skel` BINARY skeleton into the same `Skeleton2DImport` `parseSpineSkeleton` produces from
// `.json` — the binary sibling of that parser, mirroring how `parseGlb` sits beside `parseGltf`. Tolerant and
// best-effort on the same terms: `null` is reserved for the "this is not a file we can read" failure
// (unreadable header, unsupported version), and a readable file with unmodeled pieces yields best-effort
// data plus `ImportDiagnostic` crumbs. Wire decoding lives in `spineBinaryReader`; this file owns only the
// RECORD LAYOUT — which field follows which.
//
// The binary is stream-positional in a way JSON is not: records have no keys and no lengths, so a reader
// cannot skip a section it does not model, it can only CONSUME it or stop. That is why the constraint
// records below are walked field-for-field despite Flight modelling no constraint solvers — they stand
// between the slots and the skins. This landing parses through the default skin's attachments (so slots
// resolve their setup attachment) and then STOPS, Skip-crumbing the remainder; events and animation
// timelines follow in a later increment.
//
// VERSION GATE. The layout below is Spine 4.x's and was verified byte-for-byte against a real 4.1.17 export
// (see the package status). Spine changed record layouts across major versions, so a file outside 4.x is
// REJECTED with its version in the crumb instead of being decoded by a layout that does not describe it —
// a wrong layout does not fail loudly, it silently yields plausible garbage.
export function parseSpineSkeletonBinary(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImport | null {
  const reader = createSpineBinaryReader(bytes);
  // The 8-byte hash identifies the export; it carries no skeleton data, so it is stepped over rather than read.
  skipSpineBinaryBytes(reader, SPINE_BINARY_HASH_BYTES);
  const version = readSpineBinaryString(reader);
  if (isSpineBinaryReaderOverrun(reader) || version === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spine.binary-header-unreadable',
      'parseSpineSkeletonBinary',
      { bytes: bytes.byteLength },
    );
    return null;
  }
  if (!isSupportedSpineBinaryVersion(version)) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spine.binary-version-unsupported',
      'parseSpineSkeletonBinary',
      { version },
    );
    return null;
  }
  // Skeleton bounds (x, y, width, height) describe the authoring canvas, which Skeleton2D does not model.
  skipSpineBinaryBytes(reader, SPINE_BINARY_BOUNDS_BYTES);
  // "Nonessential" data is what Spine writes only for editor round-tripping: the authoring frame rate, the
  // images/audio folder paths, and a per-bone editor color. Its PRESENCE changes the record layout below,
  // so the flag has to be carried down even though none of the values are modeled.
  const nonessential = readSpineBinaryBoolean(reader);
  if (nonessential) {
    skipSpineBinaryBytes(reader, SPINE_BINARY_FPS_BYTES);
    readSpineBinaryString(reader); // images path
    readSpineBinaryString(reader); // audio path
  }
  const strings = readSpineBinaryStringTable(reader);
  const bones = parseSpineBinaryBones(reader, nonessential);
  const { attachmentNames, slots } = parseSpineBinarySlots(reader, strings, diagnostics);
  skipSpineBinaryConstraints(reader, diagnostics);
  const skin = parseSpineBinaryDefaultSkin(reader, strings, nonessential, diagnostics);
  // A slot names its setup attachment BEFORE the skin that defines it has been read, so resolution waits
  // until here — the file orders slots first, but the name only means something once the skin exists.
  for (let i = 0; i < slots.length; i++) {
    const name = attachmentNames[i];
    if (name !== null) slots[i].attachment = skin.get(i)?.get(name) ?? null;
  }
  skipCrumbSpineBinaryAlternateSkins(reader, diagnostics);
  if (isSpineBinaryReaderOverrun(reader)) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'spine.binary-truncated',
      'parseSpineSkeletonBinary',
      { bones: bones.length, slots: slots.length },
    );
  } else {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.binary-tail-unparsed',
      'parseSpineSkeletonBinary',
      { bytes: bytes.byteLength - reader.offset },
    );
  }
  return { animations: [], skeleton: createSkeleton2D(bones, slots) };
}

// Whether this importer's record layout describes `version`. Only the 4.x line is claimed: it is what the
// layout was verified against. Anything else (3.8 and earlier, or a future major) is rejected rather than
// guessed, because a mismatched layout desynchronizes the stream and yields plausible-looking garbage.
function isSupportedSpineBinaryVersion(version: string): boolean {
  return version.startsWith('4.');
}

// Spine's bone records, in file order — the order weighted-mesh influences and slot bone references index
// into, and the order that guarantees a parent precedes its children (bone 0 is the root and writes no
// parent index at all).
function parseSpineBinaryBones(reader: ByteReader, nonessential: boolean): Bone2D[] {
  const count = readSpineBinaryVarint(reader);
  const bones: Bone2D[] = [];
  for (let i = 0; i < count; i++) {
    if (isSpineBinaryReaderOverrun(reader)) break;
    const name = readSpineBinaryString(reader);
    const parentIndex = i === 0 ? -1 : readSpineBinaryVarint(reader);
    const rotation = readSpineBinaryFloat(reader);
    const x = readSpineBinaryFloat(reader);
    const y = readSpineBinaryFloat(reader);
    const scaleX = readSpineBinaryFloat(reader);
    const scaleY = readSpineBinaryFloat(reader);
    const shearX = readSpineBinaryFloat(reader);
    const shearY = readSpineBinaryFloat(reader);
    const length = readSpineBinaryFloat(reader);
    const transformMode = spineBinaryTransformMode(readSpineBinaryVarint(reader));
    readSpineBinaryBoolean(reader); // skinRequired — a skin-set feature, not modeled
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES); // editor bone color
    bones.push({ length, name, parentIndex, rotation, scaleX, scaleY, shearX, shearY, transformMode, x, y });
  }
  return bones;
}

// Spine's slot records, in draw order. `color`/`darkColor` are rgba8888 ints, matching `Slot2D.color`'s
// packed convention directly; a dark color of -1 means "none". The setup attachment is a STRING-TABLE
// REFERENCE naming an attachment inside a skin, which the file has not written yet — so the NAME is returned
// alongside the slots and the caller resolves it once the skin is read.
function parseSpineBinarySlots(
  reader: ByteReader,
  strings: readonly (string | null)[],
  diagnostics?: ImportDiagnostic[],
): { attachmentNames: (string | null)[]; slots: Slot2D[] } {
  const count = readSpineBinaryVarint(reader);
  const attachmentNames: (string | null)[] = [];
  const slots: Slot2D[] = [];
  let darkColors = 0;
  for (let i = 0; i < count; i++) {
    if (isSpineBinaryReaderOverrun(reader)) break;
    const name = readSpineBinaryString(reader);
    const boneIndex = readSpineBinaryVarint(reader);
    const color = readSpineBinaryInt(reader) >>> 0;
    if (readSpineBinaryInt(reader) !== SPINE_BINARY_NO_DARK_COLOR) darkColors++;
    attachmentNames.push(readSpineBinaryStringReference(reader, strings));
    readSpineBinaryVarint(reader); // blend mode — Slot2D carries no per-slot blend today
    slots.push({ attachment: null, boneIndex, color, name });
  }
  if (darkColors > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.slot-dark-color-unsupported',
      'parseSpineSkeletonBinary',
      { slots: darkColors },
    );
  }
  return { attachmentNames, slots };
}

// The IK, transform, and path constraint sections. Flight models no constraint solvers (a skeleton2d P2
// concern), but the stream is positional — these records carry no keys and no lengths — so they must be
// CONSUMED field-for-field to reach the skins that follow. Reading them is not optional the way ignoring a
// JSON key is; a single miscounted field desynchronizes every later section.
function skipSpineBinaryConstraints(reader: ByteReader, diagnostics?: ImportDiagnostic[]): void {
  const ik = readSpineBinaryVarint(reader);
  for (let i = 0; i < ik && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryConstraintHead(reader);
    readSpineBinaryVarint(reader); // target bone
    skipSpineBinaryBytes(reader, 8); // mix, softness
    skipSpineBinaryBytes(reader, 4); // bendDirection byte + compress/stretch/uniform booleans
  }
  const transform = readSpineBinaryVarint(reader);
  for (let i = 0; i < transform && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryConstraintHead(reader);
    readSpineBinaryVarint(reader); // target bone
    skipSpineBinaryBytes(reader, 2); // local, relative
    skipSpineBinaryBytes(reader, 48); // six offsets + six mix weights
  }
  const path = readSpineBinaryVarint(reader);
  for (let i = 0; i < path && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryConstraintHead(reader);
    readSpineBinaryVarint(reader); // target slot
    readSpineBinaryVarint(reader); // position mode
    readSpineBinaryVarint(reader); // spacing mode
    readSpineBinaryVarint(reader); // rotate mode
    skipSpineBinaryBytes(reader, 24); // offsetRotation, position, spacing, mixRotate, mixX, mixY
  }
  reportSpineBinaryCrumb(diagnostics, ik, 'spine.ik-constraint-unsupported', 'constraints');
  reportSpineBinaryCrumb(diagnostics, transform, 'spine.transform-constraint-unsupported', 'constraints');
  reportSpineBinaryCrumb(diagnostics, path, 'spine.path-constraint-unsupported', 'constraints');
}

// The head every constraint record shares: name, ordering index, skin-required flag, then its bone list.
function skipSpineBinaryConstraintHead(reader: ByteReader): void {
  readSpineBinaryString(reader);
  readSpineBinaryVarint(reader); // order
  readSpineBinaryBoolean(reader); // skinRequired
  const bones = readSpineBinaryVarint(reader);
  for (let i = 0; i < bones && !isSpineBinaryReaderOverrun(reader); i++) readSpineBinaryVarint(reader);
}

// The default skin: `slotIndex → attachmentName → Attachment2D`. Entries are keyed by an explicit slot index
// and are NOT written in slot order, so the table is a map rather than a positional array. Region and mesh
// attachments are modeled; bounding-box, path, point, clipping, and linked-mesh entries are recognized —
// and still fully consumed, since skipping their bytes is not possible — then Skip-crumbed and dropped.
function parseSpineBinaryDefaultSkin(
  reader: ByteReader,
  strings: readonly (string | null)[],
  nonessential: boolean,
  diagnostics?: ImportDiagnostic[],
): Map<number, Map<string, Attachment2D>> {
  const table = new Map<number, Map<string, Attachment2D>>();
  const slotCount = readSpineBinaryVarint(reader);
  const unmodeled = new Map<string, number>();
  for (let i = 0; i < slotCount && !isSpineBinaryReaderOverrun(reader); i++) {
    const slotIndex = readSpineBinaryVarint(reader);
    const attachments = readSpineBinaryVarint(reader);
    for (let j = 0; j < attachments && !isSpineBinaryReaderOverrun(reader); j++) {
      const key = readSpineBinaryStringReference(reader, strings);
      const attachment = readSpineBinaryAttachment(reader, strings, key, nonessential, unmodeled);
      if (attachment === null || key === null) continue;
      let perSlot = table.get(slotIndex);
      if (perSlot === undefined) {
        perSlot = new Map<string, Attachment2D>();
        table.set(slotIndex, perSlot);
      }
      perSlot.set(key, attachment);
    }
  }
  for (const [type, count] of unmodeled) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      `spine.${type}-attachment-unsupported`,
      'parseSpineSkeletonBinary',
      { attachments: count },
    );
  }
  return table;
}

// One attachment record. Its own name overrides the skin key when present (a slot can show the same image
// under a different key). The type is an ORDINAL into Spine's attachment-type enum, so the order of
// SPINE_BINARY_ATTACHMENT_TYPES is load-bearing.
function readSpineBinaryAttachment(
  reader: ByteReader,
  strings: readonly (string | null)[],
  key: string | null,
  nonessential: boolean,
  unmodeled: Map<string, number>,
): Attachment2D | null {
  const name = readSpineBinaryStringReference(reader, strings) ?? key;
  const ordinal = readSpineBinaryByte(reader);
  const type = ordinal < SPINE_BINARY_ATTACHMENT_TYPES.length ? SPINE_BINARY_ATTACHMENT_TYPES[ordinal] : null;
  if (type === 'region') return readSpineBinaryRegionAttachment(reader, strings, name);
  if (type === 'mesh') return readSpineBinaryMeshAttachment(reader, strings, name, nonessential);
  const label = type ?? 'unknown';
  unmodeled.set(label, (unmodeled.get(label) ?? 0) + 1);
  if (type === 'boundingbox') {
    skipSpineBinaryVertices(reader, readSpineBinaryVarint(reader));
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  } else if (type === 'clipping') {
    readSpineBinaryVarint(reader); // end slot
    skipSpineBinaryVertices(reader, readSpineBinaryVarint(reader));
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  } else if (type === 'point') {
    skipSpineBinaryBytes(reader, 12); // rotation, x, y
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  } else if (type === 'linkedmesh') {
    readSpineBinaryVarint(reader); // path
    skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
    readSpineBinaryVarint(reader); // skin name
    readSpineBinaryVarint(reader); // parent mesh
    readSpineBinaryBoolean(reader); // inherit timelines
    skipSpineBinarySequence(reader);
    if (nonessential) skipSpineBinaryBytes(reader, 8); // width, height
  } else if (type === 'path') {
    skipSpineBinaryBytes(reader, 2); // closed, constantSpeed
    const vertexCount = readSpineBinaryVarint(reader);
    skipSpineBinaryVertices(reader, vertexCount);
    skipSpineBinaryBytes(reader, Math.floor(vertexCount / 3) * 4); // per-curve lengths
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  }
  // An unknown ordinal cannot be stepped over — its payload width is unknown — so the stream is abandoned
  // by marking overrun rather than guessing and emitting garbage for everything after it.
  if (type === null) skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
  return null;
}

// A mesh attachment. `uvs` and `triangles` map straight across; the vertex stream is either rigid positions
// (local to the slot's bone) or a weighted `Skin2D` whose influences are already in Flight's
// `[boneIndex, x, y, weight]` layout, so no re-packing is needed.
function readSpineBinaryMeshAttachment(
  reader: ByteReader,
  strings: readonly (string | null)[],
  name: string | null,
  nonessential: boolean,
): MeshAttachment2D {
  readSpineBinaryVarint(reader); // atlas region path — resolved at atlas-binding time
  skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  const vertexCount = readSpineBinaryVarint(reader);
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < uvs.length; i++) uvs[i] = readSpineBinaryFloat(reader);
  const triangleCount = readSpineBinaryVarint(reader);
  const triangles = new Uint16Array(triangleCount);
  for (let i = 0; i < triangleCount; i++) triangles[i] = readSpineBinaryUnsignedShort(reader);
  const geometry = readSpineBinaryVertices(reader, vertexCount);
  readSpineBinaryVarint(reader); // hull length — a rendering hint Flight does not model
  skipSpineBinarySequence(reader);
  if (nonessential) {
    const edges = readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, edges * 2 + 8); // editor edge list, then width and height
  }
  return {
    kind: MeshAttachment2DKind,
    name,
    skin: geometry.skin,
    triangles,
    uvs,
    vertexCount,
    vertices: geometry.vertices,
  };
}

// A region attachment. Width/height are the source region's size in the atlas; `path` names the atlas region
// and is resolved when the `.atlas` sidecar binds, which is `@flighthq/spritesheet-formats`' domain.
function readSpineBinaryRegionAttachment(
  reader: ByteReader,
  strings: readonly (string | null)[],
  name: string | null,
): RegionAttachment2D {
  readSpineBinaryVarint(reader); // atlas region path
  const rotation = readSpineBinaryFloat(reader);
  const x = readSpineBinaryFloat(reader);
  const y = readSpineBinaryFloat(reader);
  const scaleX = readSpineBinaryFloat(reader);
  const scaleY = readSpineBinaryFloat(reader);
  const width = readSpineBinaryFloat(reader);
  const height = readSpineBinaryFloat(reader);
  skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  skipSpineBinarySequence(reader);
  return { height, kind: RegionAttachment2DKind, name, rotation, scaleX, scaleY, width, x, y };
}

// A vertex stream: a leading flag picks rigid positions (2 floats per vertex, in the slot bone's space) or
// weighted influences (per vertex, a count then that many bone/x/y/weight quads).
function readSpineBinaryVertices(
  reader: ByteReader,
  vertexCount: number,
): { skin: Skin2D | null; vertices: Float32Array | null } {
  if (!readSpineBinaryBoolean(reader)) {
    const vertices = new Float32Array(vertexCount * 2);
    for (let i = 0; i < vertices.length; i++) vertices[i] = readSpineBinaryFloat(reader);
    return { skin: null, vertices };
  }
  const influenceCounts = new Uint16Array(vertexCount);
  const influences: number[] = [];
  for (let v = 0; v < vertexCount && !isSpineBinaryReaderOverrun(reader); v++) {
    const count = readSpineBinaryVarint(reader);
    influenceCounts[v] = count;
    for (let i = 0; i < count; i++) {
      influences.push(
        readSpineBinaryVarint(reader),
        readSpineBinaryFloat(reader),
        readSpineBinaryFloat(reader),
        readSpineBinaryFloat(reader),
      );
    }
  }
  return { skin: { influenceCounts, influences: Float32Array.from(influences) }, vertices: null };
}

// Consumes a vertex stream whose geometry is not kept (an unmodeled attachment type still occupies bytes).
function skipSpineBinaryVertices(reader: ByteReader, vertexCount: number): void {
  readSpineBinaryVertices(reader, vertexCount);
}

// Spine 4.1 added an optional `sequence` block to image-backed attachments, describing a numbered frame set.
// Flight does not model it, but its PRESENCE FLAG is always written, so it must be consumed — this single
// byte is what desynchronizes every later record if it is missed.
function skipSpineBinarySequence(reader: ByteReader): void {
  if (!readSpineBinaryBoolean(reader)) return;
  readSpineBinaryVarint(reader); // frame count
  readSpineBinaryVarint(reader); // start index
  readSpineBinaryVarint(reader); // digit count
  readSpineBinaryVarint(reader); // setup index
}

// Alternate (named) skins are the skin-set feature Flight does not model. Only the COUNT is read: their
// bodies fall inside the unparsed tail this landing stops at.
function skipCrumbSpineBinaryAlternateSkins(reader: ByteReader, diagnostics?: ImportDiagnostic[]): void {
  reportSpineBinaryCrumb(diagnostics, readSpineBinaryVarint(reader), 'spine.alternate-skin-unsupported', 'skins');
}

// Resolves a 1-based string-table index (0 meaning "no string") into its pooled string.
function readSpineBinaryStringReference(reader: ByteReader, strings: readonly (string | null)[]): string | null {
  const index = readSpineBinaryVarint(reader);
  return index > 0 && index <= strings.length ? strings[index - 1] : null;
}

// Reports one aggregated Skip crumb for a recognized-but-unmodeled section, keyed by its element count.
function reportSpineBinaryCrumb(
  diagnostics: ImportDiagnostic[] | undefined,
  count: number,
  kind: string,
  unit: string,
): void {
  if (count > 0) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, kind, 'parseSpineSkeletonBinary', {
      [unit]: count,
    });
  }
}

// The file-wide string pool that later sections reference by 1-based index (0 = no string). Reading it is
// what makes those references resolvable, so it is consumed even though this landing resolves none yet.
function readSpineBinaryStringTable(reader: ByteReader): (string | null)[] {
  const count = readSpineBinaryVarint(reader);
  const strings: (string | null)[] = [];
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) strings.push(readSpineBinaryString(reader));
  return strings;
}

// Spine writes the bone transform mode as an ORDINAL into its own enum, so the mapping is positional rather
// than by name (the `.json` sibling reads the same modes as strings). An out-of-range ordinal — a file from a
// version with more modes — falls back to Normal rather than producing an undefined inherit rule.
function spineBinaryTransformMode(ordinal: number): (typeof SPINE_BINARY_TRANSFORM_MODES)[number] {
  return ordinal >= 0 && ordinal < SPINE_BINARY_TRANSFORM_MODES.length
    ? SPINE_BINARY_TRANSFORM_MODES[ordinal]
    : TransformMode2D.Normal;
}

// Fixed-width header fields the importer steps over: the 8-byte export hash, the four floats of the
// authoring bounds, the nonessential frame rate, and a packed rgba8888 color.
const SPINE_BINARY_BOUNDS_BYTES = 16;
const SPINE_BINARY_COLOR_BYTES = 4;
const SPINE_BINARY_FPS_BYTES = 4;
const SPINE_BINARY_HASH_BYTES = 8;

// Spine's attachment types in its own enum ORDER — the file writes an ordinal into this list, so the order
// is load-bearing and must not be alphabetized.
const SPINE_BINARY_ATTACHMENT_TYPES = [
  'region',
  'boundingbox',
  'mesh',
  'linkedmesh',
  'path',
  'point',
  'clipping',
] as const;

// Spine writes -1 into a slot's dark color to mean "this slot has none".
const SPINE_BINARY_NO_DARK_COLOR = -1;

// The bone transform modes in Spine's own enum ORDER — the ordinal written in the file indexes this array,
// so the order is load-bearing and must not be alphabetized.
const SPINE_BINARY_TRANSFORM_MODES = [
  TransformMode2D.Normal,
  TransformMode2D.OnlyTranslation,
  TransformMode2D.NoRotationOrReflection,
  TransformMode2D.NoScale,
  TransformMode2D.NoScaleOrReflection,
] as const;
