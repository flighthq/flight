import { inflateDeflate } from '@flighthq/compression/contract';
import { CompressionFraming } from '@flighthq/types/contract';

export interface SwfCapabilityProbe {
  capabilities: string[];
  readable: boolean;
}

export function probeSwfCapabilities(source: Readonly<Uint8Array<ArrayBufferLike>>): SwfCapabilityProbe {
  const bytes = uncompressSwf(source);
  if (bytes === null) return { capabilities: [], readable: false };
  const reader = new ProbeReader(bytes, 8, bytes.length);
  skipRectangle(reader);
  reader.readUint16();
  reader.readUint16();
  if (!reader.valid) return { capabilities: [], readable: false };

  const capabilities = new Set<string>();
  const state = { hasDefineBits: false, hasJpegTables: false };
  probeTagStream(reader, capabilities, state);
  if (!reader.valid) return { capabilities: [], readable: false };
  if (state.hasDefineBits && state.hasJpegTables) capabilities.add('swf.bitmap.define-bits-jpeg-tables');
  return { capabilities: [...capabilities].sort(), readable: true };
}

function probeTagStream(reader: ProbeReader, capabilities: Set<string>, state: ProbeState): void {
  while (reader.pos < reader.end && reader.valid) {
    const header = reader.readUint16();
    const code = header >> 6;
    const shortLength = header & 0x3f;
    const length = shortLength === 0x3f ? reader.readUint32() : shortLength;
    const end = reader.pos + length;
    if (!reader.valid || end > reader.end) {
      reader.valid = false;
      return;
    }
    const body = new ProbeReader(reader.source, reader.pos, end);
    reader.pos = end;
    if (code === TAG_END) return;
    probeTag(code, body, capabilities, state);
    if (!body.valid) reader.valid = false;
  }
}

function probeTag(code: number, body: ProbeReader, capabilities: Set<string>, state: ProbeState): void {
  const direct = DIRECT_TAG_CAPABILITIES.get(code);
  if (direct !== undefined) capabilities.add(direct);

  if (code === TAG_DEFINE_BITS) state.hasDefineBits = true;
  else if (code === TAG_JPEG_TABLES) state.hasJpegTables = true;
  else if (code === TAG_DEFINE_BITS_LOSSLESS || code === TAG_DEFINE_BITS_LOSSLESS_2) {
    probeLossless(body, code === TAG_DEFINE_BITS_LOSSLESS_2, capabilities);
  } else if (code === TAG_DEFINE_SOUND) {
    probeDefineSound(body, capabilities);
  } else if (code === TAG_SOUND_STREAM_HEAD || code === TAG_SOUND_STREAM_HEAD_2) {
    probeSoundStreamHead(body, capabilities);
  } else if (code === TAG_START_SOUND || code === TAG_START_SOUND_2) {
    probeStartSound(body, code === TAG_START_SOUND_2, capabilities);
  } else if (code === TAG_PLACE_OBJECT) {
    probeLegacyPlaceObject(body, capabilities);
  } else if (code === TAG_PLACE_OBJECT_2 || code === TAG_PLACE_OBJECT_3 || code === TAG_PLACE_OBJECT_4) {
    probePlaceObject(body, code >= TAG_PLACE_OBJECT_3, capabilities);
  } else if (SHAPE_VERSIONS.has(code)) {
    probeShapeDefinition(body, SHAPE_VERSIONS.get(code)!, capabilities);
  } else if (MORPH_VERSIONS.has(code)) {
    probeMorphDefinition(body, MORPH_VERSIONS.get(code)!, capabilities);
  } else if (code === TAG_DEFINE_SPRITE) {
    body.readUint16();
    body.readUint16();
    probeTagStream(body, capabilities, state);
  }
}

function probeDefineSound(body: ProbeReader, capabilities: Set<string>): void {
  body.readUint16();
  const format = body.readUint8() >> 4;
  if (format !== SOUND_FORMAT_MP3) capabilities.add('swf.axis.sound-format-non-mp3');
}

