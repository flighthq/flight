import { getNodeChildCount } from '@flighthq/node/contract';

import {
  registerLottieScene2DDocumentImporter,
  registerRiveScene2DDocumentImporter,
  registerSvgScene2DDocumentImporter,
} from './builtInScene2DDocumentImporters';
import {
  createScene2DDocumentFromBytes,
  createScene2DDocumentImporterRegistry,
} from './scene2DDocumentImporterRegistry';

const encode = (source: string) => new TextEncoder().encode(source);

describe('registerLottieScene2DDocumentImporter', () => {
  it('adds an opt-in Bodymovin codec without global registration', () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerLottieScene2DDocumentImporter(registry);
    const document = createScene2DDocumentFromBytes(
      encode('{"v":"5.7.0","fr":30,"ip":0,"op":30,"w":100,"h":100,"layers":[]}'),
      registry,
    );
    expect(document?.sourceKind).toBe('lottie');
  });

  it('preserves the null sentinel when the format importer rejects a document', () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerLottieScene2DDocumentImporter(registry);
    expect(
      createScene2DDocumentFromBytes(encode('{invalid'), registry, {
        mimeType: 'application/lottie+json',
        url: null,
      }),
    ).toBeNull();
  });
});

describe('registerRiveScene2DDocumentImporter', () => {
  it('adds an opt-in Rive codec that produces a document root', () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerRiveScene2DDocumentImporter(registry);
    const document = createScene2DDocumentFromBytes(riveBytes(), registry);

    expect(document?.sourceKind).toBe('rive');
    expect(getNodeChildCount(document!.root)).toBe(1);
  });

  // A .riv embeds its images, so the document hands them over as unresolved references rather than
  // decoding anything — resolveScene2DResources is what turns them into pixels.
  it('carries an embedded image out as an unresolved resource reference', () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerRiveScene2DDocumentImporter(registry);
    const document = createScene2DDocumentFromBytes(riveBytes(true), registry);

    expect(document!.imageResources).toHaveLength(1);
    expect(document!.imageResources[0].mimeType).toBe('image/png');
  });

  it('preserves the null sentinel for bytes that are not a Rive file', () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerRiveScene2DDocumentImporter(registry);

    expect(createScene2DDocumentFromBytes(encode('not a riv'), registry)).toBeNull();
  });
});

describe('registerSvgScene2DDocumentImporter', () => {
  it('adds an opt-in SVG codec that produces a document root', () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerSvgScene2DDocumentImporter(registry);
    const document = createScene2DDocumentFromBytes(
      encode('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="20"/></svg>'),
      registry,
    );
    expect(document?.sourceKind).toBe('svg');
    expect(getNodeChildCount(document!.root)).toBe(1);
  });

  it('preserves the null sentinel when the format importer rejects a document', () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerSvgScene2DDocumentImporter(registry);
    expect(
      createScene2DDocumentFromBytes(encode('<not-svg/>'), registry, {
        mimeType: 'image/svg+xml',
        url: null,
      }),
    ).toBeNull();
  });
});

// A minimal well-formed .riv: the fingerprint, version 7, an empty table of contents, one named
// artboard, and optionally an embedded PNG asset.
function riveBytes(withImage = false): Uint8Array {
  const varUint = (value: number): number[] => {
    const out: number[] = [];
    let remaining = value;
    do {
      const group = remaining % 128;
      remaining = Math.floor(remaining / 128);
      out.push(remaining > 0 ? group + 128 : group);
    } while (remaining > 0);
    return out;
  };
  const text = (key: number, value: string): number[] => {
    const encoded = Array.from(new TextEncoder().encode(value));
    return [...varUint(key), ...varUint(encoded.length), ...encoded];
  };
  const out: number[] = [0x52, 0x49, 0x56, 0x45, ...varUint(7), ...varUint(0), ...varUint(0), 0];
  if (withImage) {
    out.push(...varUint(105), ...text(203, 'sky'), 0);
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    out.push(...varUint(106), ...varUint(212), ...varUint(png.length), ...png, 0);
  }
  out.push(...varUint(1), ...text(4, 'Board'), 0);
  return new Uint8Array(out);
}
