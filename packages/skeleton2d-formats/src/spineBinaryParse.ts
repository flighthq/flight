import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type { Bone2D, ByteReader, ImportDiagnostic, Skeleton2DImport, Slot2D } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, TransformMode2D } from '@flighthq/types/contract';

import {
  createSpineBinaryReader,
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryFloat,
  readSpineBinaryInt,
  readSpineBinaryString,
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
// cannot skip a section it does not model, it can only stop. This landing therefore parses the header,
// string table, bones, and slots, then STOPS and Skip-crumbs the remainder rather than guessing its way
// forward — attachments, skins, events, and animation timelines follow in later increments, and until then
// slots resolve no setup attachment (the skin section that names them has not been read).
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
  const slots = parseSpineBinarySlots(reader, strings, diagnostics);
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

// Spine's slot records, in draw order. The setup attachment is a STRING-TABLE REFERENCE (1-based, 0 meaning
// none) naming an attachment in a skin — but skins are a later section this landing does not reach, so the
// name cannot be resolved to an `Attachment2D` yet and the slot carries `null`. `color`/`darkColor` are
// rgba8888 ints, matching `Slot2D.color`'s packed convention directly; a dark color of -1 means "none".
function parseSpineBinarySlots(
  reader: ByteReader,
  strings: readonly (string | null)[],
  diagnostics?: ImportDiagnostic[],
): Slot2D[] {
  const count = readSpineBinaryVarint(reader);
  const slots: Slot2D[] = [];
  let darkColors = 0;
  for (let i = 0; i < count; i++) {
    if (isSpineBinaryReaderOverrun(reader)) break;
    const name = readSpineBinaryString(reader);
    const boneIndex = readSpineBinaryVarint(reader);
    const color = readSpineBinaryInt(reader) >>> 0;
    if (readSpineBinaryInt(reader) !== SPINE_BINARY_NO_DARK_COLOR) darkColors++;
    readSpineBinaryVarint(reader); // setup attachment: a string-table reference, unresolvable until skins land
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
  return slots;
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