function probeLegacyPlaceObject(body: ProbeReader, capabilities: Set<string>): void {
  body.readUint16();
  body.readUint16();
  skipMatrix(body);
  if (body.pos < body.end) {
    capabilities.add('swf.placement.colour-transform');
    probeColorTransform(body, 3, capabilities);
  }
}

function probeLossless(body: ProbeReader, hasAlpha: boolean, capabilities: Set<string>): void {
  body.readUint16();
  const format = body.readUint8();
  if (format === 3) capabilities.add('swf.bitmap.lossless-colormapped');
  else if (format === 4) capabilities.add('swf.bitmap.lossless-15-bit');
  else if (format === 5) capabilities.add('swf.bitmap.lossless-24-32-bit');
  if (hasAlpha) capabilities.add('swf.bitmap.lossless-with-alpha');
}

function probePlaceObject(body: ProbeReader, extended: boolean, capabilities: Set<string>): void {
  const flags = body.readUint8();
  const extendedFlags = extended ? body.readUint8() : 0;
  body.readUint16();
  const hasCharacter = (flags & 0x02) !== 0;
  const hasClassName = (extendedFlags & 0x08) !== 0 || ((extendedFlags & 0x10) !== 0 && hasCharacter);
  if (hasClassName) {
    capabilities.add('swf.placement.class-name');
    body.readString();
  }
  if (hasCharacter) body.readUint16();
  if ((flags & 0x04) !== 0) skipMatrix(body);
  if ((flags & 0x08) !== 0) {
    capabilities.add('swf.placement.colour-transform');
    probeColorTransform(body, 4, capabilities);
  }
  if ((flags & 0x10) !== 0) {
    capabilities.add('swf.placement.ratio');
    body.readUint16();
  }
  if ((flags & 0x20) !== 0) {
    capabilities.add('swf.placement.instance-name');
    body.readString();
  }
  if ((flags & 0x40) !== 0) {
    capabilities.add('swf.placement.clip-depth');
    body.readUint16();
  }
  if ((extendedFlags & 0x01) !== 0) {
    capabilities.add('swf.placement.filter-list');
    probeFilterList(body, capabilities);
  }
  if ((extendedFlags & 0x02) !== 0) {
    capabilities.add('swf.placement.blend-mode');
    const blend = body.readUint8();
    if (ADVANCED_BLEND_MODES.has(blend)) capabilities.add('swf.axis.advanced-blend-mode');
  }
  if ((extendedFlags & 0x04) !== 0) {
    capabilities.add('swf.placement.cache-as-bitmap');
    body.readUint8();
  }
  if ((extendedFlags & 0x20) !== 0) {
    capabilities.add('swf.placement.visible-flag');
    body.readUint8();
  }
  if ((extendedFlags & 0x40) !== 0) {
    capabilities.add('swf.placement.background-colour');
    body.skip(4);
  }
  if ((flags & 0x80) !== 0) capabilities.add('swf.placement.clip-actions');
}

function probeColorTransform(body: ProbeReader, channels: number, capabilities: Set<string>): void {
  const hasAdd = body.readBits(1) !== 0;
  const hasMultiply = body.readBits(1) !== 0;
  const bits = body.readBits(4);
  if (hasMultiply) {
    for (let channel = 0; channel < channels; channel++) body.readSignedBits(bits);
  }
  if (hasAdd) {
    for (let channel = 0; channel < channels; channel++) {
      const value = body.readSignedBits(bits);
      if (channels === 4 && channel === 3 && value !== 0) {
        capabilities.add('swf.axis.colour-transform-alpha-add');
      }
    }
  }
  body.align();
}

