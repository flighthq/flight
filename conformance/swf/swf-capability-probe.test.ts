import { probeSwfCapabilities } from './swf-capability-probe';

describe('probeSwfCapabilities', () => {
  it('reads direct tag capabilities and nested sprite timelines', () => {
    const sprite = join(uint16(7), uint16(1), tag(43, new Uint8Array([0])), tag(0));
    const probe = probeSwfCapabilities(createSwf([tag(9), tag(39, sprite), tag(11), tag(0)]));

    expect(probe.readable).toBe(true);
    expect(probe.capabilities).toEqual([
      'swf.document.set-background-colour',
      'swf.text.define-text',
      'swf.timeline.define-sprite',
      'swf.timeline.frame-label',
    ]);
  });

  it('distinguishes lossless formats and the legacy JPEG tables pair', () => {
    const probe = probeSwfCapabilities(
      createSwf([
        tag(8, new Uint8Array([1])),
        tag(6, uint16(1)),
        tag(20, join(uint16(2), new Uint8Array([3]))),
        tag(36, join(uint16(3), new Uint8Array([5]))),
        tag(0),
      ]),
    );
    expect(probe.capabilities).toEqual([
      'swf.bitmap.define-bits-jpeg-tables',
      'swf.bitmap.lossless-24-32-bit',
      'swf.bitmap.lossless-colormapped',
      'swf.bitmap.lossless-with-alpha',
    ]);
  });

  it('reads placement fields, advanced blending, and alpha-add as separate axes', () => {
    const flags = 0x80 | 0x40 | 0x20 | 0x10 | 0x08 | 0x02;
    const extended = 0x40 | 0x20 | 0x04 | 0x02;
    const body = join(
      new Uint8Array([flags, extended]),
      uint16(1),
      uint16(7),
      colorTransformWithAlphaAdd(),
      uint16(100),
      new TextEncoder().encode('placed\0'),
      uint16(9),
      new Uint8Array([13, 1, 1, 1, 2, 3, 4]),
    );
    const probe = probeSwfCapabilities(createSwf([tag(70, body), tag(0)]));

    expect(probe.readable).toBe(true);
    expect(probe.capabilities).toEqual([
      'swf.axis.advanced-blend-mode',
      'swf.axis.colour-transform-alpha-add',
      'swf.placement.background-colour',
      'swf.placement.blend-mode',
      'swf.placement.cache-as-bitmap',
      'swf.placement.clip-actions',
      'swf.placement.clip-depth',
      'swf.placement.colour-transform',
      'swf.placement.instance-name',
      'swf.placement.place-object-3',
      'swf.placement.ratio',
      'swf.placement.visible-flag',
    ]);
  });

  it('reads audio subfields and separates non-MP3 format evidence', () => {
    const probe = probeSwfCapabilities(
      createSwf([
        tag(14, join(uint16(1), new Uint8Array([0x1f]))),
        tag(15, join(uint16(1), new Uint8Array([0x0f]))),
        tag(18, new Uint8Array([0, 0x10])),
        tag(19),
        tag(0),
      ]),
    );
    expect(probe.capabilities).toEqual([
      'swf.audio.define-sound',
      'swf.audio.envelope',
      'swf.audio.in-point',
      'swf.audio.loop-count',
      'swf.audio.out-point',
      'swf.audio.sound-stream-block',
      'swf.audio.sound-stream-head',
      'swf.audio.start-sound',
      'swf.axis.sound-format-non-mp3',
    ]);
  });

  it('walks shape styles independently of scene construction', () => {
    const shapeBody = join(uint16(7), rectangle(), new Uint8Array([1, 0, 0x11, 0x22, 0x33, 0xff, 0, 0x10, 0]));
    const probe = probeSwfCapabilities(createSwf([tag(32, shapeBody), tag(0)]));
    expect(probe).toEqual({
      capabilities: ['swf.fill.solid', 'swf.shape.define-shape-3'],
      readable: true,
    });
  });

  it('reports unreadable for unsupported or truncated containers', () => {
    expect(probeSwfCapabilities(new Uint8Array([0x5a, 0x57, 0x53, 9])).readable).toBe(false);
    const truncated = createSwf([tag(9), tag(0)]).subarray(0, 9);
    expect(probeSwfCapabilities(truncated).readable).toBe(false);
  });

  it('discards capability ids accumulated before a later malformed tag body', () => {
    const malformedShape = tag(32, new Uint8Array([1]));
    expect(probeSwfCapabilities(createSwf([tag(9), malformedShape, tag(0)]))).toEqual({
      capabilities: [],
      readable: false,
    });
  });
});

function colorTransformWithAlphaAdd(): Uint8Array {
  const writer = new BitWriter();
  writer.write(1, 1);
  writer.write(0, 1);
  writer.write(2, 4);
  writer.write(0, 2);
  writer.write(0, 2);
  writer.write(0, 2);
  writer.write(1, 2);
  return writer.bytes();
}

function createSwf(tags: readonly Uint8Array<ArrayBufferLike>[]): Uint8Array {
  const body = join(rectangle(), uint16(24 * 256), uint16(1), ...tags);
  return join(new Uint8Array([0x46, 0x57, 0x53, 9]), uint32(body.length + 8), body);
}

function join(...parts: readonly Uint8Array<ArrayBufferLike>[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function rectangle(): Uint8Array {
  const writer = new BitWriter();
  writer.write(1, 5);
  writer.write(0, 1);
  writer.write(0, 1);
  writer.write(0, 1);
  writer.write(0, 1);
  return writer.bytes();
}

function tag(code: number, body: Uint8Array<ArrayBufferLike> = new Uint8Array()): Uint8Array {
  const shortLength = body.length < 0x3f ? body.length : 0x3f;
  return shortLength === 0x3f
    ? join(uint16((code << 6) | 0x3f), uint32(body.length), body)
    : join(uint16((code << 6) | shortLength), body);
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff]);
}

class BitWriter {
  private readonly values: number[] = [];

  bytes(): Uint8Array {
    const bytes = new Uint8Array(Math.ceil(this.values.length / 8));
    for (let index = 0; index < this.values.length; index++) {
      bytes[Math.floor(index / 8)]! |= this.values[index]! << (7 - (index % 8));
    }
    return bytes;
  }

  write(value: number, count: number): void {
    for (let bit = count - 1; bit >= 0; bit--) this.values.push(Math.floor(value / 2 ** bit) & 1);
  }
}
