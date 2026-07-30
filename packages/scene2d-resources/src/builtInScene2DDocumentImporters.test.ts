import { getNodeChildCount } from '@flighthq/node/contract';

import {
  registerLottieScene2DDocumentImporter,
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
