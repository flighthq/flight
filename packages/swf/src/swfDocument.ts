import { addNodeChild, getNodeRuntime, setNodeLocalMatrix } from '@flighthq/node/contract';
import {
  createScene2DDocument,
  createScene2DSlotReference,
  registerScene2DDocumentImporter,
} from '@flighthq/scene2d-resources/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  BoundsNodeAny,
  Node2DData,
  Node2DRuntime,
  Rectangle,
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
  const stageBounds = readSwfRectangle(body);
  if (stageBounds === null) return null;
  body.readUint16();
  body.readUint16();
  if (!body.valid) return null;

  const parsed = readSwfTags(body);
  if (parsed === null) return null;

  const root = createSwfDisplayObject(stageBounds);
  const references: Scene2DContentReference[] = [];
  const instantiation: SwfInstantiationState = {
    activeSymbols: new Set<number>(),
    resolvingBounds: new Set<number>(),
    resolvedBounds: new Map<number, SwfRectangle | null>(),
    remainingNodes: MAX_INSTANTIATED_NODES,
  };
  if (!appendSwfPlacements(root, parsed.placements, parsed, references, instantiation, 0)) return null;

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

interface SwfRectangle {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface SwfDisplayObjectData extends Node2DData {
  authoredBounds: SwfRectangle;
}

interface SwfPlacement {
  characterId: number;
  depth: number;
  directLinkage: string | null;
  matrix: SwfMatrix;
  name: string | null;
}

interface SwfTagResult {
  characterBounds: Map<number, SwfRectangle>;
  linkages: Map<number, string>;
  placements: Map<number, SwfPlacement>;
  sprites: Map<number, SwfSpriteDefinition>;
}

interface SwfSpriteDefinition {
  placements: Map<number, SwfPlacement>;
}

interface SwfParseState {
  characterBounds: Map<number, SwfRectangle>;
  definedCharacters: Set<number>;
  linkages: Map<number, string>;
  sprites: Map<number, SwfSpriteDefinition>;
}

interface SwfInstantiationState {
  activeSymbols: Set<number>;
  remainingNodes: number;
  resolvedBounds: Map<number, SwfRectangle | null>;
  resolvingBounds: Set<number>;
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

function appendSwfPlacements(
  parent: ReturnType<typeof createDisplayObject>,
  placements: ReadonlyMap<number, SwfPlacement>,
  parsed: Readonly<SwfTagResult>,
  references: Scene2DContentReference[],
  state: SwfInstantiationState,
  depth: number,
): boolean {
  if (depth > MAX_SPRITE_NESTING) return false;

  const ordered = [...placements.values()].sort((a, b) => a.depth - b.depth);
  for (const placement of ordered) {
    const sprite = parsed.sprites.get(placement.characterId);
    if (!placement.name && sprite === undefined) continue;
    if (state.remainingNodes === 0) return false;
    state.remainingNodes--;

    const target = createSwfDisplayObject(resolveSwfCharacterBounds(parsed, placement.characterId, state, 0));
    setNodeLocalMatrix(target, placement.matrix);
    addNodeChild(parent, target);
    if (placement.name) {
      references.push(
        createScene2DSlotReference(
          placement.name,
          target,
          placement.directLinkage ?? parsed.linkages.get(placement.characterId) ?? null,
        ),
      );
    }

    if (sprite !== undefined) {
      if (state.activeSymbols.has(placement.characterId)) return false;
      state.activeSymbols.add(placement.characterId);
      const appended = appendSwfPlacements(target, sprite.placements, parsed, references, state, depth + 1);
      state.activeSymbols.delete(placement.characterId);
      if (!appended) return false;
    }
  }
  return true;
}

function computeSwfLocalBoundsRectangle(out: Rectangle, source: Readonly<BoundsNodeAny>): void {
  const bounds = (source.data as SwfDisplayObjectData).authoredBounds;
  out.x = bounds.x;
  out.y = bounds.y;
  out.width = bounds.width;
  out.height = bounds.height;
}

function createSwfDisplayObject(bounds: SwfRectangle | null): ReturnType<typeof createDisplayObject> {
  const target = createDisplayObject();
  if (bounds !== null) {
    target.data = { authoredBounds: { ...bounds } } as SwfDisplayObjectData;
    (getNodeRuntime(target) as Node2DRuntime).computeLocalBoundsRectangle = computeSwfLocalBoundsRectangle;
  }
  return target;
}

function mergeSwfRectangles(a: SwfRectangle, b: Readonly<SwfRectangle>): SwfRectangle {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { height: maxY - y, width: maxX - x, x, y };
}

function resolveSwfCharacterBounds(
  parsed: Readonly<SwfTagResult>,
  characterId: number,
  state: SwfInstantiationState,
  depth: number,
): SwfRectangle | null {
  const direct = parsed.characterBounds.get(characterId);
  if (direct !== undefined) return direct;
  if (state.resolvedBounds.has(characterId)) return state.resolvedBounds.get(characterId) ?? null;
  const sprite = parsed.sprites.get(characterId);
  if (sprite === undefined || depth > MAX_SPRITE_NESTING || state.resolvingBounds.has(characterId)) return null;

  state.resolvingBounds.add(characterId);
  let bounds: SwfRectangle | null = null;
  for (const placement of sprite.placements.values()) {
    const childBounds = resolveSwfCharacterBounds(parsed, placement.characterId, state, depth + 1);
    if (childBounds === null) continue;
    const transformed = transformSwfRectangle(childBounds, placement.matrix);
    bounds = bounds === null ? transformed : mergeSwfRectangles(bounds, transformed);
  }
  state.resolvingBounds.delete(characterId);
  state.resolvedBounds.set(characterId, bounds);
  return bounds;
}

function transformSwfRectangle(bounds: Readonly<SwfRectangle>, matrix: Readonly<SwfMatrix>): SwfRectangle {
  const x0 = matrix.a * bounds.x + matrix.c * bounds.y + matrix.tx;
  const y0 = matrix.b * bounds.x + matrix.d * bounds.y + matrix.ty;
  const x1 = matrix.a * (bounds.x + bounds.width) + matrix.c * bounds.y + matrix.tx;
  const y1 = matrix.b * (bounds.x + bounds.width) + matrix.d * bounds.y + matrix.ty;
  const x2 = matrix.a * bounds.x + matrix.c * (bounds.y + bounds.height) + matrix.tx;
  const y2 = matrix.b * bounds.x + matrix.d * (bounds.y + bounds.height) + matrix.ty;
  const x3 = matrix.a * (bounds.x + bounds.width) + matrix.c * (bounds.y + bounds.height) + matrix.tx;
  const y3 = matrix.b * (bounds.x + bounds.width) + matrix.d * (bounds.y + bounds.height) + matrix.ty;
  const x = Math.min(x0, x1, x2, x3);
  const y = Math.min(y0, y1, y2, y3);
  const maxX = Math.max(x0, x1, x2, x3);
  const maxY = Math.max(y0, y1, y2, y3);
  return { height: maxY - y, width: maxX - x, x, y };
}

function readPlaceObject(body: SwfReader, placements: Map<number, SwfPlacement>, hasExtendedFlags: boolean): void {
  const flags = body.readUint8();
  const extendedFlags = hasExtendedFlags ? body.readUint8() : 0;
  const depth = body.readUint16();
  const existing = placements.get(depth);
  const isMove = (flags & 0x01) !== 0;
  const inherited = isMove ? existing : undefined;
  const hasCharacter = (flags & 0x02) !== 0;
  const hasClassName = (extendedFlags & 0x08) !== 0 || ((extendedFlags & 0x10) !== 0 && hasCharacter);
  const directLinkage = hasClassName ? body.readString() : (inherited?.directLinkage ?? null);
  const characterId = hasCharacter ? body.readUint16() : (inherited?.characterId ?? 0);
  const matrix = (flags & 0x04) !== 0 ? readSwfMatrix(body) : (inherited?.matrix ?? IDENTITY_MATRIX);
  if ((flags & 0x08) !== 0) readSwfColorTransform(body);
  if ((flags & 0x10) !== 0) body.readUint16();
  const name = (flags & 0x20) !== 0 ? body.readString() : (inherited?.name ?? null);

  if (!body.valid || (isMove && existing === undefined) || (characterId === 0 && directLinkage === null)) return;
  placements.set(depth, { characterId, depth, directLinkage, matrix, name });
}

function readLegacyPlaceObject(body: SwfReader, placements: Map<number, SwfPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  const matrix = readSwfMatrix(body);
  if (body.pos < body.end) readSwfColorTransform(body, 3);
  if (!body.valid || characterId === 0) return;
  placements.set(depth, { characterId, depth, directLinkage: null, matrix, name: null });
}

function readLegacyRemoveObject(body: SwfReader, placements: Map<number, SwfPlacement>): void {
  const characterId = body.readUint16();
  const depth = body.readUint16();
  if (!body.valid) return;
  const existing = placements.get(depth);
  if (existing?.characterId === characterId) placements.delete(depth);
}

function readSwfColorTransform(reader: SwfReader, channelCount = 4): void {
  const hasAdd = reader.readUnsignedBits(1) !== 0;
  const hasMultiply = reader.readUnsignedBits(1) !== 0;
  const bits = reader.readUnsignedBits(4);
  if (hasMultiply) {
    for (let i = 0; i < channelCount; i++) reader.readSignedBits(bits);
  }
  if (hasAdd) {
    for (let i = 0; i < channelCount; i++) reader.readSignedBits(bits);
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

function readSwfRectangle(reader: SwfReader): SwfRectangle | null {
  const bits = reader.readUnsignedBits(5);
  const xMin = reader.readSignedBits(bits);
  const xMax = reader.readSignedBits(bits);
  const yMin = reader.readSignedBits(bits);
  const yMax = reader.readSignedBits(bits);
  reader.alignToByte();
  if (!reader.valid || bits === 0 || xMax < xMin || yMax < yMin) return null;
  return {
    height: (yMax - yMin) / TWIPS_PER_PIXEL,
    width: (xMax - xMin) / TWIPS_PER_PIXEL,
    x: xMin / TWIPS_PER_PIXEL,
    y: yMin / TWIPS_PER_PIXEL,
  };
}

function readSwfTags(reader: SwfReader): SwfTagResult | null {
  const state: SwfParseState = {
    characterBounds: new Map<number, SwfRectangle>(),
    definedCharacters: new Set<number>(),
    linkages: new Map<number, string>(),
    sprites: new Map<number, SwfSpriteDefinition>(),
  };
  const placements = readSwfTimeline(reader, state);
  if (placements === null) return null;
  return {
    characterBounds: state.characterBounds,
    linkages: state.linkages,
    placements,
    sprites: state.sprites,
  };
}

function readSwfTimeline(reader: SwfReader, state: SwfParseState): Map<number, SwfPlacement> | null {
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
    } else if (code === TAG_PLACE_OBJECT) {
      readLegacyPlaceObject(body, placements);
    } else if (code === TAG_PLACE_OBJECT_2) {
      readPlaceObject(body, placements, false);
    } else if (code === TAG_REMOVE_OBJECT) {
      readLegacyRemoveObject(body, placements);
    } else if (code === TAG_REMOVE_OBJECT_2) {
      placements.delete(body.readUint16());
    } else if (code === TAG_EXPORT_ASSETS || code === TAG_SYMBOL_CLASS) {
      readSwfLinkages(body, state.linkages);
    } else if (code === TAG_DEFINE_BITS_JPEG_2 || code === TAG_DEFINE_BITS_JPEG_3 || code === TAG_DEFINE_BITS_JPEG_4) {
      if (!readSwfEmbeddedImageDefinition(body, state, code)) return null;
    } else if (code === TAG_DEFINE_BITS_LOSSLESS || code === TAG_DEFINE_BITS_LOSSLESS_2) {
      if (!readSwfLosslessBitmapDefinition(body, state, code === TAG_DEFINE_BITS_LOSSLESS_2)) return null;
    } else if (code === TAG_DEFINE_VIDEO_STREAM) {
      if (!readSwfVideoDefinition(body, state)) return null;
    } else if (isSwfBoundedDefinitionTag(code)) {
      if (
        !readSwfBoundedDefinition(body, state, code === TAG_DEFINE_MORPH_SHAPE || code === TAG_DEFINE_MORPH_SHAPE_2)
      ) {
        return null;
      }
    } else if (code === TAG_DEFINE_SPRITE) {
      const spriteId = body.readUint16();
      body.readUint16();
      if (!body.valid || spriteId === 0 || state.definedCharacters.has(spriteId)) return null;
      state.definedCharacters.add(spriteId);
      const spriteReader = new SwfReader(body.source, body.pos, body.end);
      const spritePlacements = readSwfTimeline(spriteReader, state);
      if (spritePlacements === null || spriteReader.pos !== spriteReader.end) {
        return null;
      }
      state.sprites.set(spriteId, { placements: spritePlacements });
    } else if (code === TAG_PLACE_OBJECT_3 || code === TAG_PLACE_OBJECT_4) {
      readPlaceObject(body, placements, true);
    }
    if (!body.valid) return null;
  }

  if (!reader.valid || !foundEnd) return null;
  return firstFrame ?? placements;
}

function isSwfBoundedDefinitionTag(code: number): boolean {
  return (
    code === TAG_DEFINE_SHAPE ||
    code === TAG_DEFINE_SHAPE_2 ||
    code === TAG_DEFINE_SHAPE_3 ||
    code === TAG_DEFINE_SHAPE_4 ||
    code === TAG_DEFINE_TEXT ||
    code === TAG_DEFINE_TEXT_2 ||
    code === TAG_DEFINE_EDIT_TEXT ||
    code === TAG_DEFINE_MORPH_SHAPE ||
    code === TAG_DEFINE_MORPH_SHAPE_2
  );
}

function readSwfBoundedDefinition(body: SwfReader, state: SwfParseState, hasEndBounds: boolean): boolean {
  const characterId = body.readUint16();
  const startBounds = readSwfRectangle(body);
  const endBounds = hasEndBounds ? readSwfRectangle(body) : null;
  if (
    !body.valid ||
    characterId === 0 ||
    startBounds === null ||
    (hasEndBounds && endBounds === null) ||
    state.definedCharacters.has(characterId)
  ) {
    return false;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, endBounds === null ? startBounds : mergeSwfRectangles(startBounds, endBounds));
  return true;
}

function readSwfEmbeddedImageDefinition(body: SwfReader, state: SwfParseState, code: number): boolean {
  const characterId = body.readUint16();
  let imageStart = body.pos;
  let imageEnd = body.end;
  if (code === TAG_DEFINE_BITS_JPEG_3 || code === TAG_DEFINE_BITS_JPEG_4) {
    const alphaDataOffset = body.readUint32();
    const alphaOffsetBase = body.pos;
    if (code === TAG_DEFINE_BITS_JPEG_4) body.readUint16();
    imageStart = body.pos;
    imageEnd = alphaOffsetBase + alphaDataOffset;
  }
  if (
    !body.valid ||
    characterId === 0 ||
    imageEnd < imageStart ||
    imageEnd > body.end ||
    state.definedCharacters.has(characterId)
  ) {
    return false;
  }
  const bounds = readSwfEmbeddedImageBounds(body.source, imageStart, imageEnd);
  if (bounds === null) return false;
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, bounds);
  return true;
}

function readSwfEmbeddedImageBounds(source: Uint8Array, start: number, end: number): SwfRectangle | null {
  if (
    end - start >= 24 &&
    source[start] === 0x89 &&
    source[start + 1] === 0x50 &&
    source[start + 2] === 0x4e &&
    source[start + 3] === 0x47 &&
    source[start + 4] === 0x0d &&
    source[start + 5] === 0x0a &&
    source[start + 6] === 0x1a &&
    source[start + 7] === 0x0a &&
    readBigEndianUint32(source, start + 8) === 13 &&
    source[start + 12] === 0x49 &&
    source[start + 13] === 0x48 &&
    source[start + 14] === 0x44 &&
    source[start + 15] === 0x52
  ) {
    return createSwfDimensionBounds(readBigEndianUint32(source, start + 16), readBigEndianUint32(source, start + 20));
  }

  if (
    end - start >= 10 &&
    source[start] === 0x47 &&
    source[start + 1] === 0x49 &&
    source[start + 2] === 0x46 &&
    source[start + 3] === 0x38 &&
    (source[start + 4] === 0x37 || source[start + 4] === 0x39) &&
    source[start + 5] === 0x61
  ) {
    return createSwfDimensionBounds(
      source[start + 6] + source[start + 7] * 0x100,
      source[start + 8] + source[start + 9] * 0x100,
    );
  }

  if (end - start < 4 || source[start] !== 0xff || source[start + 1] !== JPEG_START_OF_IMAGE) return null;
  let pos = start + 2;
  while (pos < end) {
    if (source[pos++] !== 0xff) return null;
    while (pos < end && source[pos] === 0xff) pos++;
    if (pos >= end) return null;
    const marker = source[pos++];
    if (marker === JPEG_END_OF_IMAGE || marker === JPEG_START_OF_SCAN) return null;
    if (marker === JPEG_START_OF_IMAGE || marker === JPEG_TEMPORARY || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (pos + 2 > end) return null;
    const length = readBigEndianUint16(source, pos);
    if (length < 2 || pos + length > end) return null;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== JPEG_DEFINE_HUFFMAN_TABLES &&
      marker !== JPEG_EXTENSION &&
      marker !== JPEG_DEFINE_ARITHMETIC_CODING
    ) {
      if (length < 7) return null;
      return createSwfDimensionBounds(readBigEndianUint16(source, pos + 5), readBigEndianUint16(source, pos + 3));
    }
    pos += length;
  }
  return null;
}

function createSwfDimensionBounds(width: number, height: number): SwfRectangle | null {
  return width === 0 || height === 0 ? null : { height, width, x: 0, y: 0 };
}

function readBigEndianUint16(source: Uint8Array, offset: number): number {
  return source[offset] * 0x100 + source[offset + 1];
}

function readBigEndianUint32(source: Uint8Array, offset: number): number {
  return source[offset] * 0x1000000 + source[offset + 1] * 0x10000 + source[offset + 2] * 0x100 + source[offset + 3];
}

function readSwfLosslessBitmapDefinition(body: SwfReader, state: SwfParseState, hasAlpha: boolean): boolean {
  const characterId = body.readUint16();
  const format = body.readUint8();
  const width = body.readUint16();
  const height = body.readUint16();
  if (format === LOSSLESS_BITMAP_FORMAT_COLORMAPPED) body.readUint8();
  const validFormat =
    format === LOSSLESS_BITMAP_FORMAT_COLORMAPPED ||
    format === LOSSLESS_BITMAP_FORMAT_32_BIT ||
    (!hasAlpha && format === LOSSLESS_BITMAP_FORMAT_15_BIT);
  if (
    !body.valid ||
    characterId === 0 ||
    width === 0 ||
    height === 0 ||
    state.definedCharacters.has(characterId) ||
    !validFormat
  ) {
    return false;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, { height, width, x: 0, y: 0 });
  return true;
}

function readSwfVideoDefinition(body: SwfReader, state: SwfParseState): boolean {
  const characterId = body.readUint16();
  body.readUint16();
  const width = body.readUint16();
  const height = body.readUint16();
  body.readUint8();
  body.readUint8();
  if (!body.valid || characterId === 0 || width === 0 || height === 0 || state.definedCharacters.has(characterId)) {
    return false;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, { height, width, x: 0, y: 0 });
  return true;
}

const CWS_SIGNATURE = 0x43;
const FIXED_16_ONE = 0x10000;
const FWS_SIGNATURE = 0x46;
const IDENTITY_MATRIX: SwfMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const JPEG_DEFINE_ARITHMETIC_CODING = 0xcc;
const JPEG_DEFINE_HUFFMAN_TABLES = 0xc4;
const JPEG_END_OF_IMAGE = 0xd9;
const JPEG_EXTENSION = 0xc8;
const JPEG_START_OF_IMAGE = 0xd8;
const JPEG_START_OF_SCAN = 0xda;
const JPEG_TEMPORARY = 0x01;
const LOSSLESS_BITMAP_FORMAT_15_BIT = 4;
const LOSSLESS_BITMAP_FORMAT_32_BIT = 5;
const LOSSLESS_BITMAP_FORMAT_COLORMAPPED = 3;
const MAX_INSTANTIATED_NODES = 100_000;
const MAX_SPRITE_NESTING = 256;
const MIN_SWF_LENGTH = 12;
const S_SIGNATURE = 0x53;
const SWF_MIME_TYPE = 'application/x-shockwave-flash';
const SWF_PREFIX_LENGTH = 8;
const TAG_END = 0;
const TAG_DEFINE_BITS_JPEG_2 = 21;
const TAG_DEFINE_BITS_JPEG_3 = 35;
const TAG_DEFINE_BITS_JPEG_4 = 90;
const TAG_DEFINE_BITS_LOSSLESS = 20;
const TAG_DEFINE_BITS_LOSSLESS_2 = 36;
const TAG_DEFINE_EDIT_TEXT = 37;
const TAG_DEFINE_MORPH_SHAPE = 46;
const TAG_DEFINE_MORPH_SHAPE_2 = 84;
const TAG_DEFINE_SHAPE = 2;
const TAG_DEFINE_SHAPE_2 = 22;
const TAG_DEFINE_SHAPE_3 = 32;
const TAG_DEFINE_SHAPE_4 = 83;
const TAG_DEFINE_SPRITE = 39;
const TAG_DEFINE_TEXT = 11;
const TAG_DEFINE_TEXT_2 = 33;
const TAG_DEFINE_VIDEO_STREAM = 60;
const TAG_EXPORT_ASSETS = 56;
const TAG_PLACE_OBJECT = 4;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const TAG_REMOVE_OBJECT = 5;
const TAG_REMOVE_OBJECT_2 = 28;
const TAG_SHOW_FRAME = 1;
const TAG_SYMBOL_CLASS = 76;
const TWIPS_PER_PIXEL = 20;
const W_SIGNATURE = 0x57;
const ZWS_SIGNATURE = 0x5a;
const _decoder = new TextDecoder();
