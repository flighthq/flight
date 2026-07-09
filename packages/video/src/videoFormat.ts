import type { VideoResourceUrl } from '@flighthq/types';

// True when the current environment claims it can play the given MIME type (a non-empty canPlayType
// result — 'maybe' or 'probably'). Returns false in headless environments (jsdom) where no codecs
// are registered. This is the codec-probe primitive that source selection is built on.
export function canPlayVideoType(mimeType: string): boolean {
  const probe = document.createElement('video');
  return probe.canPlayType(mimeType) !== '';
}

// Sniffs a container MIME type from the leading bytes of encoded video, or null when unrecognised.
// Mirrors detectImageMimeType. mkv and webm share the Matroska/EBML signature (the DocType that
// separates them lives deeper in the stream), so both report as 'video/webm', the web-canonical one.
export function detectVideoMimeType(data: ArrayBuffer | Uint8Array): string | null {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.byteLength < 4) return null;

  // ISO Base Media (mp4/m4v): a 'ftyp' box tag at bytes 4-7 (66 74 79 70).
  if (b.byteLength >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4';

  // Matroska/WebM (EBML header): 1A 45 DF A3.
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';

  // Ogg: 'OggS' (4F 67 67 53).
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'video/ogg';

  return null;
}

export function inferVideoMimeType(url: string): string | null {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    case 'ogv':
    case 'ogg':
      return 'video/ogg';
    case 'mov':
      return 'video/quicktime';
    case '3gp':
      return 'video/3gpp';
    case 'm3u8':
      return 'application/vnd.apple.mpegurl';
    case 'mpd':
      return 'application/dash+xml';
    default:
      return null;
  }
}

// Picks the first source the environment can play, resolving each source's MIME type from its
// explicit `type` or, failing that, its URL extension. Returns null when none is playable — the
// source-negotiation primitive behind loadVideoResourceFromUrls.
export function selectVideoResourceUrl(sources: Readonly<VideoResourceUrl[]>): VideoResourceUrl | null {
  for (const source of sources) {
    if (canPlayVideoType(source.type ?? inferVideoMimeType(source.url) ?? '')) return source;
  }
  return null;
}
