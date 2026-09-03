import type { HasMediaAudioCodec } from '@flighthq/types/contract';

export function canPlayAudioType(host: Readonly<HasMediaAudioCodec>, mimeType: string): boolean {
  if (mimeType === '') return false;
  return host.media.audioCodec.canPlayType(mimeType);
}

export function detectAudioMimeType(data: ArrayBuffer | Uint8Array): string | null {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.byteLength < 4) return null;

  if (
    b.byteLength >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x41 &&
    b[10] === 0x56 &&
    b[11] === 0x45
  )
    return 'audio/wav';

  if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) return 'audio/flac';

  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'audio/ogg';

  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'audio/mpeg';
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg';

  if (b.byteLength >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'audio/mp4';

  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';

  return null;
}

export function getAudioMimeTypeEssence(mimeType: string): string {
  const end = mimeType.indexOf(';');
  return (end === -1 ? mimeType : mimeType.slice(0, end)).trim().toLowerCase();
}

export function getAudioMimeTypeParameter(mimeType: string, name: string): string | null {
  const wanted = name.toLowerCase();
  let start = -1;
  let quoted = false;
  for (let i = 0; i <= mimeType.length; i++) {
    const character = i < mimeType.length ? mimeType[i] : ';';
    if (character === '"') quoted = !quoted;
    if (quoted || character !== ';') continue;
    if (start >= 0) {
      const part = mimeType.slice(start, i);
      const separator = part.indexOf('=');
      if (separator >= 0 && part.slice(0, separator).trim().toLowerCase() === wanted) {
        const value = part.slice(separator + 1).trim();
        return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
      }
    }
    start = i + 1;
  }
  return null;
}

export function inferAudioMimeType(url: string): string | null {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'ogg':
      return 'audio/ogg';
    case 'wav':
      return 'audio/wav';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'webm':
      return 'audio/webm';
    case 'm4a':
      return 'audio/mp4';
    default:
      return null;
  }
}
