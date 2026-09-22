import { createEmbeddedImageResourceReference } from '@flighthq/image/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  EmbeddedImageResourceReference,
  ImageResourceReference,
  SwfJpegAlphaPayload,
  SwfTagFamily,
  SwfTagParseResult,
  SwfTagParseState,
  SwfTagReader,
  SwfTagRectangle,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { SWF_LOSSLESS_ALPHA_MIME_TYPE, SWF_LOSSLESS_MIME_TYPE } from './swfImageDecoder';
import { acquireSwfImageTexture } from './swfImageTexture';
import { createSwfTexturedSprite } from './swfNode';
import { createSwfDimensionBounds, readBigEndianUint16, readBigEndianUint32 } from './swfPrimitive';

// Embedded bitmap definitions. Nothing is decoded at import: a payload rides out on an asset reference
// for the resolve step, which may be asynchronous and which a caller that does not need pixels never
// runs. Registering this family is what pulls image resource construction and the image-codec chain in.

// The tag codes this family claims. Declared above the family value rather than at the foot of
// the file because the value reads them when the module initializes.
const TAG_DEFINE_BITS = 6;
const TAG_DEFINE_BITS_JPEG_2 = 21;
const TAG_DEFINE_BITS_JPEG_3 = 35;
const TAG_DEFINE_BITS_JPEG_4 = 90;
const TAG_DEFINE_BITS_LOSSLESS = 20;
const TAG_DEFINE_BITS_LOSSLESS_2 = 36;
const TAG_JPEG_TABLES = 8;

export const swfBitmapTagFamily: SwfTagFamily = {
  instantiate: {
    createPlacementNode(parsed, characterId, bounds) {
      // A placed bitmap becomes a Sprite over the character's shared waiting Texture, so the node exists
      // at its authored size before any pixels do and every placement of one character decodes once.
      if (!parsed.images.has(characterId)) return null;
      return createSwfTexturedSprite(acquireSwfImageTexture(parsed, characterId, false, true), bounds);
    },
    createResources(parsed, out) {
      const images = createSwfImageResources(parsed);
      out.images.push(...images.resources);
      // The sidecar completes only after the document references exist, so a placed character and its
      // report share the exact same reference object.
      out.jpegAlphaPayloads.push(...createSwfJpegAlphaPayloads(parsed, images.references));
    },
    hasPlacementContent(parsed, characterId) {
      return parsed.images.has(characterId);
    },
  },
  tags: [
    TAG_DEFINE_BITS,
    TAG_DEFINE_BITS_JPEG_2,
    TAG_DEFINE_BITS_JPEG_3,
    TAG_DEFINE_BITS_JPEG_4,
    TAG_DEFINE_BITS_LOSSLESS,
    TAG_DEFINE_BITS_LOSSLESS_2,
    TAG_JPEG_TABLES,
  ],
  parse(body, tag, state) {
    if (tag === TAG_JPEG_TABLES) {
      state.jpegTables = body.source.subarray(body.pos, body.end);
      return true;
    }
    if (tag === TAG_DEFINE_BITS) readSwfLegacyImageDefinition(body, state);
    else if (tag === TAG_DEFINE_BITS_LOSSLESS || tag === TAG_DEFINE_BITS_LOSSLESS_2) {
      return readSwfLosslessBitmapDefinition(body, state, tag === TAG_DEFINE_BITS_LOSSLESS_2);
    } else {
      readSwfEmbeddedImageDefinition(body, state, tag);
    }
    return true;
  },
};

// The legacy split-JPEG form: DefineBits carries an image whose encoding tables were factored out into a
// single JPEGTables tag shared by every such image in the file. Neither half is a valid JPEG alone, so
// they are spliced — the tables lose their end-of-image marker and the image its start-of-image marker —
// and the result travels as an ordinary encoded payload for the resolve step, exactly like a self-contained
// one. A pair that will not splice into something readable contributes no image and leaves the rest of the
// document alone: real files carry these halves inside sprites and in either order, so failing the whole
// import over one of them would cost far more than the image is worth.
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

// An image this decoder cannot read contributes no image and leaves the document alone, the same way an
// unreadable shape body, font glyph, or legacy image pair does. Failing a whole document over one picture
// costs far more than the picture is worth.
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
    // The full report retains this stream, but the document's colour reference still resolves without
    // applying it. Keep the existing fidelity diagnostic until the separately-gated composition stage.
    if (compressedAlphaBytes.length > 0) {
      reportImportDiagnostic(
        state.diagnostics,
        // Skip: the alpha stream is recognized and deliberately not applied until the composition stage
        // exists. A capability gap on a well-formed file, with no substitute written.
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
    const bounds = createSwfDimensionBounds(
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
    const bounds = createSwfDimensionBounds(
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
    // Encoders of the era wrote the encoding tables and the image as two concatenated streams, so an
    // end-of-image commonly sits before the frame header with a second start-of-image after it. Treating
    // that first marker as the end of the file would abandon the scan before it ever reached the
    // dimensions.
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
      const bounds = createSwfDimensionBounds(
        readBigEndianUint16(source, pos + 5),
        readBigEndianUint16(source, pos + 3),
      );
      return bounds === null ? null : { bounds, mimeType: JPEG_MIME_TYPE };
    }
    pos += length;
  }
  return null;
}

// Identifies an embedded payload by its magic bytes and reads the dimensions out of its header, without
// decoding a pixel. The media type travels with the bytes so a resolver can dispatch on format.
// Removes the end-of-image / start-of-image pair the legacy two-stream layout leaves in the middle of a
// JPEG. The bytes on either side are one valid stream once it is gone, and a strict decoder is entitled to
// stop at that marker, so a resolver should never have to know the file's history to read the image.
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

function readSwfLosslessBitmapDefinition(body: SwfTagReader, state: SwfTagParseState, hasAlpha: boolean): boolean {
  const characterId = body.readUint16();
  // Everything after the character id is the payload a decoder needs: format, dimensions, an optional
  // colormap size, and the zlib-compressed pixels. It stays compressed here.
  const payloadStart = body.pos;
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
  state.images.set(characterId, {
    bytes: body.source.subarray(payloadStart, body.end),
    mimeType: hasAlpha ? SWF_LOSSLESS_ALPHA_MIME_TYPE : SWF_LOSSLESS_MIME_TYPE,
  });
  return true;
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

// Completes the full-import sidecar after document references exist. An unplaced definition still earns
// a report record and its own zero-texture reference; a placed one reuses the document's exact object.
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

const LOSSLESS_BITMAP_FORMAT_15_BIT = 4;

const LOSSLESS_BITMAP_FORMAT_32_BIT = 5;

const LOSSLESS_BITMAP_FORMAT_COLORMAPPED = 3;

const PNG_MIME_TYPE = 'image/png';
