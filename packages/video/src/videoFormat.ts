import type {
  BackendExplanation,
  BackendOperationExplanation,
  VideoCapabilityBackend,
  VideoCapabilityOperation,
  VideoResourceUrl,
} from '@flighthq/types/contract';

export function canPlayVideoType(mimeType: string): boolean {
  if (mimeType === '') return false;
  return probeSelectedBackend(getVideoCapabilityBackend(), mimeType);
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

export function explainVideoCapabilityBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function explainVideoCapabilityOperation(operation: VideoCapabilityOperation): BackendOperationExplanation {
  if (_custom !== null) {
    return typeof _custom[operation] === 'function'
      ? { implemented: true, layer: 'custom', operation }
      : { implemented: false, layer: 'none', operation };
  }
  if (_host !== null) {
    return typeof _host[operation] === 'function'
      ? { implemented: true, layer: 'host', operation }
      : { implemented: false, layer: 'none', operation };
  }
  return {
    implemented: false,
    layer: typeof _sentinel[operation] === 'function' ? 'sentinel' : 'none',
    operation,
  };
}

export function getVideoCapabilityBackend(): VideoCapabilityBackend {
  return _custom ?? _host ?? _sentinel;
}

export function hasVideoCapabilityHostBackend(): boolean {
  return _host !== null;
}

export function hasVideoCapabilityOperation(operation: VideoCapabilityOperation): boolean {
  return explainVideoCapabilityOperation(operation).implemented;
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

export function installVideoCapabilityHostBackend(backend: VideoCapabilityBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observeVideoCapabilityHostResult(operation: VideoCapabilityOperation, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetVideoCapabilityBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Picks the first source the environment can play, resolving each source's MIME type from its
// explicit `type` or, failing that, its URL extension. Returns null when none is playable — the
// source-negotiation primitive behind loadVideoResourceFromUrls.
export function selectVideoResourceUrl(sources: Readonly<VideoResourceUrl[]>): VideoResourceUrl | null {
  let backend: VideoCapabilityBackend | null = null;
  for (const source of sources) {
    const mimeType = source.type ?? inferVideoMimeType(source.url) ?? '';
    if (mimeType === '') continue;
    backend ??= getVideoCapabilityBackend();
    if (probeSelectedBackend(backend, mimeType)) return source;
  }
  return null;
}

export function setVideoCapabilityBackend(backend: VideoCapabilityBackend | null): void {
  _custom = backend;
}

function probeSelectedBackend(backend: VideoCapabilityBackend, mimeType: string): boolean {
  if (mimeType === '') return false;
  try {
    return backend.canPlayType(mimeType) === true;
  } catch {
    return false;
  }
}

const _sentinel: VideoCapabilityBackend = {
  canPlayType(): boolean {
    return false;
  },
  createVideoElement() {
    return null;
  },
};

let _custom: VideoCapabilityBackend | null = null;
let _host: VideoCapabilityBackend | null = null;
let _hostConflict = false;
let _hostObservation: {
  operation: VideoCapabilityOperation;
  viability: 'available' | 'runtime-api-unavailable';
} | null = null;
