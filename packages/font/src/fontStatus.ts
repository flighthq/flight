import type { HostFontLoadingCapability } from '@flighthq/types/contract';

import { getFontShorthand } from './fontShorthand';

export function isFontLoaded(backend: Readonly<HostFontLoadingCapability>, family: string, style?: string): boolean {
  return backend.checkFontFace(getFontShorthand(family, style));
}

export async function whenFontsReady(backend: Readonly<HostFontLoadingCapability>): Promise<void> {
  await backend.whenReady();
}
