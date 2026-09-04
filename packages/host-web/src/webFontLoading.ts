import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, FontLoadingBackend, EntityConstruction } from '@flighthq/types/contract';

export function createWebFontLoadingBackend(): FontLoadingBackend & Entity {
  const out = allocateEntity<FontLoadingBackend & Entity>();
  initializeWebFontLoadingBackend(out);
  return finishEntity(out);
}

export function initializeWebFontLoadingBackend(out: EntityConstruction<FontLoadingBackend & Entity>): void {
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
}

export const webFontLoadingBackend: FontLoadingBackend & Entity = createWebFontLoadingBackend();