function probeFilterList(body: ProbeReader, capabilities: Set<string>): void {
  const count = body.readUint8();
  for (let index = 0; index < count && body.valid; index++) {
    const id = body.readUint8();
    if (id === 0) body.skip(23);
    else if (id === 1) body.skip(9);
    else if (id === 2) body.skip(15);
    else if (id === 3) body.skip(27);
    else if (id === 4 || id === 7) {
      const stops = body.readUint8();
      body.skip(stops * 5 + 19);
    } else if (id === 5) {
      const x = body.readUint8();
      const y = body.readUint8();
      body.skip(13 + x * y * 4);
    } else if (id === 6) {
      capabilities.add('swf.axis.filter-colour-matrix');
      body.skip(80);
    } else {
      body.valid = false;
    }
  }
}

function probeShapeDefinition(body: ProbeReader, version: number, capabilities: Set<string>): void {
  body.readUint16();
  skipRectangle(body);
  if (version >= 4) {
    skipRectangle(body);
    body.readUint8();
  }
  probeShapeStyles(body, version, version >= 3, capabilities);
  probeShapeRecords(body, version, capabilities);
}

function probeShapeRecords(body: ProbeReader, version: number, capabilities: Set<string>): void {
  let fillBits = body.readBits(4);
  let lineBits = body.readBits(4);
  while (body.valid) {
    if (body.readBits(1) !== 0) {
      const straight = body.readBits(1) !== 0;
      const bits = body.readBits(4) + 2;
      if (straight) {
        const general = body.readBits(1) !== 0;
        if (general) body.skipBits(bits * 2);
        else {
          body.readBits(1);
          body.skipBits(bits);
        }
      } else {
        body.skipBits(bits * 4);
      }
      continue;
    }
    const flags = body.readBits(5);
    if (flags === 0) {
      body.align();
      return;
    }
    if ((flags & 0x01) !== 0) {
      const bits = body.readBits(5);
      body.skipBits(bits * 2);
    }
    if ((flags & 0x02) !== 0) body.skipBits(fillBits);
    if ((flags & 0x04) !== 0) body.skipBits(fillBits);
    if ((flags & 0x08) !== 0) body.skipBits(lineBits);
    if ((flags & 0x10) !== 0) {
      probeShapeStyles(body, version, version >= 3, capabilities);
      fillBits = body.readBits(4);
      lineBits = body.readBits(4);
    }
  }
}

function probeShapeStyles(body: ProbeReader, version: number, hasAlpha: boolean, capabilities: Set<string>): void {
  const fillCount = readStyleCount(body, version);
  for (let index = 0; index < fillCount && body.valid; index++) {
    probeShapeFill(body, version, hasAlpha, capabilities);
  }
  const lineCount = readStyleCount(body, version);
  if (lineCount > 0) capabilities.add('swf.stroke.line-style');
  for (let index = 0; index < lineCount && body.valid; index++) {
    body.readUint16();
    if (version < 4) {
      body.skip(hasAlpha ? 4 : 3);
      continue;
    }
    const startCap = body.readBits(2);
    const join = body.readBits(2);
    const hasFill = body.readBits(1) !== 0;
    body.skipBits(3);
    body.skipBits(5);
    body.skipBits(1);
    const endCap = body.readBits(2);
    if (startCap !== 0 || endCap !== 0) capabilities.add('swf.stroke.non-round-cap');
    if (join !== 0) capabilities.add('swf.stroke.non-round-join');
    if (join === 2) {
      capabilities.add('swf.stroke.miter-limit');
      body.readUint16();
    }
    if (hasFill) {
      capabilities.add('swf.stroke.has-fill');
      probeShapeFill(body, version, hasAlpha, capabilities);
    } else {
      body.skip(4);
    }
  }
}

