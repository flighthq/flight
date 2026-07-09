// Reports whether the current environment can play a given MIME type, by probing an <audio> element's
// canPlayType. Returns false for the empty string and for any type the browser reports it cannot play.
export function canPlayAudioType(mimeType: string): boolean {
  if (mimeType === '') return false;
  return new Audio().canPlayType(mimeType) !== '';
}

// Sniffs the container MIME type from a buffer's leading magic bytes, or null when unrecognized.
// Mirrors detectImageMimeType. Covers wav, flac, ogg, mp3 (ID3 or MPEG frame sync), m4a/aac
// (ISO-BMFF ftyp), and webm (EBML).
export function detectAudioMimeType(data: ArrayBuffer | Uint8Array): string | null {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b.byteLength < 4) return null;

  // WAV: 'RIFF' (0-3) .... 'WAVE' (8-11)
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

  // FLAC: 'fLaC'
  if (b[0] === 0x66 && b[1] === 0x4c && b[2] === 0x61 && b[3] === 0x43) return 'audio/flac';

  // Ogg: 'OggS'
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return 'audio/ogg';

  // MP3: 'ID3' tag prefix, or an MPEG audio frame sync (11 set bits: 0xFF followed by 0xE0-mask).
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 'audio/mpeg';
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg';

  // M4A / AAC (ISO base media): a box-size prefix (0-3) followed by 'ftyp' (4-7).
  if (b.byteLength >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'audio/mp4';

  // WebM / Matroska (EBML): 1A 45 DF A3
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'audio/webm';

  return null;
}

// Infers the MIME type from a URL's file extension, or null when unrecognized. Extension-based; use
// detectAudioMimeType when the bytes are in hand.
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
