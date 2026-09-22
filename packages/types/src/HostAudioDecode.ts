/**
 * One standard audio container the platform can turn into samples.
 *
 * `decode` returns null for an expected failure — a payload this codec cannot read — rather than
 * throwing, so a caller distinguishes "this host has no decoder" (an absent slot) from "this host has
 * one and the bytes are not that format" (a null result).
 *
 * The `signal` is threaded because a platform decode is asynchronous and usually uncancellable once
 * begun: an implementation that cannot abort mid-decode must still suppress its result afterwards, so a
 * load the caller walked away from never lands on a resource nobody is waiting for.
 */
export interface HostAudioDecodeFormatCapability {
  decode(bytes: Readonly<Uint8Array>, signal: AbortSignal): Promise<AudioBuffer | null>;
}

/**
 * The standard audio containers a host can decode, one named slot each.
 *
 * Named slots rather than a MIME-keyed map, because these seven are what a platform either has or does
 * not have: the set is closed, a caller reads their build off the declaration, and a slot nobody filled
 * is a missing capability rather than a string that silently matches nothing. Formats outside this set —
 * a SWF ADPCM or Nellymoser payload, anything a container invents — are not a host concern at all; they
 * reach the decoder through a registry the caller owns and passes explicitly.
 */
export interface HostAudioDecodeCapabilities {
  readonly aac?: HostAudioDecodeFormatCapability;
  readonly flac?: HostAudioDecodeFormatCapability;
  readonly mp3?: HostAudioDecodeFormatCapability;
  readonly mp4?: HostAudioDecodeFormatCapability;
  readonly ogg?: HostAudioDecodeFormatCapability;
  readonly wav?: HostAudioDecodeFormatCapability;
  readonly webm?: HostAudioDecodeFormatCapability;
}
