import { createEmbeddedImageResourceReference } from '@flighthq/image/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  EmbeddedImageResourceReference,
  ImageResourceReference,
  SwfJpegAlphaPayload,
  SwfTagHandler,
  SwfTagParseResult,
  SwfTagParseState,
  SwfTagReader,
  SwfTagRectangle,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE } from './swfImageMimeType.ts';
import { acquireSwfImageTexture } from './swfImageTexture.ts';
import { createSwfTexturedSprite } from './swfNode.ts';
import { resolveSwfDimensionBounds, readBigEndianUint16, readBigEndianUint32 } from './swfPrimitive.ts';

const TAG_DEFINE_BITS = 6;

const TAG_DEFINE_BITS_JPEG_2 = 21;

const TAG_DEFINE_BITS_JPEG_3 = 35;

const TAG_DEFINE_BITS_JPEG_4 = 90;

const TAG_JPEG_TABLES = 8;

export const swfJpegBitmapHandler: SwfTagHandler = {
  instantiate: {
    createPlacementNode(parsed, characterId, bounds) {
      if (!parsed.images.has(characterId)) return null;
      return createSwfTexturedSprite(acquireSwfImageTexture(parsed, characterId, false, true), bounds);
    },
    createResources(parsed, out) {
      const images = createSwfImageResources(parsed);
      out.images.push(...images.resources);
      out.jpegAlphaPayloads.push(...createSwfJpegAlphaPayloads(parsed, images.references));
    },
    hasPlacementContent(parsed, characterId) {
      return parsed.images.has(characterId);
    },
  },
  tags: [TAG_DEFINE_BITS, TAG_DEFINE_BITS_JPEG_2, TAG_DEFINE_BITS_JPEG_3, TAG_DEFINE_BITS_JPEG_4, TAG_JPEG_TABLES],
  parse(body, tag, state) {
    if (tag === TAG_JPEG_TABLES) {
      state.jpegTables = body.source.subarray(body.pos, body.end);
      return true;
    }
    if (tag === TAG_DEFINE_BITS) readSwfLegacyImageDefinition(body, state);
    else readSwfEmbeddedImageDefinition(body, state, tag);
    return true;
  },
};

function readSwfLegacyImageDefinition(body: SwfTagReader, state: SwfTagParseState): void {
  const characterId = body.readUint16();
  if (!body.valid || characterId === 0 || state.definedCharacters.has(characterId)) return;
  const tables = state.jpegTables;
  if (tables === null) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.jpeg-tables-missing',
      'readSwfLegacyImageDefinition',
      {
        capability: 'swf.bitmap.define-bits-jpeg-tables',
        characterId,
      },
    );
    return;
  }

  const tablesEnd =
    tables.length >= 2 && tables[tables.length - 2] === 0xff && tables[tables.length - 1] === JPEG_END_OF_IMAGE
      ? tables.length - 2
      : tables.length;
  const imageStart =
    body.source[body.pos] === 0xff && body.source[body.pos + 1] === JPEG_START_OF_IMAGE ? body.pos + 2 : body.pos;
  const spliced = new Uint8Array(tablesEnd + (body.end - imageStart));
  spliced.set(tables.subarray(0, tablesEnd));
  spliced.set(body.source.subarray(imageStart, body.end), tablesEnd);

  const image = readSwfEmbeddedImage(spliced, 0, spliced.length);
  if (image === null) {
    reportImportDiagnostic(
      state.diagnostics,
      ImportDiagnosticSeverity.Drop,
      'swf.jpeg-tables-unsplittable',
      'readSwfLegacyImageDefinition',
      {
        capability: 'swf.bitmap.define-bits-jpeg-tables',
        characterId,
      },
    );
    return;
  }
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, image.bounds);
  state.images.set(characterId, { bytes: spliced, mimeType: image.mimeType });
}

function readSwfEmbeddedImageDefinition(body: SwfTagReader, state: SwfTagParseState, code: number): void {
  const characterId = body.readUint16();
  let deblockingParameterRaw: number | null = null;
  let imageStart = body.pos;
  let imageEnd = body.end;
  let hasAlphaPayload = false;
  if (code === TAG_DEFINE_BITS_JPEG_3 || code === TAG_DEFINE_BITS_JPEG_4) {
    hasAlphaPayload = true;
    const alphaDataOffset = body.readUint32();
    const alphaOffsetBase = body.pos;
    if (code === TAG_DEFINE_BITS_JPEG_4) deblockingParameterRaw = body.readUint16();
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
    return;
  }
  const image = readSwfEmbeddedImage(body.source, imageStart, imageEnd);
  if (image === null) return;
  state.definedCharacters.add(characterId);
  state.characterBounds.set(characterId, image.bounds);
  state.images.set(characterId, {
    bytes: stripSwfJpegStreamBoundary(body.source, imageStart, imageEnd, image.mimeType),
    mimeType: image.mimeType,
  });
  if (hasAlphaPayload) {
    const compressedAlphaBytes = body.source.subarray(imageEnd, body.end);
    state.jpegAlphaPayloads.set(characterId, {
      characterId,
      compressedAlphaBytes,
      deblockingParameterRaw,
      height: image.bounds.height,
      width: image.bounds.width,
    });
    if (compressedAlphaBytes.length > 0) {
      reportImportDiagnostic(
        state.diagnostics,
        ImportDiagnosticSeverity.Skip,
        'swf.jpeg-alpha-stream',
        'readSwfEmbeddedImageDefinition',
        {
          capability:
            code === TAG_DEFINE_BITS_JPEG_3 ? 'swf.bitmap.define-bits-jpeg-3' : 'swf.bitmap.define-bits-jpeg-4',
          characterId,
          discardedBytes: compressedAlphaBytes.length,
        },
      );
    }
  }
  return;
}

