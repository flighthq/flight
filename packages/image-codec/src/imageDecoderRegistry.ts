import type { ImageDecoder } from '@flighthq/types';

export function clearImageDecoders(): void {
  decoders.clear();
}

export function getImageDecoder(mimeType: string): ImageDecoder | null {
  return decoders.get(mimeType) ?? null;
}

export function hasImageDecoder(mimeType: string): boolean {
  return decoders.has(mimeType);
}

export function registerImageDecoder(mimeType: string, decoder: ImageDecoder): void {
  decoders.set(mimeType, decoder);
}

export function unregisterImageDecoder(mimeType: string): void {
  decoders.delete(mimeType);
}

// Global MIME-keyed decoder registry. Empty at import — only register* populates it, so importing this
// package has no side effects. Last-write-wins: a native host can override the web decoder for a MIME
// type by registering after registerWebImageDecoders.
const decoders = new Map<string, ImageDecoder>();