function probeShapeFill(body: ProbeReader, version: number, hasAlpha: boolean, capabilities: Set<string>): void {
  const type = body.readUint8();
  if (type === 0) {
    capabilities.add('swf.fill.solid');
    body.skip(hasAlpha ? 4 : 3);
    return;
  }
  if (type === 0x10 || type === 0x12 || type === 0x13) {
    capabilities.add(
      type === 0x10
        ? 'swf.fill.linear-gradient'
        : type === 0x12
          ? 'swf.fill.radial-gradient'
          : 'swf.fill.focal-gradient',
    );
    skipMatrix(body);
    const spread = body.readBits(2);
    const interpolation = body.readBits(2);
    const count = body.readBits(4);
    body.align();
    if (spread !== 0) capabilities.add('swf.fill.gradient-spread-mode');
    if (interpolation !== 0) capabilities.add('swf.fill.gradient-interpolation-mode');
    body.skip(count * (hasAlpha ? 5 : 4));
    if (type === 0x13 && version >= 4) body.readUint16();
    return;
  }
  const sampler = BITMAP_FILL_CAPABILITIES.get(type);
  if (sampler !== undefined) {
    capabilities.add('swf.fill.bitmap');
    capabilities.add(sampler);
    body.readUint16();
    skipMatrix(body);
    return;
  }
  body.valid = false;
}

function probeMorphDefinition(body: ProbeReader, version: number, capabilities: Set<string>): void {
  body.readUint16();
  skipRectangle(body);
  skipRectangle(body);
  if (version >= 2) {
    skipRectangle(body);
    skipRectangle(body);
    body.readUint8();
  }
  body.readUint32();
  const fillCount = readMorphStyleCount(body);
  for (let index = 0; index < fillCount && body.valid; index++) probeMorphFill(body, version, capabilities);
  const lineCount = readMorphStyleCount(body);
  if (lineCount > 0) capabilities.add('swf.stroke.line-style');
  for (let index = 0; index < lineCount && body.valid; index++) {
    body.skip(4);
    if (version < 2) {
      body.skip(8);
      continue;
    }
    const startCap = body.readBits(2);
    const join = body.readBits(2);
    const hasFill = body.readBits(1) !== 0;
    body.skipBits(3);
    body.skipBits(5);
    body.skipBits(1);
    const endCap = body.readBits(2);
    if (startCap !== 0 || endCap !== 0) capabilities.add('swf.stroke.non-round-cap');
    if (join !== 0) capabilities.add('swf.stroke.non-round-join');
    if (join === 2) {
      capabilities.add('swf.stroke.miter-limit');
      body.readUint16();
    }
    if (hasFill) {
      capabilities.add('swf.stroke.has-fill');
      probeMorphFill(body, version, capabilities);
    } else {
      body.skip(8);
    }
  }
}

function probeMorphFill(body: ProbeReader, version: number, capabilities: Set<string>): void {
  const type = body.readUint8();
  if (type === 0) {
    capabilities.add('swf.fill.solid');
    body.skip(8);
    return;
  }
  if (type === 0x10 || type === 0x12 || type === 0x13) {
    capabilities.add(
      type === 0x10
        ? 'swf.fill.linear-gradient'
        : type === 0x12
          ? 'swf.fill.radial-gradient'
          : 'swf.fill.focal-gradient',
    );
    skipMatrix(body);
    skipMatrix(body);
    const count = body.readUint8();
    body.skip(count * 10);
    if (type === 0x13 && version >= 2) body.skip(4);
    return;
  }
  const sampler = BITMAP_FILL_CAPABILITIES.get(type);
  if (sampler !== undefined) {
    capabilities.add('swf.fill.bitmap');
    capabilities.add(sampler);
    body.readUint16();
    skipMatrix(body);
    skipMatrix(body);
    return;
  }
  body.valid = false;
}

function probeSoundStreamHead(body: ProbeReader, capabilities: Set<string>): void {
  body.readUint8();
  const format = body.readUint8() >> 4;
  if (format !== SOUND_FORMAT_MP3) capabilities.add('swf.axis.sound-format-non-mp3');
}

function probeStartSound(body: ProbeReader, byClass: boolean, capabilities: Set<string>): void {
  if (byClass) body.readString();
  else body.readUint16();
  const flags = body.readUint8();
  if ((flags & 0x01) !== 0) capabilities.add('swf.audio.in-point');
  if ((flags & 0x02) !== 0) capabilities.add('swf.audio.out-point');
  if ((flags & 0x04) !== 0) capabilities.add('swf.audio.loop-count');
  if ((flags & 0x08) !== 0) capabilities.add('swf.audio.envelope');
}