function readSwfEmbeddedImage(
  source: Uint8Array,
  start: number,
  end: number,
): { bounds: SwfTagRectangle; mimeType: string } | null {
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
    const bounds = resolveSwfDimensionBounds(
      readBigEndianUint32(source, start + 16),
      readBigEndianUint32(source, start + 20),
    );
    return bounds === null ? null : { bounds, mimeType: PNG_MIME_TYPE };
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
    const bounds = resolveSwfDimensionBounds(
      source[start + 6] + source[start + 7] * 0x100,
      source[start + 8] + source[start + 9] * 0x100,
    );
    return bounds === null ? null : { bounds, mimeType: GIF_MIME_TYPE };
  }

  if (end - start < 4 || source[start] !== 0xff || source[start + 1] !== JPEG_START_OF_IMAGE) return null;
  let pos = start + 2;
  while (pos < end) {
    if (source[pos++] !== 0xff) return null;
    while (pos < end && source[pos] === 0xff) pos++;
    if (pos >= end) return null;
    const marker = source[pos++];
    if (marker === JPEG_START_OF_SCAN) return null;
    if (marker === JPEG_END_OF_IMAGE) {
      if (pos + 1 < end && source[pos] === 0xff && source[pos + 1] === JPEG_START_OF_IMAGE) continue;
      return null;
    }
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
      const bounds = resolveSwfDimensionBounds(
        readBigEndianUint16(source, pos + 5),
        readBigEndianUint16(source, pos + 3),
      );
      return bounds === null ? null : { bounds, mimeType: JPEG_MIME_TYPE };
    }
    pos += length;
  }
  return null;
}

function stripSwfJpegStreamBoundary(source: Uint8Array, start: number, end: number, mimeType: string): Uint8Array {
  if (mimeType !== JPEG_MIME_TYPE) return source.subarray(start, end);
  for (let pos = start; pos + 3 < end; pos++) {
    if (
      source[pos] === 0xff &&
      source[pos + 1] === JPEG_END_OF_IMAGE &&
      source[pos + 2] === 0xff &&
      source[pos + 3] === JPEG_START_OF_IMAGE
    ) {
      const spliced = new Uint8Array(end - start - 4);
      spliced.set(source.subarray(start, pos));
      spliced.set(source.subarray(pos + 4, end), pos - start);
      return spliced;
    }
  }
  return source.subarray(start, end);
}

function createSwfImageResources(parsed: Readonly<SwfTagParseResult>): SwfImageResourceSet {
  const references = new Map<number, EmbeddedImageResourceReference>();
  const resources: ImageResourceReference[] = [];
  for (const [characterId, variants] of parsed.imageTextures) {
    const image = parsed.images.get(characterId);
    if (image === undefined) continue;
    const alphaType =
      image.mimeType === SWF_LOSSLESS_ALPHA_MIME_TYPE
        ? 'premultiplied'
        : image.mimeType === SWF_LOSSLESS_MIME_TYPE
          ? 'opaque'
          : 'straight';
    const reference = createEmbeddedImageResourceReference(image.bytes, image.mimeType, alphaType);
    reference.textures = [...variants.values()];
    references.set(characterId, reference);
    resources.push(reference);
  }
  return { references, resources };
}

function createSwfJpegAlphaPayloads(
  parsed: Readonly<SwfTagParseResult>,
  references: Map<number, EmbeddedImageResourceReference>,
): SwfJpegAlphaPayload[] {
  const payloads: SwfJpegAlphaPayload[] = [];
  for (const [characterId, source] of parsed.jpegAlphaPayloads) {
    let reference = references.get(characterId);
    if (reference === undefined) {
      const image = parsed.images.get(characterId);
      if (image === undefined) continue;
      reference = createEmbeddedImageResourceReference(image.bytes, image.mimeType);
      references.set(characterId, reference);
    }
    payloads.push({ ...source, reference });
  }
  return payloads;
}

interface SwfImageResourceSet {
  references: Map<number, EmbeddedImageResourceReference>;
  resources: ImageResourceReference[];
}

const GIF_MIME_TYPE = 'image/gif';

const JPEG_DEFINE_ARITHMETIC_CODING = 0xcc;

const JPEG_DEFINE_HUFFMAN_TABLES = 0xc4;

const JPEG_END_OF_IMAGE = 0xd9;

const JPEG_MIME_TYPE = 'image/jpeg';

const JPEG_EXTENSION = 0xc8;

const JPEG_START_OF_IMAGE = 0xd8;

const JPEG_START_OF_SCAN = 0xda;

const JPEG_TEMPORARY = 0x01;

const PNG_MIME_TYPE = 'image/png';
