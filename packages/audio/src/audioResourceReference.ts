import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AudioResource,
  AudioResourceFailure,
  AudioResourceFetch,
  AudioResourceReference,
  AudioResourceReferenceResolutionExplanation,
  EmbeddedAudioResourceReference,
  EntityConstruction,
  ExternalAudioResourceReference,
} from '@flighthq/types/contract';
import {
  AudioResourceFailureKind,
  AudioResourceReferenceKind,
  ResourceResolutionState,
} from '@flighthq/types/contract';

import { getAudioDecoder } from './audioDecoderRegistry';
import { createAudioResource } from './audioResource';
import { loadAudioResourceFromBytes } from './audioResourceFrom';

// Reduces a thrown value to the serialization-safe categories a reference retains. Raw Error objects and
// arbitrary thrown values stay inside the resolving operation; diagnostics get category, name, and message.
export function createAudioResourceFailure(cause: unknown): AudioResourceFailure {
  if (cause instanceof Error) {
    const out = allocateEntity<AudioResourceFailure>();
    out.kind = AudioResourceFailureKind.Error;
    out.message = cause.message;
    out.name = cause.name;
    return finishEntity(out);
  }
  const out = allocateEntity<AudioResourceFailure>();
  out.kind = AudioResourceFailureKind.Error;
  out.message = String(cause);
  out.name = null;
  return finishEntity(out);
}

export function createEmbeddedAudioResourceReference(
  bytes: Uint8Array,
  mimeType: string | null = null,
  name: string | null = null,
): EmbeddedAudioResourceReference {
  const out = allocateEntity<EmbeddedAudioResourceReference>();
  initializeEmbeddedAudioResourceReference(out, bytes, mimeType, name);
  return finishEntity(out);
}

export function createExternalAudioResourceReference(
  uri: string,
  basePath: string | null = null,
  mimeType: string | null = null,
  name: string | null = null,
): ExternalAudioResourceReference {
  const out = allocateEntity<ExternalAudioResourceReference>();
  initializeExternalAudioResourceReference(out, uri, basePath, mimeType, name);
  return finishEntity(out);
}

// Returns a detached plain-data explanation suitable for logs, tools, and serialization. It never throws
// and exposes no resolver runtime or raw thrown value.
export function explainAudioResourceReferenceResolution(
  ref: Readonly<AudioResourceReference>,
): AudioResourceReferenceResolutionExplanation {
  return {
    failure: ref.failure === null ? null : { ...ref.failure },
    kind: ref.kind,
    retryable: ref.state === ResourceResolutionState.Failed,
    state: ref.state,
  };
}

// Returns the reference a caller asked for by authoring-time name, or null when the document carried no
// such sound. This is the only handle on a sound no timeline cues — a library sound published for code to
// start — so a miss is an ordinary outcome rather than an error.
export function findAudioResourceReferenceByName(
  references: readonly Readonly<AudioResourceReference>[],
  name: string,
): Readonly<AudioResourceReference> | null {
  for (let i = 0; i < references.length; i++) {
    if (references[i].name === name) return references[i];
  }
  return null;
}

// `bytes` is retained as the view the container handed over, not a copy: a parser carves a sound payload
// out of its source and the reference borrows it, so a document that never resolves a sound never pays for
// its samples. The `resource` is allocated here rather than by the caller, because a trigger has to have
// something to bind to before anything decodes.
export function initializeEmbeddedAudioResourceReference(
  out: EntityConstruction<EmbeddedAudioResourceReference>,
  bytes: Uint8Array,
  mimeType: string | null = null,
  name: string | null = null,
): void {
  out.bytes = bytes;
  out.failure = null;
  out.kind = AudioResourceReferenceKind.Embedded;
  out.mimeType = mimeType;
  out.name = name;
  out.resource = createAudioResource();
  out.state = ResourceResolutionState.Unresolved;
}

export function initializeExternalAudioResourceReference(
  out: EntityConstruction<ExternalAudioResourceReference>,
  uri: string,
  basePath: string | null = null,
  mimeType: string | null = null,
  name: string | null = null,
): void {
  out.basePath = basePath;
  out.failure = null;
  out.kind = AudioResourceReferenceKind.External;
  out.mimeType = mimeType;
  out.name = name;
  out.resource = createAudioResource();
  out.state = ResourceResolutionState.Unresolved;
  out.uri = uri;
}

// Returns a failed reference to the requestable state. Loading/resolved/unresolved references are unchanged
// so this atom cannot invalidate live work or a successfully bound resource accidentally.
export function resetFailedAudioResourceReference(ref: AudioResourceReference): boolean {
  if (ref.state !== ResourceResolutionState.Failed) return false;
  ref.failure = null;
  ref.state = ResourceResolutionState.Unresolved;
  return true;
}

// Advances one reference through its lifecycle and binds the decoded samples into the resource the
// reference already handed out, returning it or null for an expected failure. An abort is a cancel rather
// than a failure, so the reference reverts to Unresolved and the rejection propagates.
//
// Embedded bytes take a registered decoder when the MIME type has one and the platform decoder otherwise,
// in that order: a format the browser cannot parse is exactly what a registration is for, and a format it
// can parse needs no registration. `context` may be null when every reference in play resolves through a
// registered decoder or the fetch seam, which is what lets a non-web host avoid constructing one at all.
export async function resolveAudioResourceReference(
  ref: AudioResourceReference,
  context: AudioContext | null,
  fetch: AudioResourceFetch,
  signal: AbortSignal,
): Promise<AudioResource | null> {
  ref.failure = null;
  ref.state = ResourceResolutionState.Loading;
  try {
    const decoded =
      ref.kind === AudioResourceReferenceKind.Embedded
        ? await decodeAudioResourceBytes(ref, context, signal)
        : await fetch(ref, signal);
    if (decoded === null || decoded.buffer === null) {
      ref.failure = (() => {
        const out = allocateEntity<AudioResourceFailure>();
        out.kind = AudioResourceFailureKind.Unavailable;
        out.message = 'Audio resource unavailable';
        out.name = null;
        return finishEntity(out);
      })();
      ref.state = ResourceResolutionState.Failed;
      return null;
    }
    // The resource every cue already holds is the one that gains the samples, so a sound cued from forty
    // frames costs one decode and all forty are live at once.
    ref.resource.buffer = decoded.buffer;
    ref.state = ResourceResolutionState.Resolved;
    return ref.resource;
  } catch (cause) {
    if (signal.aborted) {
      ref.state = ResourceResolutionState.Unresolved;
      throw cause;
    }
    ref.failure = createAudioResourceFailure(cause);
    ref.state = ResourceResolutionState.Failed;
    return null;
  }
}

async function decodeAudioResourceBytes(
  ref: Readonly<EmbeddedAudioResourceReference>,
  context: AudioContext | null,
  signal: AbortSignal,
): Promise<AudioResource | null> {
  const decoder = ref.mimeType === null ? null : getAudioDecoder(ref.mimeType);
  if (decoder !== null) return decoder(ref.bytes, ref.mimeType as string, signal);
  if (context === null) return null;
  return loadAudioResourceFromBytes(context, ref.bytes, ref.mimeType ?? undefined, signal);
}