function readMorphStyleCount(body: ProbeReader): number {
  const count = body.readUint8();
  return count === 0xff ? body.readUint16() : count;
}

function readStyleCount(body: ProbeReader, version: number): number {
  const count = body.readUint8();
  return count === 0xff && version >= 2 ? body.readUint16() : count;
}

function skipMatrix(body: ProbeReader): void {
  if (body.readBits(1) !== 0) {
    const bits = body.readBits(5);
    body.skipBits(bits * 2);
  }
  if (body.readBits(1) !== 0) {
    const bits = body.readBits(5);
    body.skipBits(bits * 2);
  }
  const bits = body.readBits(5);
  body.skipBits(bits * 2);
  body.align();
}

function skipRectangle(body: ProbeReader): void {
  const bits = body.readBits(5);
  body.skipBits(bits * 4);
  body.align();
}

function uncompressSwf(source: Readonly<Uint8Array<ArrayBufferLike>>): Uint8Array | null {
  if (source.length < 12 || source[1] !== 0x57 || source[2] !== 0x53) return null;
  const declaredLength = readUint32(source, 4);
  if (declaredLength < 12) return null;
  if (source[0] === 0x46) return source.length >= declaredLength ? source.subarray(0, declaredLength) : null;
  if (source[0] !== 0x43) return null;
  const body = inflateDeflate(source.subarray(8), declaredLength - 8, CompressionFraming.Rfc1950);
  if (body === null || body.length < declaredLength - 8) return null;
  const bytes = new Uint8Array(declaredLength);
  bytes.set(source.subarray(0, 8));
  bytes[0] = 0x46;
  bytes.set(body.subarray(0, declaredLength - 8), 8);
  return bytes;
}

function readUint32(source: Readonly<Uint8Array<ArrayBufferLike>>, offset: number): number {
  return (
    source[offset]! + source[offset + 1]! * 0x100 + source[offset + 2]! * 0x10000 + source[offset + 3]! * 0x1000000
  );
}

class ProbeReader {
  private bit = 0;
  pos: number;
  valid = true;

  constructor(
    readonly source: Readonly<Uint8Array<ArrayBufferLike>>,
    start: number,
    readonly end: number,
  ) {
    this.pos = start;
  }

  align(): void {
    if (this.bit === 0) return;
    this.bit = 0;
    this.pos++;
  }

  readBits(count: number): number {
    let value = 0;
    for (let index = 0; index < count; index++) {
      if (this.pos >= this.end) {
        this.valid = false;
        return 0;
      }
      value = value * 2 + ((this.source[this.pos]! >> (7 - this.bit)) & 1);
      this.bit++;
      if (this.bit === 8) {
        this.bit = 0;
        this.pos++;
      }
    }
    return value;
  }

  readSignedBits(count: number): number {
    const value = this.readBits(count);
    if (count === 0) return 0;
    const sign = 2 ** (count - 1);
    return value >= sign ? value - 2 ** count : value;
  }

  readString(): string {
    this.align();
    const start = this.pos;
    while (this.pos < this.end && this.source[this.pos] !== 0) this.pos++;
    if (this.pos >= this.end) {
      this.valid = false;
      return '';
    }
    this.pos++;
    return new TextDecoder().decode(this.source.subarray(start, this.pos - 1));
  }

  readUint8(): number {
    this.align();
    if (this.pos >= this.end) {
      this.valid = false;
      return 0;
    }
    return this.source[this.pos++]!;
  }

  readUint16(): number {
    const low = this.readUint8();
    return low + this.readUint8() * 0x100;
  }

  readUint32(): number {
    const low = this.readUint16();
    return low + this.readUint16() * 0x10000;
  }

  skip(count: number): void {
    this.align();
    this.pos += count;
    if (this.pos > this.end) this.valid = false;
  }

  skipBits(count: number): void {
    for (let index = 0; index < count; index++) this.readBits(1);
  }
}

