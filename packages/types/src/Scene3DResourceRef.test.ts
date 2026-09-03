import { EntityRuntimeKey } from './Entity';
import type {
  EmbeddedImageResourceReference,
  ExternalImageResourceReference,
  ImageResourceReference,
} from './ImageResourceReference';
import { ImageResourceReferenceKind } from './ImageResourceReference';
import { ResourceResolutionState } from './ResourceResolutionState';

describe('ImageResourceReference', () => {
  describe('ImageResourceReferenceKind', () => {
    it('names the two members as canonical PascalCase values', () => {
      expect(ImageResourceReferenceKind.Embedded).toBe('Embedded');
      expect(ImageResourceReferenceKind.External).toBe('External');
    });
  });

  describe('descriptor shape', () => {
    it('models an embedded ref carrying encoded bytes and a starting Unresolved state', () => {
      const ref: EmbeddedImageResourceReference = {
        [EntityRuntimeKey]: undefined,
        alphaType: 'straight',
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        failure: null,
        kind: 'Embedded',
        mimeType: 'image/png',
        state: ResourceResolutionState.Unresolved,
        textures: [],
      };
      const base: ImageResourceReference = ref;
      expect(base.kind).toBe('Embedded');
      expect(ref.bytes.length).toBe(4);
    });

    it('models an external ref carrying a uri and optional basePath', () => {
      const ref: ExternalImageResourceReference = {
        [EntityRuntimeKey]: undefined,
        basePath: '/models/',
        failure: null,
        kind: 'External',
        mimeType: null,
        state: ResourceResolutionState.Unresolved,
        textures: [],
        uri: 'textures/hull.png',
      };
      const base: ImageResourceReference = ref;
      expect(base.kind).toBe('External');
      expect(ref.uri).toBe('textures/hull.png');
    });

    it('narrows on the kind discriminant', () => {
      const ref: ImageResourceReference = {
        [EntityRuntimeKey]: undefined,
        basePath: null,
        failure: null,
        kind: 'External',
        mimeType: null,
        state: ResourceResolutionState.Loading,
        textures: [],
        uri: 'a.png',
      };
      if (ref.kind === 'External') {
        expect(ref.uri).toBe('a.png');
      }
    });
  });
});
