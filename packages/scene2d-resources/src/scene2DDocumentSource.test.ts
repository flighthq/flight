import { createDisplayObject } from '@flighthq/scene2d/contract';

import { createScene2DDocument } from './scene2DDocument';
import {
  createScene2DDocumentImporterRegistry,
  registerScene2DDocumentImporter,
} from './scene2DDocumentImporterRegistry';
import { loadScene2DDocumentFromUrl } from './scene2DDocumentSource';

describe('loadScene2DDocumentFromUrl', () => {
  it('acquires bytes then stops at the renderer-neutral document', async () => {
    const registry = createScene2DDocumentImporterRegistry();
    registerScene2DDocumentImporter(
      registry,
      'acme',
      (_source, context) => context.url === 'scene.acme',
      () => createScene2DDocument(createDisplayObject()),
    );
    const document = await loadScene2DDocumentFromUrl(
      'scene.acme',
      registry,
      async (_url, _signal, _progress) => new Uint8Array([1]),
    );
    expect(document?.sourceKind).toBe('acme');
  });

  it('returns null when acquisition reports an expected failure', async () => {
    await expect(
      loadScene2DDocumentFromUrl('missing.acme', createScene2DDocumentImporterRegistry(), async () => null),
    ).resolves.toBeNull();
  });
});
