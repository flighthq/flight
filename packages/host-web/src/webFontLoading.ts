import { createEntity } from '@flighthq/entity/contract';
import { installFontLoadingHostBackend } from '@flighthq/font/contract';
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

export function enableHostWebFontLoading(): void {
  if (_enabled) return;
  _enabled = true;
  installFontLoadingHostBackend(createWebFontLoadingBackend());
}

export function resetHostWebFontLoadingForTest(): void {
  _enabled = false;
}

let _enabled = false;
