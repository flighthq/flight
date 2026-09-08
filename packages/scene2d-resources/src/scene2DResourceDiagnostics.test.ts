import { createExternalAudioResourceReference } from '@flighthq/audio/contract';
import { createExternalImageResourceReference } from '@flighthq/image/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { Scene2DResourceFailureNotice } from '@flighthq/types/contract';
import { ResourceResolutionState } from '@flighthq/types/contract';

import { loadScene2DAudioResources } from './loadScene2DAudioResources';
import { loadScene2DImageResources } from './loadScene2DImageResources';
import { resolveScene2DResources } from './resolveScene2DResources';
import { createScene2DDocument, createScene2DSlotReference } from './scene2DDocument';
import {
  createScene2DDocumentFromBytes,
  createScene2DDocumentImporterRegistry,
  registerScene2DDocumentImporter,
} from './scene2DDocumentImporterRegistry';
import { loadScene2DDocumentFromUrl } from './scene2DDocumentSource';
import {
  explainScene2DResourceCoverage,
  reportScene2DResourceFailure,
  setScene2DResourceFailureGuard,
} from './scene2DResourceDiagnostics';
import { setScene2DSlotReferenceContent } from './scene2DSlotReference';

function notice(reason: Scene2DResourceFailureNotice['reason']): Scene2DResourceFailureNotice {
  return { operation: 'resolveScene2DResources', reason, total: 2, unresolved: 1, url: null };
}

afterEach(() => {
  setScene2DResourceFailureGuard(null);
});

describe('explainScene2DResourceCoverage', () => {
  it('counts every asset reference and only required slots', () => {
    const resolvedImage = createExternalImageResourceReference('resolved.png');
    const failedImage = createExternalImageResourceReference('failed.png');
    resolvedImage.state = ResourceResolutionState.Resolved;
    failedImage.state = ResourceResolutionState.Failed;
    const audio = createExternalAudioResourceReference('sound.mp3');
    audio.state = ResourceResolutionState.Loading;
    const filled = createScene2DSlotReference('filled', createDisplayObject());
    setScene2DSlotReferenceContent(filled, createDisplayObject());
    const missing = createScene2DSlotReference('missing', createDisplayObject());
    const optional = createScene2DSlotReference('optional', createDisplayObject(), null, false);
    const document = createScene2DDocument(
      createDisplayObject(),
      [filled, missing, optional],
      null,
      null,
      [resolvedImage, failedImage],
      [audio],
    );

    expect(explainScene2DResourceCoverage(document)).toEqual({
      audioResources: { resolved: 0, total: 1 },
      complete: false,
      imageResources: { resolved: 1, total: 2 },
      requiredSlots: { resolved: 1, total: 2 },
    });
  });

  it('reports an empty document as complete', () => {
    expect(explainScene2DResourceCoverage(createScene2DDocument(createDisplayObject()))).toEqual({
      audioResources: { resolved: 0, total: 0 },
      complete: true,
      imageResources: { resolved: 0, total: 0 },
      requiredSlots: { resolved: 0, total: 0 },
    });
  });
});

describe('reportScene2DResourceFailure', () => {
  it('routes the notice only through an installed hook', () => {
    const guard = vi.fn();
    reportScene2DResourceFailure(notice('required-slots-unresolved'));
    setScene2DResourceFailureGuard(guard);
    const value = notice('image-resources-unresolved');
    reportScene2DResourceFailure(value);
    expect(guard).toHaveBeenCalledOnce();
    expect(guard).toHaveBeenCalledWith(value);
  });
});

describe('setScene2DResourceFailureGuard', () => {
  it('observes each sentinel at the operation that produced it', async () => {
    const guard = vi.fn();
    setScene2DResourceFailureGuard(guard);

    const slot = createScene2DSlotReference('missing', createDisplayObject());
    resolveScene2DResources(createScene2DDocument(createDisplayObject(), [slot]));

    const image = createExternalImageResourceReference('missing.png');
    await loadScene2DImageResources(createScene2DDocument(createDisplayObject(), [], null, null, [image]));

    const audio = createExternalAudioResourceReference('missing.mp3');
    await loadScene2DAudioResources(createScene2DDocument(createDisplayObject(), [], null, null, [], [audio]));

    const registry = createScene2DDocumentImporterRegistry();
    await loadScene2DDocumentFromUrl('missing.scene', registry, async () => null);
    createScene2DDocumentFromBytes(new Uint8Array([1]), registry);
    registerScene2DDocumentImporter(
      registry,
      'broken',
      () => true,
      () => null,
    );
    createScene2DDocumentFromBytes(new Uint8Array([1]), registry);

    expect(guard.mock.calls.map(([value]) => value.reason)).toEqual([
      'required-slots-unresolved',
      'image-resources-unresolved',
      'audio-resources-unresolved',
      'document-fetch-failed',
      'document-importer-missing',
      'document-import-failed',
    ]);
  });
});
