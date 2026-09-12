import { decodeImage } from '@flighthq/image-codec/contract';
import { registerImageBitmapCompositionResolver } from '@flighthq/image/contract';
import type { Bitmap, EmbeddedImageResourceReference, ImageBitmapComposer } from '@flighthq/types/contract';

// Open, format-neutral composer registry and the join it feeds. A container puts only the stable key and
// payload bytes on a reference; its package owns the callback that understands those bytes. Last
// registration wins so an application can replace a built-in producer deliberately without embedding
// executable state in a scene.

export function clearWebImageBitmapComposers(): void {
  composers.clear();
}

// Takes the join back out of the image lane, restoring the plain straight-decode path.
export function disableWebImageBitmapComposition(): void {
  registerImageBitmapCompositionResolver(null);
}

// Installs the optional decoded-pixel join without making an ordinary embedded-image consumer retain its
// registry lookup or straight-decode branch. A format package calls this beside its composer
// registrations; until then the image lane's nullable slot keeps the hot path tree-shakable.
export function enableWebImageBitmapComposition(): void {
  registerImageBitmapCompositionResolver(resolveImageBitmapComposition);
}

export function getWebImageBitmapComposer(kind: string): ImageBitmapComposer | null {
  return composers.get(kind) ?? null;
}

export function getWebImageBitmapComposerKinds(): readonly string[] {
  return Array.from(composers.keys());
}

export function hasWebImageBitmapComposer(kind: string): boolean {
  return composers.has(kind);
}

export function registerWebImageBitmapComposer(kind: string, composer: ImageBitmapComposer): void {
  composers.set(kind, composer);
}

export function unregisterWebImageBitmapComposer(kind: string): void {
  composers.delete(kind);
}

async function resolveImageBitmapComposition(
  ref: Readonly<EmbeddedImageResourceReference>,
  signal: AbortSignal,
): Promise<Bitmap | null> {
  signal.throwIfAborted();
  const composition = ref.bitmapComposition!;
  const composer = getWebImageBitmapComposer(composition.kind);
  if (composer === null) return null;
  // A composer always receives straight decoded pixels. It may also own a raw raster with no MIME
  // decoder, in which case decoded is null and its plain payload is the complete input.
  const decoded = await decodeImage(ref.bytes, ref.mimeType ?? undefined);
  signal.throwIfAborted();
  return composer(decoded, composition.payload);
}

const composers = new Map<string, ImageBitmapComposer>();
