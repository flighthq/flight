import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { ExtendedPbrMaterialKind } from '@flighthq/types/contract';

import { createClearcoatPbrExtension } from './clearcoatPbrExtension';
import { createExtendedPbrMaterial } from './extendedPbrMaterial';
import { createStandardPbrMaterialProperties } from './pbrMaterials';

describe('createExtendedPbrMaterial', () => {
  it('composes a standard property block with an ordered extension list', () => {
    const standard = createStandardPbrMaterialProperties({ roughness: 0.25 });
    const extensions = [
      createClearcoatPbrExtension(),
      (() => {
        const out = allocateEntity<unknown>();
        out.kind = 'VendorPbrExtension';
        return finishEntity(out);
      })(),
    ];

    const material = createExtendedPbrMaterial({ extensions, standard });

    expect(material.kind).toBe(ExtendedPbrMaterialKind);
    expect(material.standard).toBe(standard);
    expect(material.extensions).toBe(extensions);
    expect(material.extensions.map((extension) => extension.kind)).toEqual([
      'ClearcoatPbrExtension',
      'VendorPbrExtension',
    ]);
  });

  it('defaults to a lean standard block and an empty per-material list', () => {
    const a = createExtendedPbrMaterial();
    const b = createExtendedPbrMaterial();

    expect(a.standard.roughness).toBe(1);
    expect(a.extensions).toEqual([]);
    expect(a.extensions).not.toBe(b.extensions);
  });
});
