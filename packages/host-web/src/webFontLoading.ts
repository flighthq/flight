import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, EntityConstruction, HostFontLoadingCapability } from '@flighthq/types/contract';

export function createWebFontLoadingBackend(): HostFontLoadingCapability & Entity {
  const out = allocateEntity<HostFontLoadingCapability & Entity>();
  initializeWebFontLoadingBackend(out);
  return finishEntity(out);
}

export function initializeWebFontLoadingBackend(out: EntityConstruction<HostFontLoadingCapability & Entity>): void {
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

export const webHostFontLoading: HostFontLoadingCapability & Entity = createWebFontLoadingBackend();
