import { createEmbeddedImageResourceReference } from '@flighthq/image';
import { createDisplayObject } from '@flighthq/scene2d';
import { createScene2DDocument, loadScene2DImageResources } from '@flighthq/scene2d-resources';

// Measure the ordinary non-SWF document path that resolves embedded PNG bytes. A signature-only payload
// retains the real branch while keeping the fixture contribution to the measured bundle bounded.
const reference = createEmbeddedImageResourceReference(
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/png',
);
const document = createScene2DDocument(createDisplayObject(), [], 'size', null, [reference]);

Reflect.set(globalThis, '__flightScene2DImageResources', loadScene2DImageResources(document));
