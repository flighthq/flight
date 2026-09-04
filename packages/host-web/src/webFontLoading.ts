import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, FontLoadingBackend } from '@flighthq/types/contract';

export function createWebFontLoadingBackend(): FontLoadingBackend & Entity {
    const out = allocateEntity<FontLoadingBackend>();
  out.addFontFace = (face: FontFace): void => {
      document.fonts.add(face);
    };
  out.checkFontFace = (shorthand: string): boolean => {
      return document.fonts.check(shorthand);
    };
  out.loadFontFaces = (shorthand: string): Promise<FontFace[]> => {
      return document.fonts.load(shorthand);
    };
  out.whenReady = async (): Promise<void> => {
      await document.fonts.ready;
    };
  return finishEntity(out);
}

export const webFontLoadingBackend: FontLoadingBackend & Entity = createWebFontLoadingBackend();