interface ProbeState {
  hasDefineBits: boolean;
  hasJpegTables: boolean;
}

const ADVANCED_BLEND_MODES = new Set([5, 6, 7, 13, 14]);
const BITMAP_FILL_CAPABILITIES = new Map([
  [0x40, 'swf.fill.bitmap-repeat-smoothed'],
  [0x41, 'swf.fill.bitmap-clamp-smoothed'],
  [0x42, 'swf.fill.bitmap-repeat-nearest'],
  [0x43, 'swf.fill.bitmap-clamp-nearest'],
]);
const DIRECT_TAG_CAPABILITIES = new Map<number, string>([
  [2, 'swf.shape.define-shape'],
  [4, 'swf.placement.place-object'],
  [5, 'swf.placement.remove-object'],
  [9, 'swf.document.set-background-colour'],
  [10, 'swf.font.define-font'],
  [11, 'swf.text.define-text'],
  [12, 'swf.script.do-action'],
  [13, 'swf.font.define-font-info'],
  [14, 'swf.audio.define-sound'],
  [15, 'swf.audio.start-sound'],
  [18, 'swf.audio.sound-stream-head'],
  [19, 'swf.audio.sound-stream-block'],
  [21, 'swf.bitmap.define-bits-jpeg-2'],
  [22, 'swf.shape.define-shape-2'],
  [26, 'swf.placement.place-object-2'],
  [28, 'swf.placement.remove-object-2'],
  [32, 'swf.shape.define-shape-3'],
  [33, 'swf.text.define-text-2'],
  [35, 'swf.bitmap.define-bits-jpeg-3'],
  [37, 'swf.text.define-edit-text'],
  [39, 'swf.timeline.define-sprite'],
  [43, 'swf.timeline.frame-label'],
  [45, 'swf.audio.sound-stream-head'],
  [46, 'swf.morph.define-morph-shape'],
  [48, 'swf.font.define-font-2'],
  [56, 'swf.linkage.export-assets'],
  [59, 'swf.script.do-init-action'],
  [60, 'swf.video.define-video-stream'],
  [61, 'swf.video.video-frame'],
  [62, 'swf.font.define-font-info'],
  [70, 'swf.placement.place-object-3'],
  [72, 'swf.script.do-abc-anonymous'],
  [75, 'swf.font.define-font-3'],
  [76, 'swf.linkage.symbol-class'],
  [78, 'swf.scale9.define-scaling-grid'],
  [82, 'swf.script.do-abc'],
  [83, 'swf.shape.define-shape-4'],
  [84, 'swf.morph.define-morph-shape-2'],
  [86, 'swf.timeline.define-scene-and-frame-label-data'],
  [89, 'swf.audio.start-sound-2'],
  [90, 'swf.bitmap.define-bits-jpeg-4'],
  [94, 'swf.placement.place-object-4'],
]);
const MORPH_VERSIONS = new Map([
  [46, 1],
  [84, 2],
]);
const SHAPE_VERSIONS = new Map([
  [2, 1],
  [22, 2],
  [32, 3],
  [83, 4],
]);
const SOUND_FORMAT_MP3 = 2;
const TAG_DEFINE_BITS = 6;
const TAG_DEFINE_BITS_LOSSLESS = 20;
const TAG_DEFINE_BITS_LOSSLESS_2 = 36;
const TAG_DEFINE_SOUND = 14;
const TAG_DEFINE_SPRITE = 39;
const TAG_END = 0;
const TAG_JPEG_TABLES = 8;
const TAG_PLACE_OBJECT = 4;
const TAG_PLACE_OBJECT_2 = 26;
const TAG_PLACE_OBJECT_3 = 70;
const TAG_PLACE_OBJECT_4 = 94;
const TAG_SOUND_STREAM_HEAD = 18;
const TAG_SOUND_STREAM_HEAD_2 = 45;
const TAG_START_SOUND = 15;
const TAG_START_SOUND_2 = 89;
