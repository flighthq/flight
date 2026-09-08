import type { ParticleFormatKind } from '@flighthq/types/contract';

import { detectRegisteredParticleFormat } from './formatRegistry';

/** Sniff the text content of a particle file and return the format kind, or `null`
 *  when no supported format is recognisable.
 *
 *  Detection is provided solely by codecs installed in the format registry.
 *  Call `registerBuiltInParticleFormats` before parsing built-in formats.
 *  Returns `null` for unknown input — never throws. */
export function detectParticleFormat(text: string): ParticleFormatKind | null {
  if (typeof text !== 'string') return null;
  return detectRegisteredParticleFormat(text) as ParticleFormatKind | null;
}
