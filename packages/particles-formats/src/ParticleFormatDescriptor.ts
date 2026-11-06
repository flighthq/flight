import type { ParticleFormatCodec } from './ParticleFormatCodec.ts';
import type { ParticleFormatKind } from './ParticleFormatKind.ts';

/**
 * One particle format as a single value: the kind it registers under and the codec that reads it.
 *
 * ★ A STABLE IDENTITY FOR ONE FORMAT, WHICH THE REGISTRY ALONE DOES NOT PROVIDE. The registry is keyed by kind
 * and its built-in codecs were private, so nothing outside the package could NAME one format — a catalog row
 * had nothing to point at, and a caller could not say "install these four" without re-writing the codecs. A
 * descriptor is that missing name, and pairing the kind with the codec is what makes an ordered list of them
 * sufficient on its own: detection order is list order, and the kind travels with the codec rather than being
 * restated beside it.
 */
export interface ParticleFormatDescriptor {
  readonly codec: ParticleFormatCodec;
  readonly kind: ParticleFormatKind;
}

/**
 * Which particle formats an import installs, in the order they are consulted.
 *
 * ★ ORDER IS THE DETECTION CONTRACT. The registry returns the FIRST format whose codec recognises the text, and
 * the built-in codecs genuinely overlap — a ParticleDesigner plist and a Starling PEX are both XML; Unity, Pixi
 * and Spine all read JSON objects and key off value shapes rather than a marker. So a caller reordering this
 * list is describing a different parse, not the same one rearranged, and a caller naming a subset is choosing
 * which formats their build can read at all.
 *
 * ★ PLAIN DATA A CALLER STATES, NOT SOMETHING A BUILD GENERATES. An earlier version of this comment promised a
 * generated manifest module would name the one format a document needs. It cannot: installing any subset goes
 * through the applier, the applier reaches the registry initializer, and the initializer seeds the FULL preset — so
 * a build that named one format linked every sibling codec anyway. Measured on a real production bundle, the
 * one-format route cost the same as the all-formats route. A caller who wants one codec imports that codec
 * directly; this list is for a caller who wants the registry and accepts its cost knowingly.
 * Applying it is a separate explicit step — nothing is registered by importing anything.
 *
 * Omitting `formats` installs nothing. The full preset is `particleAllFormats`, which reproduces what
 * `registerBuiltInParticleFormats` installs, in the same order.
 */
export interface ParticleImportOptions {
  readonly formats?: readonly Readonly<ParticleFormatDescriptor>[];
}
