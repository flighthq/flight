import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { decodeImage, decodeImagePremultiplied, explainImageDecodeFailure } from '@flighthq/image-codec/contract';
import type {
  AlphaType,
  Bitmap,
  EmbeddedImageResourceReference,
  ExternalImageResourceReference,
  ImageResourceFailure,
  ImageResourceFetch,
  ImageResourceReference,
  ImageBitmapCompositionResolver,
  ImageResourceReferenceResolutionExplanation,
  TextureSource,
  EntityConstruction,
} from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  ImageResourceFailureKind,
  ImageResourceReferenceKind,
  ResourceResolutionState,
} from '@flighthq/types/contract';

export function createEmbeddedImageResourceReference(
  bytes: Uint8Array,
  mimeType: string | null = null,
  alphaType: AlphaType = 'straight',
): EmbeddedImageResourceReference {
  const out = allocateEntity<EmbeddedImageResourceReference>();
  initializeEmbeddedImageResourceReference(out, bytes, mimeType, alphaType);
  return finishEntity(out);
}

export function createExternalImageResourceReference(
  uri: string,
  basePath: string | null = null,
): ExternalImageResourceReference {
  const out = allocateEntity<ExternalImageResourceReference>();
  initializeExternalImageResourceReference(out, uri, basePath);
  return finishEntity(out);
}

// The one encoded-byte producer for image resource references. A registered decoder owns format
// knowledge; this async resource layer turns its RGBA result into the live Bitmap entity renderers
// dispatch by kind. The reference's alpha request is carried onto the source verbatim, so bytes that
// are already premultiplied never get multiplied a second time at renderer upload.
async function decodeEmbeddedImageResourceReference(
  ref: Readonly<EmbeddedImageResourceReference>,
  signal: AbortSignal,
): Promise<Bitmap | null> {
  if (ref.bitmapComposition !== undefined && _resolveImageBitmapComposition !== null) {
    return _resolveImageBitmapComposition(ref, signal);
  }
  signal.throwIfAborted();
  const decoded = await (ref.alphaType === 'premultiplied'
    ? decodeImagePremultiplied(ref.bytes, ref.mimeType ?? undefined)
    : decodeImage(ref.bytes, ref.mimeType ?? undefined));
  signal.throwIfAborted();
  if (decoded === null) return null;
  const out = allocateEntity<Bitmap>();
  out.alphaType = ref.alphaType;
  out.data = new Uint8ClampedArray(decoded.data);
  out.format = 'rgba8unorm' as const;
  out.gamut = 'srgb' as const;
  out.height = decoded.height;
  out.kind = BitmapTextureSourceKind;
  out.version = 0;
  out.width = decoded.width;
  return finishEntity(out);
}

// Reduces a thrown value to the serialization-safe categories a reference retains. Raw Error objects and
// arbitrary thrown values stay inside the resolving operation; diagnostics get category, name, and message.
export function createImageResourceFailure(cause: unknown): ImageResourceFailure {
  if (cause instanceof Error) {
    const out = allocateEntity<ImageResourceFailure>();
    out.kind = ImageResourceFailureKind.Error;
    out.message = cause.message;
    out.name = cause.name;
    return finishEntity(out);
  }
  const out = allocateEntity<ImageResourceFailure>();
  out.kind = ImageResourceFailureKind.Error;
  out.message = String(cause);
  out.name = null;
  return finishEntity(out);
}

// Returns a detached plain-data explanation suitable for logs, tools, and serialization. It never throws
// and exposes no resolver runtime or raw thrown value.
export function explainImageResourceReferenceResolution(
  ref: Readonly<ImageResourceReference>,
): ImageResourceReferenceResolutionExplanation {
  return {
    failure: ref.failure === null ? null : { ...ref.failure },
    kind: ref.kind,
    retryable: ref.state === ResourceResolutionState.Failed,
    state: ref.state,
  };
}

let _resolveImageBitmapComposition: ImageBitmapCompositionResolver | null = null;

