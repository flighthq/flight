import { addNodeChild, setNodeLocalMatrix } from '@flighthq/node/contract';
import {
  createScene2DDocument,
  createScene2DSlotReference,
  registerScene2DDocumentImporter,
} from '@flighthq/scene2d-resources/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  Scene2DContentReference,
  Scene2DDocument,
  Scene2DDocumentImportContext,
  Scene2DDocumentImporterRegistry,
} from '@flighthq/types/contract';

export function createScene2DFromSwf(source: Uint8Array): Scene2DDocument | null {
  const header = new SwfReader(source, 0, source.length);
  const signature = header.readUint8();
  if (signature !== FWS_SIGNATURE || header.readUint8() !== W_SIGNATURE || header.readUint8() !== S_SIGNATURE) {
    return null;
  }

  const version = header.readUint8();
  const fileLength = header.readUint32();
  if (!header.valid || version === 0 || fileLength < MIN_SWF_LENGTH || fileLength > source.length) return null;

  const body = new SwfReader(source, SWF_PREFIX_LENGTH, fileLength);
  if (!readSwfRectangle(body)) return null;
  body.readUint16();
  body.readUint16();
  if (!body.valid) return null;

  const parsed = readSwfTags(body);
  if (parsed === null) return null;

  const root = createDisplayObject();
  const references: Scene2DContentReference[] = [];
  const placements = [...parsed.placements.values()].sort((a, b) => a.depth - b.depth);
  for (const placement of placements) {
    if (!placement.name) continue;
    const target = createDisplayObject();
    setNodeLocalMatrix(target, placement.matrix);
    addNodeChild(root, target);
    references.push(
      createScene2DSlotReference(
        placement.name,
        target,
        placement.directLinkage ?? parsed.linkages.get(placement.characterId) ?? null,
      ),
    );
  }

  return createScene2DDocument(root, references, 'swf');
}

export function registerSwfScene2DDocumentImporter(registry: Scene2DDocumentImporterRegistry): void {
  registerScene2DDocumentImporter(registry, 'swf', matchesSwfDocument, (source) => createScene2DFromSwf(source));
}

interface SwfMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

interface SwfPlacement {
  characterId: number;
  depth: number;
  directLinkage: string | null;
  matrix: SwfMatrix;
  name: string | null;
}

interface SwfTagResult {
  linkages: Map<number, string>;
  placements: Map<number, SwfPlacement>;
}

class SwfReader {
  bitPosition = 0;
  pos: number;
  valid = true;

  constructor(
    readonly source: Uint8Array,
    start: number,
    readonly end: number,
  ) {
    this.pos = start;
  }

  alignToByte(): void {
    if (this.bitPosition === 0) return;
    this.bitPosition = 0;
    this.pos++;
  }

  readSignedBits(count: number): number {
    const value = this.readUnsignedBits(count);
    if (count === 0) return 0;
    const sign = 2 ** (count - 1);
    return value >= sign ? value - 2 ** count : value;
  }

  readString(): string {
    this.alignToByte();
    const start = this.pos;
    while (this.pos < this.end && this.source[this.pos] !== 0) this.pos++;
    if (this.pos >= this.end) {
      this.valid = false;
      return '';
    }
    const value = _decoder.decode(this.source.subarray(start, this.pos));
    this.pos++;
    return value;
  }

  readUint8(): number {
    this.alignToByte();
    if (this.pos >= this.end) {
      this.valid = false;
      return 0;
    }
    return this.source[this.pos++];
  }

  readUint16(): number {
    const low = this.readUint8();
    const high = this.readUint8();
    return low + high * 0x100;
  }

  readUint32(): number {
    const low = this.readUint16();
    const high = this.readUint16();
    return low + high * 0x10000;
  }

  readUnsignedBits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++) {
      if (this.pos >= this.end) {
        this.valid = false;
        return 0;
      }
      value = value * 2 + ((this.source[this.pos] >> (7 - this.bitPosition)) & 1);
      this.bitPosition++;
      if (this.bitPosition === 8) {
        this.bitPosition = 0;
        this.pos++;
      }
    }
    return value;
  }
}

function matchesSwfDocument(source: Uint8Array, context: Readonly<Scene2DDocumentImportContext>): boolean {
  if (context.mimeType === SWF_MIME_TYPE) return true;
  if (source.length < 3 || source[1] !== W_SIGNATURE || source[2] !== S_SIGNATURE) return false;
  return source[0] === FWS_SIGNATURE || source[0] === CWS_SIGNATURE || source[0] === ZWS_SIGNATURE;
}

