import type {
  Host,
  HostCapabilityGroupExplanation,
  HostExplanation,
  HostProviderBackend,
  HostProviderCoverage,
  HostProviderExplanation,
} from '@flighthq/types/contract';

// Pull queries over a Host: what it provides, what it does not, and — for the slots whose absence is a
// common and confusing failure — where to get the missing provider. Plain data, no logging; the active
// counterpart is enableHostGuards, which reads these same tables so a warning cannot contradict a query.
//
// COVERAGE is the same subset hostQuery.ts exposes accessors for: a provider slot earns a row when a
// Flight package takes that provider as a function parameter. It is not every optional slot on every
// group, so a slot outside it is reported neither present nor missing — explainHost's `groups` is the
// half that sees everything, because it enumerates the host object rather than a table.
//
// The maintenance seam: adding a getHost*/hasHost* pair without adding its COVERAGE row leaves the new
// slot invisible to explainHost and to the guards. hostExplain.test.ts fails when the two disagree.

// Reports what a host provides. `groups` is enumerated from the host object at call time and covers every
// capability group it carries; `providers` is the covered-slot census, present and missing alike.
export function explainHost(host: Readonly<Host>): HostExplanation {
  const groups: HostCapabilityGroupExplanation[] = [];
  for (const [group, value] of Object.entries(host)) {
    if (typeof value !== 'object' || value === null) continue;
    const isProvider = _PROVIDER_GROUPS.has(group);
    const slots = isProvider
      ? []
      : Object.entries(value as Record<string, unknown>)
          .filter((entry) => entry[1] !== undefined && entry[1] !== null)
          .map((entry) => entry[0]);
    groups.push({ group, isProvider, slots });
  }
  const providers: HostProviderCoverage[] = _COVERAGE.map((entry) => ({
    group: entry.group,
    isPresent: _isSlotPresent(host, entry.group, entry.slot),
    provider: entry.provider,
    slot: entry.slot,
  }));
  return { groups, providers };
}

// Why getHostAudioDevice returned null, and which package supplies the provider it wanted.
export function explainHostAudioDevice(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'media', 'audioDevice');
}

export function explainHostAudioMixer(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'media', 'audioMixer');
}

export function explainHostImage(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'graphics', 'image');
}

export function explainHostInputIngress(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'input', 'ingress');
}

export function explainHostTextSegmenter(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'text', 'segmenter');
}

export function explainHostTextShaper(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'text', 'shaper');
}

export function explainHostVideo(host: Readonly<Host>): HostProviderExplanation {
  return _explainSlot(host, 'media', 'video');
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
  const accessor = `get${provider.slice(0, -'Provider'.length)}`;
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

// `Host.window` holds a provider directly rather than a group of provider slots. Listing its method names
// as "slots" would report operations as capabilities, so it is named here and reported with none. The
// seam: a second provider-at-group-position in Host must gain a name here or it reports its methods.
const _PROVIDER_GROUPS: ReadonlySet<string> = new Set(['window']);

const _COVERAGE: readonly { readonly group: string; readonly provider: string; readonly slot: string }[] = [
  { group: 'clipboard', provider: 'HostClipboardFormatsProvider', slot: 'formats' },
  { group: 'graphics', provider: 'HostBitmapEncodeProvider', slot: 'bitmapEncode' },
  { group: 'graphics', provider: 'HostBitmapReadbackProvider', slot: 'bitmapReadback' },
  { group: 'graphics', provider: 'HostImageProvider', slot: 'image' },
  { group: 'graphics', provider: 'HostPathBooleanProvider', slot: 'pathBoolean' },
  { group: 'graphics', provider: 'HostWgpuProvider', slot: 'wgpuHost' },
  { group: 'input', provider: 'HostHapticsProvider', slot: 'haptics' },
  { group: 'input', provider: 'HostInputIngressProvider', slot: 'ingress' },
  { group: 'input', provider: 'HostSoftKeyboardInfoProvider', slot: 'softKeyboardInfo' },
  { group: 'media', provider: 'HostAudioDeviceProvider', slot: 'audioDevice' },
  { group: 'media', provider: 'HostAudioMixerProvider', slot: 'audioMixer' },
  { group: 'media', provider: 'HostVideoProvider', slot: 'video' },
  { group: 'net', provider: 'HostNetProvider', slot: 'http' },
  { group: 'net', provider: 'HostSocketProvider', slot: 'socket' },
  { group: 'notification', provider: 'HostNotificationPermissionProvider', slot: 'permission' },
  { group: 'power', provider: 'HostPowerKeepAwakeProvider', slot: 'keepAwake' },
  { group: 'screen', provider: 'HostScreenQueryProvider', slot: 'query' },
  { group: 'storage', provider: 'HostFileSystemProvider', slot: 'fileSystem' },
  { group: 'storage', provider: 'HostStorageProvider', slot: 'local' },
  { group: 'storage', provider: 'HostStoragePersistenceQueryProvider', slot: 'persistenceQuery' },
  { group: 'system', provider: 'HostDeviceProvider', slot: 'device' },
  { group: 'system', provider: 'HostGeolocationProvider', slot: 'geolocation' },
  { group: 'system', provider: 'HostLifecycleProvider', slot: 'lifecycle' },
  { group: 'system', provider: 'HostPlatformProvider', slot: 'platform' },
  { group: 'system', provider: 'HostSensorsProvider', slot: 'sensors' },
  { group: 'text', provider: 'HostBidiClassProvider', slot: 'bidiClass' },
  { group: 'text', provider: 'HostFontLoadingProvider', slot: 'fontLoading' },
  { group: 'text', provider: 'HostGlyphRasterizerProvider', slot: 'glyphRasterizer' },
  { group: 'text', provider: 'HostTextSegmenterProvider', slot: 'segmenter' },
  { group: 'text', provider: 'HostTextShaperProvider', slot: 'shaper' },
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
  'graphics.image': {
    backends: [_WEB_HOST],
    consequence: 'nothing can decode an image or read its dimensions',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
  'input.ingress': {
    backends: [_WEB_HOST],
    consequence: 'no pointer, key, or wheel event reaches the input manager',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
  'media.audioDevice': {
    backends: [_WEB_HOST],
    consequence: 'no audio can be decoded or played',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
  'media.audioMixer': {
    backends: [_WEB_HOST],
    consequence: 'sound transforms and mixer routing are inert',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
  'media.video': {
    backends: [_WEB_HOST],
    consequence: 'nothing can decode or present video',
    fix: 'build the host from webHost in @flighthq/host-web',
  },
  'text.segmenter': {
    backends: [{ entryPoint: 'createWebTextSegmenterBackend', packageName: '@flighthq/textsegment', platform: 'Web' }],
    consequence: 'grapheme, word, and sentence breaking fall back to code-unit boundaries',
    fix: "pass createWebTextSegmenterBackend() from @flighthq/textsegment into createHost's text group",
  },
  'text.shaper': {
    backends: [
      {
        entryPoint: 'createCanvasTextShaperBackend',
        packageName: '@flighthq/textshaper-canvas',
        platform: 'Canvas 2D',
      },
    ],
    consequence: 'text cannot be measured or shaped and lays out at zero width',
    fix: "pass createCanvasTextShaperBackend() from @flighthq/textshaper-canvas into createHost's text group",
  },
};
