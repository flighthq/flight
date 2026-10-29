import type { LogState } from '@flighthq/log/contract';
import { logOnce } from '@flighthq/log/contract';
import type { Host } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import {
  explainHostAudioDevice,
  explainHostAudioMixer,
  explainHostImage,
  explainHostInputIngress,
  explainHostTextSegmenter,
  explainHostTextShaper,
  explainHostVideo,
} from './hostExplain.ts';
import type { HostCapabilityExplanation } from './types.ts';

// Opt-in warnings for a host that is missing a capability Flight packages commonly need. Importing this
// module is what costs; a build that never diagnoses a host carries neither the sentences nor the
// @flighthq/log dependency.
//
// There is no seam to install and therefore no disableHostGuards or areHostGuardsEnabled: a host is a
// value built once and never mutated, so the moment of misuse is the moment it is handed over. Auditing
// it here is the earliest a warning can fire, and logOnce keys per slot, so calling this for two hosts
// missing the same capability warns once. Warnings go to the caller-owned `logState`, stamped with the
// caller's clock reading `nowMs` (the per-feature Rust host guards take the same three arguments).
export function enableHostGuards(logState: LogState, nowMs: number, host: Readonly<Host>): void {
  for (const explain of _GUARDED) {
    const explanation = explain(host);
    if (explanation.isPresent) continue;
    logOnce(
      logState,
      nowMs,
      `host:missing:${explanation.group}.${explanation.slot}`,
      LogLevel.Warn,
      {
        backends: explanation.backends.map((backend) => `${backend.entryPoint} (${backend.packageName})`),
        group: explanation.group,
        message: explanation.message,
        capability: explanation.capability,
        slot: explanation.slot,
      },
      'host',
    );
  }
}

// The guarded set IS the set of per-capability explainers, called rather than re-derived, so a warning and
// its explain* query cannot disagree about whether a slot is filled or about where to get it.
const _GUARDED: readonly ((host: Readonly<Host>) => HostCapabilityExplanation)[] = [
  explainHostAudioDevice,
  explainHostAudioMixer,
  explainHostImage,
  explainHostInputIngress,
  explainHostTextSegmenter,
  explainHostTextShaper,
  explainHostVideo,
];
