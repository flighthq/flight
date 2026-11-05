// The image-owned contracts that depend on nothing outside the platform: the acyclic image contract lane.
// @flighthq/types re-exports these; the image contracts that still reference bitmap, texture, surface,
// host-source or image-codec types remain in @flighthq/types until those owners have acyclic lanes too.

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
