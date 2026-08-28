import { getFontLoadingBackend } from './fontLoading';
import { getFontShorthand } from './fontShorthand';

export function isFontLoaded(family: string, style?: string): boolean {
  return getFontLoadingBackend().checkFontFace(getFontShorthand(family, style));
}

export async function whenFontsReady(): Promise<void> {
  await getFontLoadingBackend().whenReady();
}
