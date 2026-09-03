import type { FontLoadingBackend } from '@flighthq/types/contract';

import { getFontShorthand } from './fontShorthand';

export function isFontLoaded(backend: Readonly<FontLoadingBackend>, family: string, style?: string): boolean {
  return backend.checkFontFace(getFontShorthand(family, style));
}

export async function whenFontsReady(backend: Readonly<FontLoadingBackend>): Promise<void> {
  await backend.whenReady();
}
