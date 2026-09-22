import { decodeImage } from '@flighthq/image-codec/contract';
import { registerImageBitmapCompositionResolver } from '@flighthq/image/contract';
import type {
  Bitmap,
  EmbeddedImageResourceReference,
  HostImageDecodeCapabilities,
  ImageBitmapComposer,
} from '@flighthq/types/contract';

export function clearWebImageBitmapComposers(): void {
  composers.clear();
}

export function disableWebImageBitmapComposition(): void {
  registerImageBitmapCompositionResolver(null);
}

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
  imageDecode: Readonly<HostImageDecodeCapabilities>,
  ref: Readonly<EmbeddedImageResourceReference>,
  signal: AbortSignal,
): Promise<Bitmap | null> {
  signal.throwIfAborted();
  const composition = ref.bitmapComposition!;
  const composer = getWebImageBitmapComposer(composition.kind);
  if (composer === null) return null;
  const decoded = await decodeImage(imageDecode, ref.bytes, ref.mimeType ?? undefined);
  signal.throwIfAborted();
  return composer(decoded, composition.payload);
}

const composers = new Map<string, ImageBitmapComposer>();
