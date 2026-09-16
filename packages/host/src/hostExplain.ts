import type {
  Host,
  HostCapabilityGroupExplanation,
  HostExplanation,
  HostProviderBackend,
  HostProviderCoverage,
  HostProviderExplanation,
} from '@flighthq/types/contract';

// Pull queries over a Host: what it provides, what it does not, and — for the slots whose absence is a
// common and confusing failure — where to get the missing capability. Plain data, no logging; the active
// counterpart is enableHostGuards, which reads these same tables so a warning cannot contradict a query.
//
// COVERAGE is the same subset hostQuery.ts exposes accessors for: a capability slot earns a row when a
// Flight package takes that capability as a function parameter. It is not every optional slot on every
// group, so a slot outside it is reported neither present nor missing — explainHost's `groups` is the
// half that sees everything, because it enumerates the host object rather than a table.
//
// The maintenance seam: adding a getHost*/hasHost* pair without adding its COVERAGE row leaves the new
// slot invisible to explainHost and to the guards. hostExplain.test.ts fails when the two disagree.

// Reports what a host provides. `groups` is enumerated from the host object at call time and covers every
// capability group it carries; `providers` is the covered-slot census, present and missing alike.
//
// Every group is a struct of optional capability slots — there is no group position holding a capability
// directly, so every enumerated group reports its filled slot names and none reports its methods.
export function explainHost(host: Readonly<Host>): HostExplanation {
  const groups: HostCapabilityGroupExplanation[] = [];
  for (const [group, value] of Object.entries(host)) {
    if (typeof value !== 'object' || value === null) continue;
    const slots = Object.entries(value as Record<string, unknown>)
      .filter((entry) => entry[1] !== undefined && entry[1] !== null)
      .map((entry) => entry[0]);
    groups.push({ group, slots });
  }
  const providers: HostProviderCoverage[] = _COVERAGE.map((entry) => ({
    group: entry.group,
    isPresent: _isSlotPresent(host, entry.group, entry.slot),
    provider: entry.provider,
    slot: entry.slot,
  }));
  return { groups, providers };
}

// Why getHostAudioDevice returned null, and which package supplies the capability it wanted.
export function explainHostAudioDevice(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'audio', 'device');
}

export function explainHostAudioMixer(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'audio', 'mixer');
}

export function explainHostImage(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'image', 'loader');
}

export function explainHostInputIngress(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'input', 'ingress');
}

export function explainHostTextSegmenter(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'textSegment', 'segmenter');
}

export function explainHostTextShaper(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'textShaper', 'shaper');
}

export function explainHostVideo(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'video', 'playback');
}

function _isSlotPresent(host: Readonly<Host>, group: string, slot: string): boolean {
  const capabilities = (host as unknown as Record<string, unknown>)[group];
  if (typeof capabilities !== 'object' || capabilities === null) return false;
  return (capabilities as Record<string, unknown>)[slot] != null;
}

// The explanation the guard layer emits and the explainers return, built once so both say the same thing.
function _explainSlot(host: Readonly<Host>, group: string, slot: string): HostProviderExplanation {
  const coverage = _COVERAGE.find((entry) => entry.group === group && entry.slot === slot);
  const remedy = _REMEDIES[`${group}.${slot}`];
  const isPresent = _isSlotPresent(host, group, slot);
  const provider = coverage?.provider ?? '';
  const accessor = `get${provider.slice(0, -'Capability'.length)}`;
  const message = isPresent
    ? `${accessor}: host.${group}.${slot} is present`
    : `${accessor}: host.${group}.${slot} is absent, so ${remedy?.consequence ?? 'the capability is unavailable'} — ${remedy?.fix ?? 'build the host from a @flighthq/host-* package that provides it'}`;
  return {
    backends: remedy?.backends ?? [],
    group,
    isPresent,
    message,
    provider,
    slot,
  };
}

