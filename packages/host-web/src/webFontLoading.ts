import type { HostFontLoadingCapability } from '@flighthq/types/contract';

export const webHostFontLoading: HostFontLoadingCapability = {
  addFontFace: (face: FontFace): void => {
    document.fonts.add(face);
  },
  checkFontFace: (shorthand: string): boolean => {
    return document.fonts.check(shorthand);
  },
  loadFontFaces: (shorthand: string): Promise<FontFace[]> => {
    return document.fonts.load(shorthand);
  },
  whenReady: async (): Promise<void> => {
    await document.fonts.ready;
  },
};
