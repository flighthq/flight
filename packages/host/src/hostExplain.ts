import type {
  Host,
  HostCapabilityGroupExplanation,
  HostExplanation,
  HostCapabilityBackend,
  HostCapabilityCoverage,
  HostCapabilityExplanation,
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
// capability group it carries; `capabilities` is the covered-slot census, present and missing alike.
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
  const capabilities: HostCapabilityCoverage[] = _COVERAGE.map((entry) => ({
    capability: entry.capability,
    group: entry.group,
    isPresent: _isSlotPresent(host, entry.group, entry.slot),
    slot: entry.slot,
  }));
  return { capabilities, groups };
}

// Why getHostAudioDevice returned null, and which package supplies the capability it wanted.
export function explainHostAudioDevice(host: Readonly<Host>): HostCapabilityExplanation {
  return _explainSlot(host, 'audio', 'device');
}

export function explainHostAudioMixer(host: Readonly<Host>): HostCapabilityExplanation {
  return _explainSlot(host, 'audio', 'mixer');
}

export function explainHostImage(host: Readonly<Host>): HostCapabilityExplanation {
  return _explainSlot(host, 'image', 'loader');
}

export function explainHostInputIngress(host: Readonly<Host>): HostCapabilityExplanation {
  return _explainSlot(host, 'input', 'ingress');
}

export function explainHostTextSegmenter(host: Readonly<Host>): HostCapabilityExplanation {
  return _explainSlot(host, 'textSegment', 'segmenter');
}

export function explainHostTextShaper(host: Readonly<Host>): HostCapabilityExplanation {
  return _explainSlot(host, 'textShaper', 'shaper');
}

export function explainHostVideo(host: Readonly<Host>): HostCapabilityExplanation {
  return _explainSlot(host, 'video', 'playback');
}

function _isSlotPresent(host: Readonly<Host>, group: string, slot: string): boolean {
  const capabilities = (host as unknown as Record<string, unknown>)[group];
  if (typeof capabilities !== 'object' || capabilities === null) return false;
  return (capabilities as Record<string, unknown>)[slot] != null;
}

// The explanation the guard layer emits and the explainers return, built once so both say the same thing.
function _explainSlot(host: Readonly<Host>, group: string, slot: string): HostCapabilityExplanation {
  const coverage = _COVERAGE.find((entry) => entry.group === group && entry.slot === slot);
  const remedy = _REMEDIES[`${group}.${slot}`];
  const isPresent = _isSlotPresent(host, group, slot);
  const capability = coverage?.capability ?? '';
  const accessor = `get${capability.slice(0, -'Capability'.length)}`;
  const message = isPresent
    ? `${accessor}: host.${group}.${slot} is present`
    : `${accessor}: host.${group}.${slot} is absent, so ${remedy?.consequence ?? 'the capability is unavailable'} — ${remedy?.fix ?? 'build the host from a @flighthq/host-* package that provides it'}`;
  return {
    backends: remedy?.backends ?? [],
    capability,
    group,
    isPresent,
    message,
    slot,
  };
}

const _COVERAGE: readonly { readonly capability: string; readonly group: string; readonly slot: string }[] = [
  { capability: 'HostAudioDeviceCapability', group: 'audio', slot: 'device' },
  { capability: 'HostAudioMixerCapability', group: 'audio', slot: 'mixer' },
  { capability: 'HostBitmapEncodeCapability', group: 'bitmap', slot: 'encode' },
  { capability: 'HostBitmapReadbackCapability', group: 'bitmap', slot: 'readback' },
  { capability: 'HostClipboardFormatsCapability', group: 'clipboard', slot: 'formats' },
  { capability: 'HostDeviceCapability', group: 'device', slot: 'info' },
  { capability: 'HostFileSystemCapability', group: 'fileSystem', slot: 'access' },
  { capability: 'HostFontLoadingCapability', group: 'font', slot: 'loader' },
  { capability: 'HostGeolocationCapability', group: 'geolocation', slot: 'position' },
  { capability: 'HostGlyphRasterizerCapability', group: 'glyph', slot: 'rasterizer' },
  { capability: 'HostHapticsCapability', group: 'haptics', slot: 'engine' },
  { capability: 'HostImageCapability', group: 'image', slot: 'loader' },
  { capability: 'HostInputIngressCapability', group: 'input', slot: 'ingress' },
  { capability: 'HostLifecycleCapability', group: 'lifecycle', slot: 'state' },
  { capability: 'HostNetCapability', group: 'net', slot: 'http' },
  { capability: 'HostNotificationPermissionCapability', group: 'notification', slot: 'permission' },
  { capability: 'HostPlatformCapability', group: 'platform', slot: 'info' },
  { capability: 'HostPowerKeepAwakeCapability', group: 'power', slot: 'keepAwake' },
  { capability: 'HostPreferencesCapability', group: 'preferences', slot: 'local' },
  { capability: 'HostPreferencesPersistenceQueryCapability', group: 'preferences', slot: 'persistenceQuery' },
  { capability: 'HostScreenQueryCapability', group: 'screen', slot: 'query' },
  { capability: 'HostSensorsCapability', group: 'sensors', slot: 'query' },
  { capability: 'HostSocketCapability', group: 'socket', slot: 'connection' },
  { capability: 'HostSoftKeyboardInfoCapability', group: 'softKeyboard', slot: 'info' },
  { capability: 'HostTextSegmenterCapability', group: 'textSegment', slot: 'segmenter' },
  { capability: 'HostTextShaperCapability', group: 'textShaper', slot: 'shaper' },
  { capability: 'HostVideoCapability', group: 'video', slot: 'playback' },
  { capability: 'HostWgpuCapability', group: 'wgpu', slot: 'context' },
];

const _WEB_HOST: HostCapabilityBackend = {
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
    { readonly backends: readonly HostCapabilityBackend[]; readonly consequence: string; readonly fix: string }
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
        entryPoint: 'webHostTextShaper',
        packageName: '@flighthq/host-web',
        platform: 'Canvas 2D',
      },
    ],
    consequence: 'text cannot be measured or shaped and lays out at zero width',
    fix: "pass webHostTextShaper from @flighthq/host-web into createHost's textShaper group",
  },
  'video.playback': {
    backends: [_WEB_HOST],
    consequence: 'nothing can decode or present video',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
};
