import { loadImageResourceFromUrl } from '@flighthq/image';
import type { ExternalImageResourceReference, ImageResource } from '@flighthq/types';

// The swappable external-fetch seam an ExternalImageResourceReference resolves through. Given a ref and an
// AbortSignal, it returns the decoded ImageResource, or `null` for an expected failure (fetch/decode
// error). A native host swaps this to reach non-web URIs; the web default fetches through an <img>.
export type ImageResourceFetch = (
  ref: Readonly<ExternalImageResourceReference>,
  signal: AbortSignal,
) => Promise<ImageResource | null>;

// The web external-fetch seam: resolves the ref's `uri` against its `basePath`, then decodes it
// through @flighthq/image. Returns `null` on any throw (an expected fetch/decode failure), except a
// caller-driven abort, which rejects so the resolver can distinguish cancellation from failure.
export function createWebImageResourceFetch(): ImageResourceFetch {
  return async (ref, signal) => {
    const url = resolveImageResourceUri(ref.uri, ref.basePath);
    try {
      return await loadImageResourceFromUrl(url, undefined, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      return null;
    }
  };
}

// Joins an external ref's `uri` to its `basePath`. An absolute `uri` — one carrying a scheme
// (`http:`, `https:`, `data:`, …) or rooted at `/` — is used verbatim; otherwise `basePath` (when
// non-null) is prefixed, inserting a single `/` separator.
export function resolveImageResourceUri(uri: string, basePath: string | null): string {
  if (basePath === null || isAbsoluteImageResourceUri(uri)) return uri;
  if (basePath.endsWith('/') || uri.startsWith('/')) return `${basePath}${uri}`;
  return `${basePath}/${uri}`;
}

function isAbsoluteImageResourceUri(uri: string): boolean {
  return uri.startsWith('/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri);
}