// `bytes` is retained as the view the container handed over, not a copy: a parser carves an image payload
// out of its source and the reference borrows it, so a document that never resolves an image never pays for
// its pixels. `textures` starts empty and each waiting Texture subscribes itself.
export function initializeEmbeddedImageResourceReference(
  out: EntityConstruction<EmbeddedImageResourceReference>,
  bytes: Uint8Array,
  mimeType: string | null = null,
  alphaType: AlphaType = 'straight',
): void {
  out.alphaType = alphaType;
  out.bytes = bytes;
  out.failure = null;
  out.kind = ImageResourceReferenceKind.Embedded;
  out.mimeType = mimeType;
  out.state = ResourceResolutionState.Unresolved;
  out.textures = [];
}

export function initializeExternalImageResourceReference(
  out: EntityConstruction<ExternalImageResourceReference>,
  uri: string,
  basePath: string | null = null,
): void {
  out.basePath = basePath;
  out.failure = null;
  out.kind = ImageResourceReferenceKind.External;
  out.mimeType = null;
  out.state = ResourceResolutionState.Unresolved;
  out.textures = [];
  out.uri = uri;
}

// The slot the optional decoded-pixel join installs into, so an ordinary embedded-image consumer keeps
// neither a composer registry nor a second decode branch. Whoever owns the composers — the web host
// today, through enableWebImageBitmapComposition — puts its resolver here and passes null to take it back;
// until something does, the nullable hook leaves the original hot path byte-for-byte tree-shakable.
export function registerImageBitmapCompositionResolver(resolver: ImageBitmapCompositionResolver | null): void {
  _resolveImageBitmapComposition = resolver;
}

// Returns a failed reference to the requestable state. Loading/resolved/unresolved references are unchanged
// so this atom cannot invalidate live work or a successfully bound resource accidentally.
export function resetFailedImageResourceReference(ref: ImageResourceReference): boolean {
  if (ref.state !== ResourceResolutionState.Failed) return false;
  ref.failure = null;
  ref.state = ResourceResolutionState.Unresolved;
  return true;
}

// Advances one reference through its lifecycle and returns the decoded texture source, or null for an expected
// failure. Embedded bytes decode through @flighthq/image-codec; an External uri goes through the caller's
// fetch seam. An abort is a cancel rather than a failure, so the reference reverts to Unresolved and the
// rejection propagates — a caller racing several loads against one signal sees one cancellation, not a
// document full of spurious Failed references.
//
// This is the whole lifecycle for a document that resolves its images once. A caller needing concurrency
// limits, priority, or retry drives those around this atom rather than inside it.
export async function resolveImageResourceReference(
  ref: ImageResourceReference,
  fetch: ImageResourceFetch,
  signal: AbortSignal,
): Promise<TextureSource | null> {
  ref.failure = null;
  ref.state = ResourceResolutionState.Loading;
  try {
    const usesOrdinaryEmbeddedDecode =
      ref.kind === ImageResourceReferenceKind.Embedded &&
      (ref.bitmapComposition === undefined || _resolveImageBitmapComposition === null);
    const source =
      ref.kind === ImageResourceReferenceKind.Embedded
        ? await decodeEmbeddedImageResourceReference(ref, signal)
        : await fetch(ref, signal);
    if (source === null) {
      const decodeFailure = usesOrdinaryEmbeddedDecode
        ? explainImageDecodeFailure(ref.bytes, ref.mimeType ?? undefined)
        : null;
      const out = allocateEntity<ImageResourceFailure>();
      out.kind = ImageResourceFailureKind.Unavailable;
      out.message = decodeFailure?.reason ?? 'Image resource unavailable';
      out.name = null;
      ref.failure = finishEntity(out);
      ref.state = ResourceResolutionState.Failed;
      return null;
    }
    ref.state = ResourceResolutionState.Resolved;
    return source;
  } catch (cause) {
    if (signal.aborted) {
      ref.state = ResourceResolutionState.Unresolved;
      throw cause;
    }
    ref.failure = createImageResourceFailure(cause);
    ref.state = ResourceResolutionState.Failed;
    return null;
  }
}
