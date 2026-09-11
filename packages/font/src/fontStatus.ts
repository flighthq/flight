import type { HostFontLoadingProvider } from '@flighthq/types/contract';

import { getFontShorthand } from './fontShorthand';

export function isFontLoaded(backend: Readonly<HostFontLoadingProvider>, family: string, style?: string): boolean {
  return backend.checkFontFace(getFontShorthand(family, style));
}

export async function whenFontsReady(backend: Readonly<HostFontLoadingProvider>): Promise<void> {
  await backend.whenReady();
}
