import type { VideoCapabilityBackend, VideoResourceUrl } from '@flighthq/types/contract';

export function canPlayVideoType(backend: Readonly<VideoCapabilityBackend>, mimeType: string): boolean {
  if (mimeType === '') return false;
  return probeSelectedBackend(backend, mimeType);
}

export function detectVideoMimeType(data: ArrayBuffer | Uint8Array): string | null {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.byteLength < 4) return null;

  if (b.byteLength >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
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

export function selectVideoResourceUrl(
  backend: Readonly<VideoCapabilityBackend>,
  sources: Readonly<VideoResourceUrl[]>,
): VideoResourceUrl | null {
  for (const source of sources) {
    const mimeType = source.type ?? inferVideoMimeType(source.url) ?? '';
    if (mimeType === '') continue;
    if (probeSelectedBackend(backend, mimeType)) return source;
  }
  return null;
}

function probeSelectedBackend(backend: Readonly<VideoCapabilityBackend>, mimeType: string): boolean {
  if (mimeType === '') return false;
  try {
    return backend.canPlayType(mimeType) === true;
  } catch {
    return false;
  }
}
