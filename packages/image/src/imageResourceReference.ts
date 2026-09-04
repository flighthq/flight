import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  decodeImage,
  decodeImagePremultiplied,
  explainImageDecodeFailure,
  getImageBitmapComposer,
} from '@flighthq/image-codec/contract';
import type {
  AlphaType,
  Bitmap,
  EmbeddedImageResourceReference,
  EntityWithoutRuntime,
  ExternalImageResourceReference,
  ImageResourceFailure,
  ImageResourceFetch,
  ImageResourceReference,
  ImageResourceReferenceResolutionExplanation,
  TextureSource,
} from '@flighthq/types/contract';
import {
  BitmapTextureSourceKind,
  ImageResourceFailureKind,
  ImageResourceReferenceKind,
  ResourceResolutionState,
} from '@flighthq/types/contract';

// `bytes` is retained as the view the container handed over, not a copy: a parser carves an image payload
// out of its source and the reference borrows it, so a document that never resolves an image never pays for
// its pixels. `textures` starts empty and each waiting Texture subscribes itself.
export function createEmbeddedImageResourceReference(
  bytes: Uint8Array,
  mimeType: string | null = null,
  alphaType: AlphaType = 'straight',
): EmbeddedImageResourceReference {
    const out = allocateEntity<EmbeddedImageResourceReference>();
  out.alphaType = alphaType;
  out.bytes = bytes;
  out.failure = null;
  out.kind = ImageResourceReferenceKind.Embedded;
  out.mimeType = mimeType;
  out.state = ResourceResolutionState.Unresolved;
  out.textures = [];
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
  const bitmap: EntityWithoutRuntime<Bitmap> = {
    alphaType: ref.alphaType,
    data: new Uint8ClampedArray(decoded.data),
    format: 'rgba8unorm' as const,
    gamut: 'srgb' as const,
    height: decoded.height,
    kind: BitmapTextureSourceKind,
    version: 0,
    width: decoded.width,
  };
  return createEntity(bitmap);
}

export function createExternalImageResourceReference(
  uri: string,
  basePath: string | null = null,
): ExternalImageResourceReference {
    const out = allocateEntity<EmbeddedImageResourceReference>();
  out.basePath = basePath;
  out.failure = null;
  out.kind = ImageResourceReferenceKind.External;
  out.mimeType = null;
  out.state = ResourceResolutionState.Unresolved;
  out.textures = [];
  out.uri = uri;
  return finishEntity(out);
}

// Reduces a thrown value to the serialization-safe categories a reference retains. Raw Error objects and
// arbitrary thrown values stay inside the resolving operation; diagnostics get category, name, and message.
export function createImageResourceFailure(cause: unknown): ImageResourceFailure {
  if (cause instanceof Error) {
        const out = allocateEntity<EmbeddedImageResourceReference>();
    out.kind = ImageResourceFailureKind.Error;
    out.message = cause.message;
    out.name = cause.name;
    return finishEntity(out);
  }
    const out = allocateEntity<EmbeddedImageResourceReference>();
  out.kind = ImageResourceFailureKind.Error;
  out.message = String(cause);
  out.name = null;
  return finishEntity(out);
}

async function resolveImageBitmapComposition(
  ref: Readonly<EmbeddedImageResourceReference>,
  signal: AbortSignal,
): Promise<Bitmap | null> {
  signal.throwIfAborted();
  const composition = ref.bitmapComposition!;
  const composer = getImageBitmapComposer(composition.kind);
  if (composer === null) return null;
  // A composer always receives straight decoded pixels. It may also own a raw raster with no MIME
  // decoder, in which case decoded is null and its plain payload is the complete input.
  const decoded = await decodeImage(ref.bytes, ref.mimeType ?? undefined);
  signal.throwIfAborted();
  return composer(decoded, composition.payload);
}

type ResolveImageBitmapComposition = (
  ref: Readonly<EmbeddedImageResourceReference>,
  signal: AbortSignal,
) => Promise<Bitmap | null>;

let _resolveImageBitmapComposition: ResolveImageBitmapComposition | null = null;

export function disableImageBitmapComposition(): void {
  _resolveImageBitmapComposition = null;
}

// Installs the optional decoded-pixel join without making an ordinary embedded-image consumer retain
// its registry lookup or straight-decode branch. A format package calls this beside its composer
// registrations; until then the nullable hook leaves the original hot path byte-for-byte tree-shakable.
export function enableImageBitmapComposition(): void {
  _resolveImageBitmapComposition = resolveImageBitmapComposition;
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
            const _entity = allocateEntity<EmbeddedImageResourceReference>();
      _entity.kind = ImageResourceFailureKind.Unavailable;
      _entity.message = decodeFailure?.reason ?? 'Image resource unavailable';
      _entity.name = null;
      ref.failure = finishEntity(_entity);
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
