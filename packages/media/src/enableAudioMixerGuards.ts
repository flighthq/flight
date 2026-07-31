import { logOnce } from '@flighthq/log/contract';
import type { AudioBus, AudioBusMixerOperation } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setAudioBusMixerGuard } from './audioMixer';

// Uninstalls the guard installed by enableAudioMixerGuards.
export function disableAudioMixerGuards(): void {
  setAudioBusMixerGuard(null);
}

// Installs the caller-facing audio-mixer guard (opt-in, dev-only). setAudioBusGain, setAudioBusMuted and
// setAudioBusPan all write the bus field, return it, and push the value to the gain/panner node of every
// mixer holding that bus — but a bus belonging to NO mixer has no node to push to. The write is stored,
// the setter returns the value it just set, and nothing becomes audible. Nothing throws and the return
// value cannot express the difference, because it reports what was set rather than whether anything is
// listening, so "my gain change did nothing" is otherwise a silent debugging session.
//
// The guard warns once per operation through @flighthq/log. Not importing this module costs production
// nothing: the message text and the @flighthq/log dependency live only here, and the reverse-map lookup
// that detects the case runs only while the guard is installed. Idempotent.
export function enableAudioMixerGuards(): void {
  setAudioBusMixerGuard(warnOnUnmixedBus);
}

function warnOnUnmixedBus(operation: AudioBusMixerOperation, bus: Readonly<AudioBus>): void {
  const setter =
    operation === 'gain' ? 'setAudioBusGain' : operation === 'mute' ? 'setAudioBusMuted' : 'setAudioBusPan';
  logOnce(
    `media:unmixed-bus-${operation}`,
    LogLevel.Warn,
    {
      message: `${setter}: bus "${bus.name ?? 'unnamed'}" belongs to no mixer, so the value was stored but reached no audio node and nothing changed audibly. Add the bus with addAudioBusToMixer(mixer, bus) — or route a channel through it with routeAudioChannelToMixerBus — before setting its properties.`,
    },
    'media',
  );
}
