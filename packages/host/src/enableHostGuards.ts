import { logOnce } from '@flighthq/log/contract';
import type { Host, HostProviderExplanation } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import {
  explainHostAudioDevice,
  explainHostAudioMixer,
  explainHostImage,
  explainHostInputIngress,
  explainHostTextSegmenter,
  explainHostTextShaper,
  explainHostVideo,
} from './hostExplain';

// Opt-in warnings for a host that is missing a provider Flight packages commonly need. Importing this
// module is what costs; a build that never diagnoses a host carries neither the sentences nor the
// @flighthq/log dependency.
//
// There is no seam to install and therefore no disableHostGuards or areHostGuardsEnabled: a host is a
// value built once and never mutated, so the moment of misuse is the moment it is handed over. Auditing
// it here is the earliest a warning can fire, and logOnce keys per slot, so calling this for two hosts
// missing the same provider warns once.
export function enableHostGuards(host: Readonly<Host>): void {
  for (const explain of _GUARDED) {
    const explanation = explain(host);
    if (explanation.isPresent) continue;
    logOnce(
      `host:missing:${explanation.group}.${explanation.slot}`,
      LogLevel.Warn,
      {
        backends: explanation.backends.map((backend) => `${backend.entryPoint} (${backend.packageName})`),
        group: explanation.group,
        message: explanation.message,
        provider: explanation.provider,
        slot: explanation.slot,
      },
      'host',
    );
  }
}

// The guarded set IS the set of per-provider explainers, called rather than re-derived, so a warning and
// its explain* query cannot disagree about whether a slot is filled or about where to get it.
const _GUARDED: readonly ((host: Readonly<Host>) => HostProviderExplanation)[] = [
  explainHostAudioDevice,
  explainHostAudioMixer,
  explainHostImage,
  explainHostInputIngress,
  explainHostTextSegmenter,
  explainHostTextShaper,
  explainHostVideo,
];
