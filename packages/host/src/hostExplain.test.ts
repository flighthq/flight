import type { EntityWithoutRuntime, Host } from '@flighthq/types/contract';

import { createHost } from './host';
import {
  explainHost,
  explainHostAudioDevice,
  explainHostAudioMixer,
  explainHostImage,
  explainHostInputIngress,
  explainHostTextSegmenter,
  explainHostTextShaper,
  explainHostVideo,
} from './hostExplain';
import * as hostQuery from './hostQuery';

describe('explainHost', () => {
  it('enumerates every capability group the host object carries', () => {
    const explanation = explainHost(createHost());

    expect(explanation.groups.map((group) => group.group)).toEqual(HOST_GROUPS);
  });

  it('lists the slot keys a populated group actually holds', () => {
    const host = hostWith({ media: { audioDevice: PROVIDER, video: PROVIDER } });
    const media = explainHost(host).groups.find((group) => group.group === 'media');

    expect(media?.slots.slice().sort()).toEqual(['audioDevice', 'video']);
    expect(media?.isProvider).toBe(false);
  });

  it('marks host.window as a provider rather than reporting its operations as slots', () => {
    const host = hostWith({ window: { getWindowSize: () => undefined } });
    const window = explainHost(host).groups.find((group) => group.group === 'window');

    expect(window?.isProvider).toBe(true);
    expect(window?.slots).toEqual([]);
  });

  it('reports every covered provider as absent on an empty host', () => {
    const providers = explainHost(createHost()).providers;

    expect(providers.length).toBeGreaterThan(0);
    expect(providers.every((provider) => !provider.isPresent)).toBe(true);
    expect(providers.map((provider) => `${provider.group}.${provider.slot}`)).toContain('media.video');
  });

  it('flips a covered provider to present when its slot is filled', () => {
    const host = hostWith({ media: { video: PROVIDER } });
    const video = explainHost(host).providers.find((provider) => provider.slot === 'video');

    expect(video?.isPresent).toBe(true);
    expect(video?.provider).toBe('HostVideoProvider');
  });

  it('covers exactly the slots hostQuery exposes accessors for, in both directions', () => {
    const censused = explainHost(createHost())
      .providers.map((provider) => `get${provider.provider.slice(0, -'Provider'.length)}`)
      .sort();
    const exported = Object.keys(hostQuery)
      .filter((name) => name.startsWith('getHost'))
      .sort();

    expect(censused).toEqual(exported);
  });

  it('keeps every per-provider explainer naming the backends it returns as data', () => {
    for (const explain of EXPLAINERS) {
      const explanation = explain(createHost());
      expect(explanation.backends.length, explanation.provider).toBeGreaterThan(0);
      for (const backend of explanation.backends) {
        expect(explanation.message, explanation.provider).toContain(backend.entryPoint);
        expect(explanation.message, explanation.provider).toContain(backend.packageName);
      }
    }
  });

  it('pairs every getHost accessor with a hasHost accessor', () => {
    const getters = Object.keys(hostQuery)
      .filter((name) => name.startsWith('getHost'))
      .sort();
    const predicates = Object.keys(hostQuery)
      .filter((name) => name.startsWith('hasHost'))
      .sort();

    expect(predicates).toEqual(getters.map((name) => `has${name.slice('get'.length)}`));
  });
});

describe('explainHostAudioDevice', () => {
  it('names the accessor, the slot, and where to get the provider when it is absent', () => {
    const explanation = explainHostAudioDevice(createHost());

    expect(explanation.isPresent).toBe(false);
    expect(explanation.group).toBe('media');
    expect(explanation.slot).toBe('audioDevice');
    expect(explanation.provider).toBe('HostAudioDeviceProvider');
    expect(explanation.message).toContain('getHostAudioDevice');
    expect(explanation.backends.map((backend) => backend.packageName)).toEqual(['@flighthq/host-web']);
  });

  it('reports presence without a remedy when the slot is filled', () => {
    const explanation = explainHostAudioDevice(hostWith({ media: { audioDevice: PROVIDER } }));

    expect(explanation.isPresent).toBe(true);
    expect(explanation.message).toBe('getHostAudioDevice: host.media.audioDevice is present');
  });
});

describe('explainHostAudioMixer', () => {
  it('explains an absent mixer against the media group', () => {
    const explanation = explainHostAudioMixer(createHost());

    expect(explanation.slot).toBe('audioMixer');
    expect(explanation.isPresent).toBe(false);
    expect(explanation.backends.length).toBeGreaterThan(0);
  });
});

describe('explainHostImage', () => {
  it('explains an absent image provider against the graphics group', () => {
    const explanation = explainHostImage(createHost());

    expect(explanation.group).toBe('graphics');
    expect(explanation.provider).toBe('HostImageProvider');
    expect(explanation.isPresent).toBe(false);
  });
});

describe('explainHostInputIngress', () => {
  it('explains an absent ingress provider against the input group', () => {
    const explanation = explainHostInputIngress(createHost());

    expect(explanation.group).toBe('input');
    expect(explanation.slot).toBe('ingress');
    expect(explanation.isPresent).toBe(false);
  });
});

describe('explainHostTextSegmenter', () => {
  it('points at the package that builds a segmenter rather than at a host backend', () => {
    const explanation = explainHostTextSegmenter(createHost());

    expect(explanation.backends.map((backend) => backend.packageName)).toEqual(['@flighthq/textsegment']);
    expect(explanation.message).toContain('createWebTextSegmenterBackend');
  });
});

describe('explainHostTextShaper', () => {
  it('points at the package that builds a shaper rather than at a host backend', () => {
    const explanation = explainHostTextShaper(createHost());

    expect(explanation.backends.map((backend) => backend.packageName)).toEqual(['@flighthq/textshaper-canvas']);
    expect(explanation.message).toContain('createCanvasTextShaperBackend');
  });

  it('reports presence when the shaper is composed into the text group', () => {
    const explanation = explainHostTextShaper(hostWith({ text: { shaper: PROVIDER } }));

    expect(explanation.isPresent).toBe(true);
  });
});

describe('explainHostVideo', () => {
  it('explains an absent video provider against the media group', () => {
    const explanation = explainHostVideo(createHost());

    expect(explanation.group).toBe('media');
    expect(explanation.provider).toBe('HostVideoProvider');
    expect(explanation.isPresent).toBe(false);
  });
});

const PROVIDER = {};

function hostWith(groups: Readonly<Record<string, Readonly<Record<string, unknown>>>>): Host {
  // A capability literal built from plain stand-ins cannot satisfy createHost's generic, so the shape is
  // asserted. Identity, not structure, is what every assertion below reads.
  return createHost(groups as Partial<EntityWithoutRuntime<Host>>);
}

const EXPLAINERS = [
  explainHostAudioDevice,
  explainHostAudioMixer,
  explainHostImage,
  explainHostInputIngress,
  explainHostTextSegmenter,
  explainHostTextShaper,
  explainHostVideo,
];

const HOST_GROUPS = [
  'accessibility',
  'app',
  'clipboard',
  'connectivity',
  'dialog',
  'graphics',
  'input',
  'ipc',
  'media',
  'menu',
  'midi',
  'net',
  'notification',
  'power',
  'protocol',
  'screen',
  'share',
  'shell',
  'shortcut',
  'storage',
  'system',
  'text',
  'tray',
  'ui',
  'updater',
  'window',
];
