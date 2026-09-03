import { createEntity } from '@flighthq/entity/contract';
import type { Entity, FontLoadingBackend } from '@flighthq/types/contract';

export function createWebFontLoadingBackend(): FontLoadingBackend & Entity {
  return createEntity({
    addFontFace(face: FontFace): void {
      document.fonts.add(face);
    },
    checkFontFace(shorthand: string): boolean {
      return document.fonts.check(shorthand);
    },
    loadFontFaces(shorthand: string): Promise<FontFace[]> {
      return document.fonts.load(shorthand);
    },
    async whenReady(): Promise<void> {
      await document.fonts.ready;
    },
  } satisfies FontLoadingBackend);
}

export const webFontLoadingBackend: FontLoadingBackend & Entity = createWebFontLoadingBackend();
