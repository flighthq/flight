import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { inverseMatrix3 } from '@flighthq/geometry/contract';
import type {
  EntityConstruction,
  HostImageSource,
  HostVideoCapability,
  ImageResource,
  Matrix3Like,
  Texture,
  Texture2D,
  TextureLike,
  VideoResource,
} from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

import { cloneTexture, copyTexture, createTexture, getTextureUvMatrix } from './texture.ts';

// Marks a fresh decoded frame on a video-backed Texture. The ImageResource is the shared CPU-origin source
// and owns the upload revision; Texture.version mirrors it as the sampled object's dirty-bit.
export function advanceVideoTexture(hostVideo: Readonly<HostVideoCapability>, texture: TextureLike): number {
  const image = getVideoImage(texture);
  if (image == null) return texture.version;
  updateVideoImageSize(hostVideo, image);
  image.version = (image.version + 1) >>> 0;
  texture.version = image.version;
  return texture.version;
}

// Clones sampling/UV state while sharing the borrowed video ImageResource and its upload cache key.
export function cloneVideoTexture(source: Readonly<TextureLike>): Texture {
  return cloneTexture(source);
}

// Copies a video-backed Texture through the universal Texture field copier.
export function copyVideoTexture(out: TextureLike, source: Readonly<TextureLike>): void {
  copyTexture(out, source);
}

// Wraps a VideoResource's borrowed host element in an ImageResource source and returns the same
// universal Texture type used by still images and render targets. The all-ones initial revision
// preserves the former first advanceVideoTexture result of 0 after u32 wrap.
export function createVideoTexture(
  hostVideo: Readonly<HostVideoCapability>,
  source: VideoResource,
  opts?: Readonly<Partial<TextureLike>>,
): Texture2D {
  const image = createVideoImageResource(hostVideo, source);
  return createTexture({
    ...opts,
    dimension: '2d',
    source: image,
    version: image?.version ?? INITIAL_VIDEO_VERSION,
  });
}

// Detaches the borrowed video ImageResource source without destroying the underlying VideoResource. Leaves
// the Texture entity invalid — subsequent advance/ready calls return sentinel values.
export function destroyVideoTexture(texture: Texture2D): void {
  texture.source = null;
  texture.version = INITIAL_VIDEO_VERSION;
}

// Returns the decoded frame height, or -1 while the borrowed host element is absent/unready.
export function getVideoTextureHeight(
  hostVideo: Readonly<HostVideoCapability>,
  texture: Readonly<TextureLike>,
): number {
  const source = getVideoSource(texture);
  const height = source !== null ? (hostVideo.getHeight?.(source) ?? 0) : 0;
  return height > 0 ? height : -1;
}

// Video-named compatibility entry over the universal Texture UV transform.
export function getVideoTextureInverseUvMatrix(out: Matrix3Like, texture: Readonly<TextureLike>): void {
  getVideoTextureUvMatrix(out, texture);
  inverseMatrix3(out, out);
}

// Video-named compatibility entry over the universal Texture UV transform.
export function getVideoTextureUvMatrix(out: Matrix3Like, texture: Readonly<TextureLike>): void {
  getTextureUvMatrix(out, texture);
}

// Returns the decoded frame width, or -1 while the borrowed host element is absent/unready.
export function getVideoTextureWidth(hostVideo: Readonly<HostVideoCapability>, texture: Readonly<TextureLike>): number {
  const source = getVideoSource(texture);
  const width = source !== null ? (hostVideo.getWidth?.(source) ?? 0) : 0;
  return width > 0 ? width : -1;
}

export function initializeVideoImageResource(
  out: EntityConstruction<ImageResource>,
  source: HostImageSource,
  version: number,
): void {
  out.alphaType = 'straight';
  out.gamut = 'srgb';
  out.height = 0;
  out.kind = ImageTextureSourceKind;
  out.source = source;
  out.version = version;
  out.width = 0;
}

// True once the borrowed host element exposes a decoded current frame and non-zero dimensions.
export function isVideoTextureFrameReady(
  hostVideo: Readonly<HostVideoCapability>,
  texture: Readonly<TextureLike>,
): boolean {
  const source = getVideoSource(texture);
  return (
    source !== null &&
    hostVideo.isReady?.(source) === true &&
    (hostVideo.getWidth?.(source) ?? 0) > 0 &&
    (hostVideo.getHeight?.(source) ?? 0) > 0
  );
}

// Resets the shared source revision so its next advance wraps to 0 and every state re-uploads.
export function resetVideoTextureFrame(texture: TextureLike): void {
  const image = getVideoImage(texture);
  if (image != null) image.version = INITIAL_VIDEO_VERSION;
  texture.version = INITIAL_VIDEO_VERSION;
}

// Replaces the immutable host-backed identity and resets its upload revision. The VideoResource
// remains the loader/lifecycle object; Texture stores only its current host handle.
export function setVideoTextureSource(
  hostVideo: Readonly<HostVideoCapability>,
  texture: TextureLike,
  source: VideoResource,
): void {
  if (texture.dimension !== '2d') throw new Error('setVideoTextureSource requires a Texture2D');
  texture.source = createVideoImageResource(hostVideo, source);
  texture.version = INITIAL_VIDEO_VERSION;
}

function createVideoImageResource(
  hostVideo: Readonly<HostVideoCapability>,
  source: Readonly<VideoResource>,
): ImageResource | null {
  if (source.element === null) return null;
  const image = allocateEntity<ImageResource>();
  initializeVideoImageResource(image, source.element, INITIAL_VIDEO_VERSION);
  updateVideoImageSize(hostVideo, image);
  return finishEntity(image);
}

function getVideoSource(texture: Readonly<TextureLike>): HostImageSource | null {
  return getVideoImage(texture)?.source ?? null;
}

function getVideoImage(texture: Readonly<TextureLike>): ImageResource | null {
  return texture.dimension === '2d' ? (texture.source as ImageResource | null) : null;
}

function updateVideoImageSize(hostVideo: Readonly<HostVideoCapability>, image: ImageResource): void {
  image.width = hostVideo.getWidth?.(image.source) ?? 0;
  image.height = hostVideo.getHeight?.(image.source) ?? 0;
}

// The u32 predecessor of the first public frame revision.
const INITIAL_VIDEO_VERSION = 0xffffffff;
