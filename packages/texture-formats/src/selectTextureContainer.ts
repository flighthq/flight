import type { TextureContainer } from '@flighthq/types';
import type { TextureContainerFormat } from '@flighthq/types';

// Picks the first container whose `format` a GPU supports from a set of peer `TextureContainer`s,
// returning `null` when none match. This is the consumer side of `parseAtf`'s peer array: an ATF holds
// the same texture in several GPU encodings (DXT + PVRTC + ETC, ...), and the runtime uploads whichever
// one its GPU can consume. `supportedFormats` is the caller's list of GPU-supported
// `TextureContainerFormat`s, in preference order within `containers` (the first supported container
// wins, so order `containers` by upload preference). Format-agnostic — it works on any
// `TextureContainer[]`, not only ATF's, so a caller can filter a KTX2/Basis format set the same way.
export function selectTextureContainer(
  containers: readonly TextureContainer[],
  supportedFormats: readonly TextureContainerFormat[],
): TextureContainer | null {
  for (const container of containers) {
    if (supportedFormats.includes(container.format)) return container;
  }
  return null;
}
