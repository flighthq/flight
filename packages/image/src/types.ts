import type { Bitmap } from '@flighthq/bitmap/contract';
import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { DecodedImage, HostImageDecodeCapabilities } from '@flighthq/image-codec/contract';
import type { ResourceResolutionState } from '@flighthq/resource/contract';
import type { Surface } from '@flighthq/surface/contract';
import type { TextureContainer } from '@flighthq/texture-formats/contract';
import type {
  AlphaType,
  CompressedImageTextureSourceKind,
  ImageTextureSourceKind,
  Texture,
  TextureSource,
} from '@flighthq/texture/contract';

interface ImageEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

// The image-owned contracts that depend on nothing outside the platform: the acyclic image contract lane.

export interface HostImageDimensions {
  height: number;
  width: number;
}

// `source` is the host's drawable image (`HostImageSource`, a `CanvasImageSource` on the web).
export type HostImageDimensionResolver = (source: CanvasImageSource, out: HostImageDimensions) => boolean;

export const ImageResourceReferenceKind = {
  Embedded: 'Embedded',
  External: 'External',
} as const;

export type ImageResourceReferenceKind = (typeof ImageResourceReferenceKind)[keyof typeof ImageResourceReferenceKind];

export const ImageResourceFailureKind = {
  Error: 'Error',
  Unavailable: 'Unavailable',
} as const;

export type ImageResourceFailureKind = (typeof ImageResourceFailureKind)[keyof typeof ImageResourceFailureKind];

/**
 * A flat host-drawable image asset. ImageResource, Bitmap, and CompressedImageResource are sibling
 * TextureSource variants; renderers dispatch them by `kind` and never inspect nullable alternate
 * representations.
 */
export interface ImageResource extends TextureSource {
  /** Image TextureSource registry key. */
  readonly kind: typeof ImageTextureSourceKind;
  /** Borrowed host representation uploaded or drawn directly (image, canvas, ImageBitmap, …). */
  readonly source: CanvasImageSource;
}

// The image-decode seam realized by the web default (`webHostImage`) and by native hosts. A
// backend turns a URL into a decoded `ImageResource`; `@flighthq/image` dispatches every URL load
// through it, and every other loader in that package — base64, blob, bytes — funnels into the same
// call, so a host replaces one method rather than four.
//
// `crossOrigin` is the DOM attribute's vocabulary because that is what the format of the request is,
// not because the backend must be a DOM one: a native host reads it as the credential mode to use.
// `signal` cancels the load; an aborted load rejects with the signal's reason rather than resolving.
export interface HostImageCapability {
  // Materializes raw Bitmap pixels into this host's drawable ImageResource representation. Optional
  // because native providers may decode URLs without owning a synchronous raw-pixel bridge; absence
  // is the capability signal and callers must not silently fall back to browser globals.
  createImageFromBitmap?(bitmap: Readonly<Bitmap>): ImageResource;
  // Wraps a surface's backing drawable as an uploadable ImageResource. The result is a live reference
  // to the surface's content, not a copy — drawing on the surface updates the image. Optional because
  // not every host has a surface-to-image bridge; GL/WGPU text and shape renderers require it.
  createImageFromSurface?(surface: Readonly<Surface>): ImageResource;
  loadImageFromUrl(
    url: string,
    crossOrigin?: 'anonymous' | 'use-credentials',
    signal?: AbortSignal,
  ): Promise<ImageResource>;
}

export type ImageOperation = keyof HostImageCapability;

// A serialization-safe failure cause retained on the reference. Raw thrown values and Error objects
// stay inside the async operation; diagnostics get the stable category, name, and message only.
export interface ImageResourceFailure extends ImageEntity {
  kind: ImageResourceFailureKind;
  message: string;
  name: string | null;
}

interface ImageResourceReferenceBase extends ImageEntity {
  // Null until a terminal failure. Reset/retry clears it before the next request.
  failure: ImageResourceFailure | null;
  // The image MIME type (`image/png`, `image/jpeg`) when known — detected from the embedded bytes
  // or declared by the container. Null when it must be inferred at resolve time (e.g. from an
  // external URI's extension or the fetch response), which the resolver does.
  mimeType: string | null;
  // Advanced by the resolver: Unresolved → Loading → Resolved | Failed. Read it to drive a loading
  // HUD or a fade-in; the waiting Textures' `source` is non-null only once `state` reaches Resolved.
  state: ResourceResolutionState;
  // Textures consuming this reference. The scene owns references as sidecar data; Texture stays
  // format/resource agnostic.
  textures?: Texture[];
}