const _COVERAGE: readonly { readonly group: string; readonly provider: string; readonly slot: string }[] = [
  { group: 'audio', provider: 'HostAudioDeviceCapability', slot: 'device' },
  { group: 'audio', provider: 'HostAudioMixerCapability', slot: 'mixer' },
  { group: 'bitmap', provider: 'HostBitmapEncodeCapability', slot: 'encode' },
  { group: 'bitmap', provider: 'HostBitmapReadbackCapability', slot: 'readback' },
  { group: 'clipboard', provider: 'HostClipboardFormatsCapability', slot: 'formats' },
  { group: 'device', provider: 'HostDeviceCapability', slot: 'info' },
  { group: 'fileSystem', provider: 'HostFileSystemCapability', slot: 'access' },
  { group: 'font', provider: 'HostFontLoadingCapability', slot: 'loader' },
  { group: 'geolocation', provider: 'HostGeolocationCapability', slot: 'position' },
  { group: 'glyph', provider: 'HostGlyphRasterizerCapability', slot: 'rasterizer' },
  { group: 'haptics', provider: 'HostHapticsCapability', slot: 'engine' },
  { group: 'image', provider: 'HostImageCapability', slot: 'loader' },
  { group: 'input', provider: 'HostInputIngressCapability', slot: 'ingress' },
  { group: 'lifecycle', provider: 'HostLifecycleCapability', slot: 'state' },
  { group: 'net', provider: 'HostNetCapability', slot: 'http' },
  { group: 'net', provider: 'HostSocketCapability', slot: 'socket' },
  { group: 'notification', provider: 'HostNotificationPermissionCapability', slot: 'permission' },
  { group: 'platform', provider: 'HostPlatformCapability', slot: 'info' },
  { group: 'power', provider: 'HostPowerKeepAwakeCapability', slot: 'keepAwake' },
  { group: 'preferences', provider: 'HostPreferencesCapability', slot: 'local' },
  { group: 'preferences', provider: 'HostStoragePersistenceQueryCapability', slot: 'persistenceQuery' },
  { group: 'screen', provider: 'HostScreenQueryCapability', slot: 'query' },
  { group: 'sensors', provider: 'HostSensorsCapability', slot: 'query' },
  { group: 'softKeyboard', provider: 'HostSoftKeyboardInfoCapability', slot: 'info' },
  { group: 'textSegment', provider: 'HostTextSegmenterCapability', slot: 'segmenter' },
  { group: 'textShaper', provider: 'HostTextShaperCapability', slot: 'shaper' },
  { group: 'video', provider: 'HostVideoCapability', slot: 'playback' },
  { group: 'wgpu', provider: 'HostWgpuCapability', slot: 'context' },
];

const _WEB_HOST: HostProviderBackend = {
  entryPoint: 'webHost',
  packageName: '@flighthq/host-web',
  platform: 'Web',
};

// Only the slots whose absence is a common, confusing failure carry prose and a source. Each `fix` names
// every `entryPoint` in `backends` — hostExplain.test.ts asserts that, so the sentence and the structured
// data cannot drift apart.
const _REMEDIES: Readonly<
  Record<
    string,
    { readonly backends: readonly HostProviderBackend[]; readonly consequence: string; readonly fix: string }
  >
> = {
  'audio.device': {
    backends: [_WEB_HOST],
    consequence: 'no audio can be decoded or played',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
  'audio.mixer': {
    backends: [_WEB_HOST],
    consequence: 'sound transforms and mixer routing are inert',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
  'image.loader': {
    backends: [_WEB_HOST],
    consequence: 'nothing can decode an image or read its dimensions',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
  'input.ingress': {
    backends: [_WEB_HOST],
    consequence: 'no pointer, key, or wheel event reaches the input manager',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
  'textSegment.segmenter': {
    backends: [{ entryPoint: 'createWebTextSegmenterBackend', packageName: '@flighthq/textsegment', platform: 'Web' }],
    consequence: 'grapheme, word, and sentence breaking fall back to code-unit boundaries',
    fix: "pass createWebTextSegmenterBackend() from @flighthq/textsegment into createHost's textSegment group",
  },
  'textShaper.shaper': {
    backends: [
      {
        entryPoint: 'createCanvasTextShaperBackend',
        packageName: '@flighthq/textshaper-canvas',
        platform: 'Canvas 2D',
      },
    ],
    consequence: 'text cannot be measured or shaped and lays out at zero width',
    fix: "pass createCanvasTextShaperBackend() from @flighthq/textshaper-canvas into createHost's textShaper group",
  },
  'video.playback': {
    backends: [_WEB_HOST],
    consequence: 'nothing can decode or present video',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
};
