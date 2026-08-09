import type { ImageBitmapComposer } from '@flighthq/types/contract';

export function clearImageBitmapComposers(): void {
  composers.clear();
}

export function getImageBitmapComposer(kind: string): ImageBitmapComposer | null {
  return composers.get(kind) ?? null;
}

export function getImageBitmapComposerKinds(): readonly string[] {
  return Array.from(composers.keys());
}

export function hasImageBitmapComposer(kind: string): boolean {
  return composers.has(kind);
}

export function registerImageBitmapComposer(kind: string, composer: ImageBitmapComposer): void {
  composers.set(kind, composer);
}

export function unregisterImageBitmapComposer(kind: string): void {
  composers.delete(kind);
}

// Open, format-neutral composer registry. A container puts only the stable key and payload bytes on a
// reference; its package owns the callback that understands those bytes. Last registration wins so an
// application can replace a built-in producer deliberately without embedding executable state in a scene.
const composers = new Map<string, ImageBitmapComposer>();
