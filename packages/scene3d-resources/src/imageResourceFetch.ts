import { loadImageResourceFromUrl } from '@flighthq/image/contract';
import type { HasGraphicsImage, ImageResourceFetch } from '@flighthq/types/contract';

export function createWebImageResourceFetch(host: Readonly<HasGraphicsImage>): ImageResourceFetch {
  return async (ref, signal) => {
    const url = resolveImageResourceUri(ref.uri, ref.basePath);
    try {
      return await loadImageResourceFromUrl(host, url, undefined, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      return null;
    }
  };
}

export function resolveImageResourceUri(uri: string, basePath: string | null): string {
  if (basePath === null || isAbsoluteImageResourceUri(uri)) return uri;
  if (basePath.endsWith('/') || uri.startsWith('/')) return `${basePath}${uri}`;
  return `${basePath}/${uri}`;
}

function isAbsoluteImageResourceUri(uri: string): boolean {
  return uri.startsWith('/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri);
}
