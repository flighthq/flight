import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostFontLoadingProvider, EntityConstruction } from '@flighthq/types/contract';

export function createWebFontLoadingBackend(): HostFontLoadingProvider & Entity {
  const out = allocateEntity<HostFontLoadingProvider & Entity>();
  initializeWebFontLoadingBackend(out);
  return finishEntity(out);
}

export function initializeWebFontLoadingBackend(out: EntityConstruction<HostFontLoadingProvider & Entity>): void {
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

export const webHostFontLoading: HostFontLoadingProvider & Entity = createWebFontLoadingBackend();
