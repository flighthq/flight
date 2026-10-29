// Generated from crates/flight-host/tests/host_explanation_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { explainHostCapabilitySlot } from './contract.ts';
import type { HostCapabilityBackend } from './contract.ts';

function webHost(): HostCapabilityBackend {
  return { entryPoint: 'webHost', packageName: '@flighthq/host-web', platform: 'Web' };
}

describe('explainHostCapabilitySlot', () => {
  it('names the accessor the slot the consequence and the fix when absent', () => {
    const explanation = explainHostCapabilitySlot(
      'HostVideoCapability',
      'video',
      'playback',
      false,
      'nothing can decode or present video',
      'build the host from webHost in @flighthq/host-web',
      [webHost()],
    );
    expect(explanation.message).toEqual(
      'getHostVideo: host.video.playback is absent, so nothing can decode or present video — build the host from webHost in @flighthq/host-web',
    );
    expect(explanation.capability).toEqual('HostVideoCapability');
    expect(explanation.group).toEqual('video');
    expect(explanation.slot).toEqual('playback');
    expect(!explanation.isPresent).toBe(true);
    expect(explanation.backends).toEqual([webHost()]);
  });
  it('reports presence and still carries the backends as data', () => {
    const explanation = explainHostCapabilitySlot(
      'HostAudioDeviceCapability',
      'audio',
      'device',
      true,
      'no audio can be decoded or played',
      'build the host from webHost in @flighthq/host-web',
      [webHost()],
    );
    expect(explanation.isPresent).toBe(true);
    expect(explanation.message).toEqual('getHostAudioDevice: host.audio.device is present');
    expect(explanation.backends.length).toEqual(1);
  });
});
