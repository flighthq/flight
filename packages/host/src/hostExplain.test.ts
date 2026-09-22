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
    const host = hostWith({ audio: { codec: CAPABILITY, device: CAPABILITY } });
    const audio = explainHost(host).groups.find((group) => group.group === 'audio');

    expect(audio?.slots.slice().sort()).toEqual(['codec', 'device']);
  });

  it('reports host.window through its slots, because window is a group like every other', () => {
    const host = hostWith({ window: { geometry: CAPABILITY, lifecycle: CAPABILITY } });
    const window = explainHost(host).groups.find((group) => group.group === 'window');

    expect(window?.slots.slice().sort()).toEqual(['geometry', 'lifecycle']);
  });

  it('reports every covered capability as absent on an empty host', () => {
    const capabilities = explainHost(createHost()).capabilities;

    expect(capabilities.length).toBeGreaterThan(0);
    expect(capabilities.every((entry) => !entry.isPresent)).toBe(true);
    expect(capabilities.map((entry) => `${entry.group}.${entry.slot}`)).toContain('video.playback');
  });

  it('flips a covered capability to present when its slot is filled', () => {
    const host = hostWith({ video: { playback: CAPABILITY } });
    const video = explainHost(host).capabilities.find((entry) => entry.slot === 'playback');

    expect(video?.isPresent).toBe(true);
    expect(video?.capability).toBe('HostVideoCapability');
  });

  it('covers exactly the slots hostQuery exposes accessors for, in both directions', () => {
    const censused = explainHost(createHost())
      .capabilities.map((entry) => `get${entry.capability.slice(0, -'Capability'.length)}`)
      .sort();
    const exported = Object.keys(hostQuery)
      .filter((name) => name.startsWith('getHost'))
      .sort();

    expect(censused).toEqual(exported);
  });

  it('names, for every covered slot, the group and slot its own accessor reads', () => {
    // The census supplies the (group, slot) pair; the accessor is the independent reading of it. A row
    // that named the wrong group — `platform.info` where `device.info` was meant, which the flat
    // structure makes a live mistake — leaves its accessor returning null here.
    for (const coverage of explainHost(createHost()).capabilities) {
      const name = `get${coverage.capability.slice(0, -'Capability'.length)}`;
      const accessor = Reflect.get(hostQuery, name) as (host: Readonly<Host>) => unknown;
      const host = hostWith({ [coverage.group]: { [coverage.slot]: CAPABILITY } });

      expect(accessor, name).toBeTypeOf('function');
      expect(accessor(host), `${name} reads host.${coverage.group}.${coverage.slot}`).toBe(CAPABILITY);
    }
  });

  it('keeps every per-capability explainer naming the backends it returns as data', () => {
    for (const explain of EXPLAINERS) {
      const explanation = explain(createHost());
      expect(explanation.backends.length, explanation.capability).toBeGreaterThan(0);
      for (const backend of explanation.backends) {
        expect(explanation.message, explanation.capability).toContain(backend.entryPoint);
        expect(explanation.message, explanation.capability).toContain(backend.packageName);
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
  it('names the accessor, the slot, and where to get the capability when it is absent', () => {
    const explanation = explainHostAudioDevice(createHost());

    expect(explanation.isPresent).toBe(false);
    expect(explanation.group).toBe('audio');
    expect(explanation.slot).toBe('device');
    expect(explanation.capability).toBe('HostAudioDeviceCapability');
    expect(explanation.message).toContain('getHostAudioDevice');
    expect(explanation.backends.map((backend) => backend.packageName)).toEqual(['@flighthq/host-web']);
  });

  it('reports presence without a remedy when the slot is filled', () => {
    const explanation = explainHostAudioDevice(hostWith({ audio: { device: CAPABILITY } }));

    expect(explanation.isPresent).toBe(true);
    expect(explanation.message).toBe('getHostAudioDevice: host.audio.device is present');
  });
});

describe('explainHostAudioMixer', () => {
  it('explains an absent mixer against the audio group', () => {
    const explanation = explainHostAudioMixer(createHost());

    expect(explanation.group).toBe('audio');
    expect(explanation.slot).toBe('mixer');
    expect(explanation.isPresent).toBe(false);
    expect(explanation.backends.length).toBeGreaterThan(0);
  });
});

describe('explainHostImage', () => {
  it('explains an absent image loader against the image group', () => {
    const explanation = explainHostImage(createHost());

    expect(explanation.group).toBe('image');
    expect(explanation.slot).toBe('loader');
    expect(explanation.capability).toBe('HostImageCapability');
    expect(explanation.isPresent).toBe(false);
  });
});

describe('explainHostInputIngress', () => {
  it('explains an absent ingress capability against the input group', () => {
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
  it('points at the package that ships a shaper and the provider to pass', () => {
    const explanation = explainHostTextShaper(createHost());

    expect(explanation.backends.map((backend) => backend.packageName)).toEqual(['@flighthq/host-web']);
    expect(explanation.message).toContain('webHostTextShaper');
  });

  it('reports presence when the shaper is composed into the textShaper group', () => {
    const explanation = explainHostTextShaper(hostWith({ textShaper: { shaper: CAPABILITY } }));

    expect(explanation.isPresent).toBe(true);
  });
});

describe('explainHostVideo', () => {
  it('explains an absent video capability against the video group', () => {
    const explanation = explainHostVideo(createHost());

    expect(explanation.group).toBe('video');
    expect(explanation.slot).toBe('playback');
    expect(explanation.capability).toBe('HostVideoCapability');
    expect(explanation.isPresent).toBe(false);
  });
});

const CAPABILITY = {};

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
  'audio',
  'bitmap',
  'canvas',
  'clipboard',
  'connectivity',
  'decompress',
  'device',
  'dialog',
  'fileSystem',
  'font',
  'fullscreen',
  'geolocation',
  'gl',
  'glyph',
  'haptics',
  'image',
  'input',
  'ipc',
  'lifecycle',
  'mediaSession',
  'menu',
  'midi',
  'net',
  'notification',
  'permissions',
  'platform',
  'power',
  'preferences',
  'protocol',
  'screen',
  'sensors',
  'share',
  'shell',
  'shortcut',
  'socket',
  'softKeyboard',
  'statusBar',
  'surface',
  'textSegment',
  'textShaper',
  'tray',
  'updater',
  'video',
  'wgpu',
  'window',
];