// The encoded image bytes are already available; resolution decodes them through @flighthq/image-codec.
export interface EmbeddedImageResourceReference extends ImageResourceReferenceBase {
  kind: 'Embedded';
  // The alpha representation requested from the decoder and declared on the resulting Bitmap. Most
  // encoded images decode to straight RGBA. A container-native raster may retain premultiplied bytes
  // deliberately; keeping that choice in plain reference data lets the async resource layer request
  // the matching decoder output without teaching it about a container-specific MIME type.
  alphaType: AlphaType;
  // Present only when the decoded pixels need a format-owned join, or when the payload itself is a raw
  // raster with no MIME decoder. The stable kind selects a registered callback; executable state never
  // enters this plain-data reference.
  bitmapComposition?: ImageBitmapComposition;
  bytes: Uint8Array;
}

// The image must be fetched from `uri` before decoding. `uri` may be absolute or relative; a
// relative `uri` resolves against `basePath` (the directory the container was loaded from), null
// when the container carried no base. The fetch itself is a swappable seam the resolver owns.
export interface ExternalImageResourceReference extends ImageResourceReferenceBase {
  kind: 'External';
  uri: string;
  basePath: string | null;
}

export type ImageResourceReference = EmbeddedImageResourceReference | ExternalImageResourceReference;

// The swappable fetch seam an External reference resolves through. The web backend fetches a URL; a
// native host substitutes its own. This boundary deliberately remains ImageResource-only: External means fetching
// a URI into a host-drawable handle, while Embedded has bytes in hand and may decode to any TextureSource.
// Widen this only when an external compressed/pre-decoded source has a real consumer; doing so before then
// would advertise an injection path no standard fetch implementation can produce. Returns null for an
// expected miss rather than throwing.
export type ImageResourceFetch = (
  ref: Readonly<ExternalImageResourceReference>,
  signal: AbortSignal,
) => Promise<ImageResource | null>;

export interface ImageResourceReferenceResolutionExplanation {
  failure: ImageResourceFailure | null;
  kind: ImageResourceReferenceKind;
  retryable: boolean;
  state: ResourceResolutionState;
}

// Plain data selecting an explicitly registered pixel composer. `payload` belongs to the producer that
// declared `kind`; the shared image lane only carries it to that composer after ordinary MIME decoding.
// A producer that owns raw pixels rather than an encoded image may compose from the payload alone when
// `decoded` is null. Keeping the callback in the registry leaves resource references serializable.
export interface ImageBitmapComposition {
  kind: string;
  payload: Uint8Array;
}

export type ImageBitmapComposer = (
  decoded: Readonly<DecodedImage> | null,
  payload: Readonly<Uint8Array>,
) => Bitmap | null;

// The optional decoded-pixel join installed into reference resolution. It stands between an embedded
// reference that names a composer and the Bitmap that composer produces; @flighthq/image holds the slot
// and knows nothing about which composers exist.
export type ImageBitmapCompositionResolver = (
  imageDecode: Readonly<HostImageDecodeCapabilities>,
  ref: Readonly<EmbeddedImageResourceReference>,
  signal: AbortSignal,
) => Promise<Bitmap | null>;

// Container metadata and encoded bytes owned by a CompressedImage. A parser fills the container
// descriptor and hands back the raw payload indexed by its per-level byte ranges; GPU backends upload
// it directly or use an explicitly registered decode fallback.
export interface CompressedImageData {
  readonly container: TextureContainer;
  readonly payload: Readonly<Uint8Array>;
}

/**
 * GPU-only block-compressed image source. The payload remains in its container-native format; it is
 * neither directly drawable by Canvas/DOM nor readable through the Bitmap pixel API.
 */
export interface CompressedImageResource extends TextureSource {
  readonly compressed: CompressedImageData;
  readonly kind: typeof CompressedImageTextureSourceKind;
}