function readPlaceObject(body: SwfReader, placements: Map<number, SwfPlacement>, isPlaceObject3: boolean): void {
  const flags = body.readUint8();
  const extendedFlags = isPlaceObject3 ? body.readUint8() : 0;
  const depth = body.readUint16();
  const existing = placements.get(depth);
  const hasCharacter = (flags & 0x02) !== 0;
  const hasClassName = (extendedFlags & 0x08) !== 0 || ((extendedFlags & 0x10) !== 0 && hasCharacter);
  const directLinkage = hasClassName ? body.readString() : (existing?.directLinkage ?? null);
  const characterId = hasCharacter ? body.readUint16() : (existing?.characterId ?? 0);
  const matrix = (flags & 0x04) !== 0 ? readSwfMatrix(body) : (existing?.matrix ?? IDENTITY_MATRIX);
  if ((flags & 0x08) !== 0) readSwfColorTransform(body);
  if ((flags & 0x10) !== 0) body.readUint16();
  const name = (flags & 0x20) !== 0 ? body.readString() : (existing?.name ?? null);

  if (!body.valid || (characterId === 0 && directLinkage === null)) return;
  placements.set(depth, { characterId, depth, directLinkage, matrix, name });
}

function readSwfColorTransform(reader: SwfReader): void {
  const hasAdd = reader.readUnsignedBits(1) !== 0;
  const hasMultiply = reader.readUnsignedBits(1) !== 0;
  const bits = reader.readUnsignedBits(4);
  if (hasMultiply) {
    for (let i = 0; i < 4; i++) reader.readSignedBits(bits);
  }
  if (hasAdd) {
    for (let i = 0; i < 4; i++) reader.readSignedBits(bits);
  }
  reader.alignToByte();
}

function readSwfLinkages(body: SwfReader, linkages: Map<number, string>): void {
  const count = body.readUint16();
  for (let i = 0; i < count && body.valid; i++) {
    const characterId = body.readUint16();
    const name = body.readString();
    if (name) linkages.set(characterId, name);
  }
}

function readSwfMatrix(reader: SwfReader): SwfMatrix {
  let a = 1;
  let d = 1;
  if (reader.readUnsignedBits(1) !== 0) {
    const scaleBits = reader.readUnsignedBits(5);
    a = reader.readSignedBits(scaleBits) / FIXED_16_ONE;
    d = reader.readSignedBits(scaleBits) / FIXED_16_ONE;
  }

  let b = 0;
  let c = 0;
  if (reader.readUnsignedBits(1) !== 0) {
    const rotateBits = reader.readUnsignedBits(5);
    b = reader.readSignedBits(rotateBits) / FIXED_16_ONE;
    c = reader.readSignedBits(rotateBits) / FIXED_16_ONE;
  }

  const translateBits = reader.readUnsignedBits(5);
  const tx = reader.readSignedBits(translateBits) / TWIPS_PER_PIXEL;
  const ty = reader.readSignedBits(translateBits) / TWIPS_PER_PIXEL;
  reader.alignToByte();
  return { a, b, c, d, tx, ty };
}

function readSwfRectangle(reader: SwfReader): boolean {
  const bits = reader.readUnsignedBits(5);
  for (let i = 0; i < 4; i++) reader.readSignedBits(bits);
  reader.alignToByte();
  return reader.valid;
}

function readSwfTags(reader: SwfReader): SwfTagResult | null {
  const linkages = new Map<number, string>();
  const placements = new Map<number, SwfPlacement>();
  let firstFrame: Map<number, SwfPlacement> | null = null;
  let foundEnd = false;

  while (reader.pos < reader.end && reader.valid) {
    const tagHeader = reader.readUint16();
    const code = tagHeader >> 6;
    const shortLength = tagHeader & 0x3f;
    const length = shortLength === 0x3f ? reader.readUint32() : shortLength;
    const bodyEnd = reader.pos + length;
    if (!reader.valid || bodyEnd > reader.end) return null;

    const body = new SwfReader(reader.source, reader.pos, bodyEnd);
    reader.pos = bodyEnd;
    if (code === TAG_END) {
      foundEnd = true;
      break;
    }
    if (code === TAG_SHOW_FRAME) {
      firstFrame ??= new Map(placements);
    } else if (code === TAG_PLACE_OBJECT_2) {
      readPlaceObject(body, placements, false);
    } else if (code === TAG_REMOVE_OBJECT_2) {
      placements.delete(body.readUint16());
    } else if (code === TAG_EXPORT_ASSETS || code === TAG_SYMBOL_CLASS) {
      readSwfLinkages(body, linkages);
    } else if (code === TAG_PLACE_OBJECT_3) {
      readPlaceObject(body, placements, true);
    }
    if (!body.valid) return null;
  }

  if (!reader.valid || !foundEnd) return null;
  return { linkages, placements: firstFrame ?? placements };
}

const CWS_SIGNATURE = 0x43;
const FIXED_16_ONE = 0x10000;
const FWS_SIGNATURE = 0x46;
const IDENTITY_MATRIX: SwfMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const MIN_SWF_LENGTH = 12;
const S_SIGNATURE = 0x53;
const SWF_MIME_TYPE = 'application/x-shockwave-flash';
const SWF_PREFIX_LENGTH = 8;
const TAG_END = 0;
const TAG_EXPORT_ASSETS = 56;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_REMOVE_OBJECT_2 = 28;
const TAG_SHOW_FRAME = 1;
const TAG_SYMBOL_CLASS = 76;
const TWIPS_PER_PIXEL = 20;
const W_SIGNATURE = 0x57;
const ZWS_SIGNATURE = 0x5a;
const _decoder = new TextDecoder();
