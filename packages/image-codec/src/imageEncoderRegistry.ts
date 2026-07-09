import type { ImageEncoder } from '@flighthq/types';

export function clearImageEncoders(): void {
  encoders.clear();
}

export function getImageEncoder(mimeType: string): ImageEncoder | null {
  return encoders.get(mimeType) ?? null;
}

export function hasImageEncoder(mimeType: string): boolean {
  return encoders.has(mimeType);
}

export function registerImageEncoder(mimeType: string, encoder: ImageEncoder): void {
  encoders.set(mimeType, encoder);
}

export function unregisterImageEncoder(mimeType: string): void {
  encoders.delete(mimeType);
}

// Global MIME-keyed encoder registry. Empty at import — only register* populates it, so importing this
// package has no side effects. Last-write-wins: a native host can override the web encoder for a MIME
// type by registering after registerWebImageEncoders.
const encoders = new Map<string, ImageEncoder>();
