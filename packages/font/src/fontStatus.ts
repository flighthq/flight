import { getFontShorthand } from './fontShorthand';

export function isFontLoaded(family: string, style?: string): boolean {
  return document.fonts.check(getFontShorthand(family, style));
}

export async function whenFontsReady(): Promise<void> {
  await document.fonts.ready;
}
