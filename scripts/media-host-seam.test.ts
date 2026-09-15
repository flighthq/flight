import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import * as hostWebContract from '../packages/host-web/src/contract';
import * as hostWebPublic from '../packages/host-web/src/index';
import * as mediaContract from '../packages/media/src/contract';
import * as mediaPublic from '../packages/media/src/index';

const ROOT = process.cwd();
const SELF = 'scripts/media-host-seam.test.ts';
const PORTABLE_MEDIA_ROOT = resolve(ROOT, 'packages/media/src');
const BROWSER_MEDIA_IDENTIFIERS = new Set([
  'AudioBuffer',
  'AudioBufferSourceNode',
  'AudioContext',
  'AudioNode',
  'GainNode',
  'HTMLMediaElement',
  'HTMLVideoElement',
  'StereoPannerNode',
]);
const EXPECTED_AUDIO_MIXER_PROVIDER_SIGNATURES = [
  'createBusNode(graph: AudioMixerGraphHandle, gain: number, pan: number): AudioBusNodeHandle',
  'createMixerGraph(device: AudioDeviceHandle, masterGain: number): AudioMixerGraphHandle',
  'destroyBusNode(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle): void',
  'destroyMixerGraph(graph: AudioMixerGraphHandle): void',
  'fadeBusNodeGain(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, target: number, durationMs: number): void',
  'routeSourceToBus(graph: AudioMixerGraphHandle, source: AudioSourceHandle, bus: AudioBusNodeHandle): void',
  'routeSourceToDefault(graph: AudioMixerGraphHandle, source: AudioSourceHandle): void',
  'setBusNodeGain(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, gain: number): void',
  'setBusNodePan(graph: AudioMixerGraphHandle, bus: AudioBusNodeHandle, pan: number): void',
  'setMasterGain(graph: AudioMixerGraphHandle, gain: number): void',
  'unrouteSource(graph: AudioMixerGraphHandle, source: AudioSourceHandle): void',
].sort();
const EXPECTED_AUDIO_DEVICE_PROVIDER_METHODS = [
  'createBuffer',
  'createDevice',
  'createSource',
  'destroyBuffer',
  'destroyDevice',
  'destroySource',
  'fadeSourceGain',
  'getDeviceTime',
  'onSourceEnded',
  'resumeDevice',
  'setSourceGain',
  'setSourcePan',
  'setSourcePlaybackRate',
  'startSource',
  'stopSource',
].sort();
const EXPECTED_AUDIO_DEVICE_FADE_SIGNATURE =
  'fadeSourceGain?(source: AudioSourceHandle, targetGain: number, durationMs: number): void';
// The node and context lookups are intentionally a host-web-only structural extension. Portable
// consumers see only HostAudioDeviceProvider, while host-web helpers narrow to these own operations.
const EXPECTED_WEB_AUDIO_DEVICE_METHODS = [
  ...EXPECTED_AUDIO_DEVICE_PROVIDER_METHODS,
  'getDeviceAudioContext',
  'getSourceBufferSourceNode',
  'getSourceGainNode',
].sort();
const EXPECTED_MIXER_HANDLE_TYPES: ReadonlyMap<string, string> = new Map([
  ['AudioBusNodeHandle', "number & { readonly __brand: 'AudioBusNodeHandle' }"],
  ['AudioMixerGraphHandle', "number & { readonly __brand: 'AudioMixerGraphHandle' }"],
]);
const EXPECTED_VIDEO_PROVIDER_METHODS = [
  'addEndedListener',
  'attachStream',
  'canPlayType',
  'createObjectUrl',
  'createVideoElement',
  'getCurrentTime',
  'getDuration',
  'getHeight',
  'getLoop',
  'getMuted',
  'getPlaybackRate',
  'getVolume',
  'getWidth',
  'isReady',
  'loadUrl',
  'pause',
  'play',
  'releaseElement',
  'removeEndedListener',
  'revokeObjectUrl',
  'setCurrentTime',
  'setLoop',
  'setMuted',
  'setPlaybackRate',
  'setVolume',
].sort();
const EXPECTED_VIDEO_TRANSPORT_SIGNATURES = [
  'addEndedListener?(element: HostImageSource, listener: () => void): void',
  'getCurrentTime?(element: HostImageSource): number',
  'getLoop?(element: HostImageSource): boolean',
  'getMuted?(element: HostImageSource): boolean',
  'getPlaybackRate?(element: HostImageSource): number',
  'getVolume?(element: HostImageSource): number',
  'pause?(element: HostImageSource): void',
  'play?(element: HostImageSource): Promise<void>',
  'removeEndedListener?(element: HostImageSource, listener: () => void): void',
  'setCurrentTime?(element: HostImageSource, value: number): void',
  'setLoop?(element: HostImageSource, value: boolean): void',
  'setMuted?(element: HostImageSource, value: boolean): void',
  'setPlaybackRate?(element: HostImageSource, value: number): void',
  'setVolume?(element: HostImageSource, value: number): void',
].sort();
const VIDEO_TRANSPORT_METHODS = new Set([
  'addEndedListener',
  'getCurrentTime',
  'getLoop',
  'getMuted',
  'getPlaybackRate',
  'getVolume',
  'pause',
  'play',
  'removeEndedListener',
  'setCurrentTime',
  'setLoop',
  'setMuted',
  'setPlaybackRate',
  'setVolume',
]);
const PROVIDER_FIRST_FUNCTIONS: ReadonlyMap<string, ProviderFirstFunction> = new Map([
  ['addAudioBusToMixer', { minimumArguments: 3, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['createAudioMixer', { minimumArguments: 2, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['destroyAudioMixer', { minimumArguments: 2, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['destroyVideoChannel', { minimumArguments: 2, providerType: 'HostVideoProvider' }],
  ['fadeAudioBusGain', { minimumArguments: 5, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['fadeAudioChannelGain', { minimumArguments: 4, providerType: 'Readonly<HostAudioDeviceProvider>' }],
  ['getVideoChannelCurrentTime', { minimumArguments: 2, providerType: 'HostVideoProvider' }],
  ['getVideoChannelHeight', { minimumArguments: 2, providerType: 'HostVideoProvider' }],
  ['getVideoChannelWidth', { minimumArguments: 2, providerType: 'HostVideoProvider' }],
  ['pauseVideoChannel', { minimumArguments: 2, providerType: 'HostVideoProvider' }],
  ['playVideoResource', { minimumArguments: 2, providerType: 'HostVideoProvider' }],
  ['resumeVideoChannel', { minimumArguments: 2, providerType: 'HostVideoProvider' }],
  ['routeAudioChannelToMixerBus', { minimumArguments: 4, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['setAudioBusGain', { minimumArguments: 3, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['setAudioBusMuted', { minimumArguments: 3, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['setAudioBusPan', { minimumArguments: 3, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['setAudioMixerMasterGain', { minimumArguments: 3, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['setAudioMixerMasterMuted', { minimumArguments: 3, providerType: 'Readonly<HostAudioMixerProvider>' }],
  ['setVideoChannelCurrentTime', { minimumArguments: 3, providerType: 'HostVideoProvider' }],
  ['setVideoChannelGain', { minimumArguments: 3, providerType: 'HostVideoProvider' }],
  ['setVideoChannelMuted', { minimumArguments: 3, providerType: 'HostVideoProvider' }],
  ['setVideoChannelPlaybackRate', { minimumArguments: 3, providerType: 'HostVideoProvider' }],
  ['stopVideoChannel', { minimumArguments: 2, providerType: 'HostVideoProvider' }],
  ['unrouteAudioChannelFromMixerBus', { minimumArguments: 3, providerType: 'Readonly<HostAudioMixerProvider>' }],
]);
const EXPECTED_PROVIDER_FIRST_MIXER_SIGNATURES: ReadonlyMap<string, string> = new Map([
  [
    'addAudioBusToMixer',
    'addAudioBusToMixer(hostAudioMixer: Readonly<HostAudioMixerProvider>, mixer: Readonly<AudioMixer>, bus: AudioBus): void',
  ],
  [
    'createAudioMixer',
    'createAudioMixer(hostAudioMixer: Readonly<HostAudioMixerProvider>, device: AudioDeviceHandle, options?: Readonly<AudioMixerOptions>): AudioMixer',
  ],
  [
    'destroyAudioMixer',
    'destroyAudioMixer(hostAudioMixer: Readonly<HostAudioMixerProvider>, mixer: Readonly<AudioMixer>): void',
  ],
  [
    'fadeAudioBusGain',
    'fadeAudioBusGain(hostAudioMixer: Readonly<HostAudioMixerProvider>, mixer: Readonly<AudioMixer>, bus: AudioBus, targetGain: number, durationMs: number): void',
  ],
  [
    'routeAudioChannelToMixerBus',
    'routeAudioChannelToMixerBus(hostAudioMixer: Readonly<HostAudioMixerProvider>, mixer: Readonly<AudioMixer>, channel: AudioChannel, bus: AudioBus): void',
  ],
  [
    'setAudioBusGain',
    'setAudioBusGain(hostAudioMixer: Readonly<HostAudioMixerProvider>, bus: AudioBus, value: number): number',
  ],
  [
    'setAudioBusMuted',
    'setAudioBusMuted(hostAudioMixer: Readonly<HostAudioMixerProvider>, bus: AudioBus, muted: boolean): boolean',
  ],
  [
    'setAudioBusPan',
    'setAudioBusPan(hostAudioMixer: Readonly<HostAudioMixerProvider>, bus: AudioBus, value: number): number',
  ],
  [
    'setAudioMixerMasterGain',
    'setAudioMixerMasterGain(hostAudioMixer: Readonly<HostAudioMixerProvider>, mixer: AudioMixer, value: number): number',
  ],
  [
    'setAudioMixerMasterMuted',
    'setAudioMixerMasterMuted(hostAudioMixer: Readonly<HostAudioMixerProvider>, mixer: AudioMixer, muted: boolean): boolean',
  ],
  [
    'unrouteAudioChannelFromMixerBus',
    'unrouteAudioChannelFromMixerBus(hostAudioMixer: Readonly<HostAudioMixerProvider>, mixer: Readonly<AudioMixer>, channel: AudioChannel): void',
  ],
]);
const EXPECTED_PROVIDER_FREE_MIXER_SIGNATURES: ReadonlyMap<string, string> = new Map([
  ['createAudioBus', 'createAudioBus(options?: Readonly<AudioBusOptions>): AudioBus'],
  ['getAudioMixerActiveChannels', 'getAudioMixerActiveChannels(mixer: Readonly<AudioMixer>): readonly AudioChannel[]'],
  [
    'initializeAudioBus',
    'initializeAudioBus(out: EntityConstruction<AudioBus>, options?: Readonly<AudioBusOptions>): void',
  ],
  ['pauseAllAudioMixerChannels', 'pauseAllAudioMixerChannels(mixer: Readonly<AudioMixer>): void'],
  ['resumeAllAudioMixerChannels', 'resumeAllAudioMixerChannels(mixer: Readonly<AudioMixer>): void'],
  ['setAudioBusMixerGuard', 'setAudioBusMixerGuard(guard: AudioBusMixerGuard | null): void'],
  ['stopAllAudioMixerChannels', 'stopAllAudioMixerChannels(mixer: Readonly<AudioMixer>): void'],
]);
const RETIRED_MEDIA_EXPORTS = [
  'connectAudioChannelToNode',
  'createWebAudioDeviceBackend',
  'getAudioSourceBufferSourceNode',
  'getAudioSourceGainNode',
  'getAudioChannelInputNode',
  'getAudioChannelOutputNode',
  'hasAudioDeviceWebNodeAccess',
  'hasAudioChannelNodeAccess',
  'initializeWebAudioDeviceBackend',
] as const;
const REMOVED_NODE_APIS = [
  'connectAudioChannelToNode',
  'getAudioChannelInputNode',
  'getAudioChannelOutputNode',
  'hasAudioChannelNodeAccess',
] as const;
const RELOCATED_WEB_APIS = [
  'createWebAudioDeviceBackend',
  'getAudioSourceBufferSourceNode',
  'getAudioSourceGainNode',
  'hasAudioDeviceWebNodeAccess',
  'initializeWebAudioDeviceBackend',
] as const;
const WEB_BACKEND_DECLARATIONS: ReadonlyMap<string, string> = new Map([
  ['createWebAudioDeviceBackend', 'packages/host-web/src/webAudioDevice.ts'],
  ['createWebAudioMixerBackend', 'packages/host-web/src/webAudioMixer.ts'],
  ['createWebVideoCapabilityBackend', 'packages/host-web/src/webVideoCapability.ts'],
  ['getAudioDeviceContext', 'packages/host-web/src/webAudioDevice.ts'],
  ['getAudioSourceBufferSourceNode', 'packages/host-web/src/webAudioDevice.ts'],
  ['getAudioSourceGainNode', 'packages/host-web/src/webAudioDevice.ts'],
  ['hasAudioDeviceWebNodeAccess', 'packages/host-web/src/webAudioDevice.ts'],
  ['initializeWebAudioDeviceBackend', 'packages/host-web/src/webAudioDevice.ts'],
  ['initializeWebAudioMixerBackend', 'packages/host-web/src/webAudioMixer.ts'],
  ['initializeWebVideoCapabilityBackend', 'packages/host-web/src/webVideoCapability.ts'],
  ['webHostAudioDevice', 'packages/host-web/src/webAudioDevice.ts'],
  ['webHostAudioMixer', 'packages/host-web/src/webAudioMixer.ts'],
  ['webHostVideo', 'packages/host-web/src/webVideoCapability.ts'],
]);
const REPOSITORY_SOURCE_TEXTS: readonly RepositorySourceText[] = [
  'examples',
  'functional',
  'packages',
  'scripts',
  'tools',
]
  .flatMap((directory) => sourcePaths(resolve(ROOT, directory)))
  .filter((path) => relative(ROOT, path).replaceAll('\\', '/') !== SELF)
  .map((path) => ({ path, text: readFileSync(path, 'utf8') }));

describe('media host-seam closure', () => {
  it('recognizes every forbidden portable browser media fixture', () => {
    const source = parseSource(
      'fixture.ts',
      `
        let video: HTMLVideoElement;
        let media: HTMLMediaElement;
        let context: AudioContext;
        let gain: GainNode;
        let panner: StereoPannerNode;
        let source: AudioBufferSourceNode;
        let node: AudioNode;
        let buffer: AudioBuffer;
      `,
    );

    expect(new Set(findBrowserMediaReferences(source).map(({ identifier }) => identifier))).toEqual(
      BROWSER_MEDIA_IDENTIFIERS,
    );
  });

  it('keeps portable media production free of browser media types', () => {
    expect(productionMediaSources().flatMap(findBrowserMediaReferences)).toEqual([]);
  });

  it('pins every HostAudioMixerProvider operation to the frozen graph-first surface', () => {
    expect(interfaceMethodSignatures('HostAudioMixerProvider')).toEqual(EXPECTED_AUDIO_MIXER_PROVIDER_SIGNATURES);
    expect(interfaceHeritage('HostAudioMixerProvider')).toEqual(['Entity']);
    expect(interfacePropertySignatures('HostMediaCapabilities', new Set(['audioMixer']))).toEqual([
      'readonly audioMixer?: HostAudioMixerProvider',
    ]);
  });

  it('keeps mixer graph and bus-node handles as distinct branded numbers', () => {
    for (const [name, expected] of EXPECTED_MIXER_HANDLE_TYPES) {
      expect(typeAliasDefinition(name), name).toBe(expected);
    }
  });

  it('pins the HostAudioDeviceProvider surface and optional fade operation', () => {
    expect(interfaceMethodNames('HostAudioDeviceProvider')).toEqual(EXPECTED_AUDIO_DEVICE_PROVIDER_METHODS);
    expect(interfaceMethodSignatures('HostAudioDeviceProvider', new Set(['fadeSourceGain']))).toEqual([
      EXPECTED_AUDIO_DEVICE_FADE_SIGNATURE,
    ]);
  });

  it('pins the complete HostVideoProvider surface and its optional transport operations', () => {
    expect(interfaceMethodNames('HostVideoProvider')).toEqual(EXPECTED_VIDEO_PROVIDER_METHODS);
    expect(interfaceMethodSignatures('HostVideoProvider', VIDEO_TRANSPORT_METHODS)).toEqual(
      EXPECTED_VIDEO_TRANSPORT_SIGNATURES,
    );
  });

  it('pins every host-web media provider implementation and composed singleton', () => {
    expect(providerOperationNames(exportedValue(hostWebContract, 'webHostVideo'))).toEqual(
      EXPECTED_VIDEO_PROVIDER_METHODS,
    );
    expect(providerOperationNames(exportedValue(hostWebContract, 'webHostAudioDevice'))).toEqual(
      EXPECTED_WEB_AUDIO_DEVICE_METHODS,
    );
    expect(providerOperationNames(exportedValue(hostWebContract, 'webHostAudioMixer'))).toEqual(
      EXPECTED_AUDIO_MIXER_PROVIDER_SIGNATURES.map((signature) => signature.slice(0, signature.indexOf('('))).sort(),
    );

    for (const name of ['webHostAudioDevice', 'webHostAudioMixer', 'webHostVideo']) {
      const provider = exportedValue(hostWebContract, name);
      expect(exportedValue(hostWebPublic, name), name).toBe(provider);
      expect(composedMediaProvider(name), name).toBe(provider);
    }
  });

  it('keeps the web mixer on the runtime device-context resolver', () => {
    const path = resolve(ROOT, 'packages/host-web/src/webAudioMixer.ts');
    const source = parseSource(path, readFileSync(path, 'utf8'));
    const resolverCalls: string[] = [];
    const retiredHelperReferences: string[] = [];
    visit(source, (node) => {
      if (ts.isIdentifier(node) && node.text === 'getAudioDeviceContext') {
        retiredHelperReferences.push(location(source, node));
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'getDeviceAudioContext'
      ) {
        resolverCalls.push(node.getText(source).replace(/\s+/gu, ' '));
      }
    });

    expect(resolverCalls).toEqual(['getDeviceAudioContext(webHostAudioDevice, device)']);
    expect(retiredHelperReferences).toEqual([]);
  });

  it('makes every host-dependent portable media API explicitly provider-first', () => {
    const signatures = exportedMediaFunctions();
    const violations = [...PROVIDER_FIRST_FUNCTIONS].flatMap(([name, expected]) => {
      const declaration = signatures.get(name);
      if (declaration === undefined) return [`${name}: missing`];
      const first = declaration.parameters[0];
      const type = first?.type?.getText(declaration.getSourceFile()) ?? '<missing>';
      return type === expected.providerType ? [] : [`${name}: ${type}`];
    });

    expect(violations).toEqual([]);
  });

  it('pins every complete provider-first mixer function signature', () => {
    expect(exportedMediaFunctionSignatures(EXPECTED_PROVIDER_FIRST_MIXER_SIGNATURES)).toEqual(
      EXPECTED_PROVIDER_FIRST_MIXER_SIGNATURES,
    );
  });

  it('pins every complete provider-free mixer function signature', () => {
    expect(exportedMediaFunctionSignatures(EXPECTED_PROVIDER_FREE_MIXER_SIGNATURES)).toEqual(
      EXPECTED_PROVIDER_FREE_MIXER_SIGNATURES,
    );
  });

  it('leaves no providerless caller of a migrated media API', () => {
    expect(findLegacyCallArities()).toEqual([]);
  });

  it('leaves no declaration or caller of the removed portable Web-node APIs', () => {
    expect(REMOVED_NODE_APIS.flatMap((name) => findIdentifierReferences(name))).toEqual([]);
  });

  it('removes Web-only APIs from both media export lanes and keeps relocated APIs out of media source', () => {
    for (const name of RETIRED_MEDIA_EXPORTS) {
      expect(Object.hasOwn(mediaPublic, name), name).toBe(false);
      expect(Object.hasOwn(mediaContract, name), name).toBe(false);
    }
    for (const name of RELOCATED_WEB_APIS) {
      expect(findIdentifierReferencesUnder(PORTABLE_MEDIA_ROOT, name), name).toEqual([]);
    }
    expect(findRetiredMediaImports()).toEqual([]);
  });

  it('keeps browser media backend construction in host-web only', () => {
    const violations = [...WEB_BACKEND_DECLARATIONS].flatMap(([name, expected]) => {
      const actual = findExportedDeclarations(name);
      return actual.length === 1 && actual[0] === expected ? [] : [`${name}: ${actual.join(', ') || 'missing'}`];
    });

    expect(violations).toEqual([]);
  });
});

interface ProviderFirstFunction {
  minimumArguments: number;
  providerType: string;
}

interface ImportedMediaBindings {
  names: ReadonlyMap<string, string>;
  namespaces: ReadonlySet<string>;
}

interface BrowserMediaReference {
  file: string;
  identifier: string;
  line: number;
}

interface RepositorySourceText {
  path: string;
  text: string;
}

function findBrowserMediaReferences(source: ts.SourceFile): BrowserMediaReference[] {
  const references: BrowserMediaReference[] = [];
  visit(source, (node) => {
    if (!ts.isIdentifier(node) || !BROWSER_MEDIA_IDENTIFIERS.has(node.text)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    references.push({
      file: relative(ROOT, source.fileName).replaceAll('\\', '/'),
      identifier: node.text,
      line: line + 1,
    });
  });
  return references;
}

function productionMediaSources(): ts.SourceFile[] {
  return sourcePaths(PORTABLE_MEDIA_ROOT)
    .filter((path) => !path.endsWith('.test.ts'))
    .map((path) => parseSource(path, readFileSync(path, 'utf8')));
}

function interfaceMethodSignatures(name: string, selected?: ReadonlySet<string>): string[] {
  for (const source of typeSources()) {
    for (const statement of source.statements) {
      if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== name) continue;
      return statement.members
        .filter(ts.isMethodSignature)
        .filter((member) => selected === undefined || selected.has(member.name.getText(source)))
        .map((member) => member.getText(source).replace(/\s+/gu, ' ').replace(/;$/u, ''))
        .sort();
    }
  }
  return [];
}

function interfaceMethodNames(name: string): string[] {
  for (const source of typeSources()) {
    for (const statement of source.statements) {
      if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== name) continue;
      return statement.members
        .filter(ts.isMethodSignature)
        .map((member) => member.name.getText(source))
        .sort();
    }
  }
  return [];
}

function interfacePropertySignatures(name: string, selected: ReadonlySet<string>): string[] {
  for (const source of typeSources()) {
    for (const statement of source.statements) {
      if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== name) continue;
      return statement.members
        .filter(ts.isPropertySignature)
        .filter((member) => selected.has(member.name.getText(source)))
        .map((member) => member.getText(source).replace(/\s+/gu, ' ').replace(/;$/u, ''))
        .sort();
    }
  }
  return [];
}

function interfaceHeritage(name: string): string[] {
  for (const source of typeSources()) {
    for (const statement of source.statements) {
      if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== name) continue;
      return (statement.heritageClauses ?? [])
        .flatMap(({ types }) => types.map((type) => type.expression.getText(source)))
        .sort();
    }
  }
  return [];
}

function typeAliasDefinition(name: string): string | null {
  for (const source of typeSources()) {
    for (const statement of source.statements) {
      if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) return statement.type.getText(source);
    }
  }
  return null;
}

function exportedValue(module: object, name: string): unknown {
  return Reflect.get(module, name);
}

function providerOperationNames(value: unknown): string[] {
  return value !== null && typeof value === 'object'
    ? Object.entries(value)
        .filter(([, operation]) => typeof operation === 'function')
        .map(([name]) => name)
        .sort()
    : [];
}

function composedMediaProvider(name: string): unknown {
  const host = exportedValue(hostWebContract, 'webHost');
  if (host === null || typeof host !== 'object') return undefined;
  const media = Reflect.get(host, 'media') as unknown;
  if (media === null || typeof media !== 'object') return undefined;
  const slot = name === 'webHostAudioDevice' ? 'audioDevice' : name === 'webHostAudioMixer' ? 'audioMixer' : 'video';
  return Reflect.get(media, slot);
}

function exportedMediaFunctions(): ReadonlyMap<string, ts.FunctionDeclaration> {
  const declarations = new Map<string, ts.FunctionDeclaration>();
  for (const source of productionMediaSources()) {
    for (const statement of source.statements) {
      if (!ts.isFunctionDeclaration(statement) || statement.name === undefined || !isExported(statement)) continue;
      declarations.set(statement.name.text, statement);
    }
  }
  return declarations;
}

function exportedMediaFunctionSignatures(expected: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const declarations = exportedMediaFunctions();
  return new Map(
    [...expected.keys()].map((name) => {
      const declaration = declarations.get(name);
      if (declaration === undefined) return [name, '<missing>'] as const;
      const source = declaration.getSourceFile();
      const parameters = declaration.parameters.map((parameter) => parameter.getText(source)).join(', ');
      const returnType = declaration.type?.getText(source) ?? '<missing>';
      return [name, `${name}(${parameters}): ${returnType}`.replace(/\s+/gu, ' ')] as const;
    }),
  );
}

function findLegacyCallArities(): string[] {
  const names = [...PROVIDER_FIRST_FUNCTIONS.keys()];
  const findings: string[] = [];
  const candidate = new RegExp(`\\b(?:${names.join('|')})\\b`, 'u');
  for (const source of repositorySources(candidate)) {
    const bindings = importedMediaBindings(source);
    visit(source, (node) => {
      if (!ts.isCallExpression(node)) return;
      const name = calledProviderFirstName(node.expression, bindings);
      if (name === null) return;
      const expected = PROVIDER_FIRST_FUNCTIONS.get(name);
      if (expected !== undefined && node.arguments.length < expected.minimumArguments) {
        findings.push(`${location(source, node)}: ${name}(${node.arguments.length})`);
      }
    });
  }
  return findings.sort();
}

function importedMediaBindings(source: ts.SourceFile): ImportedMediaBindings {
  const names = new Map<string, string>();
  const namespaces = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!/^@flighthq\/(?:media|sdk)(?:\/contract)?$/u.test(statement.moduleSpecifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }
    for (const element of bindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (PROVIDER_FIRST_FUNCTIONS.has(imported)) names.set(element.name.text, imported);
    }
  }
  return { names, namespaces };
}

function calledProviderFirstName(
  expression: ts.LeftHandSideExpression,
  bindings: ImportedMediaBindings,
): string | null {
  if (ts.isIdentifier(expression)) {
    return (
      bindings.names.get(expression.text) ?? (PROVIDER_FIRST_FUNCTIONS.has(expression.text) ? expression.text : null)
    );
  }
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    bindings.namespaces.has(expression.expression.text) &&
    PROVIDER_FIRST_FUNCTIONS.has(expression.name.text)
  ) {
    return expression.name.text;
  }
  return null;
}

function findRetiredMediaImports(): string[] {
  const findings: string[] = [];
  const names = new Set<string>(RETIRED_MEDIA_EXPORTS);
  const candidate = new RegExp(`\\b(?:${RETIRED_MEDIA_EXPORTS.join('|')})\\b`, 'u');
  for (const source of repositorySources(candidate)) {
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      if (!/^@flighthq\/(?:media|sdk)(?:\/contract)?$/u.test(statement.moduleSpecifier.text)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (names.has(imported)) findings.push(`${location(source, element)}: ${imported}`);
      }
    }
  }
  return findings.sort();
}

function findIdentifierReferences(name: string): string[] {
  const findings: string[] = [];
  for (const source of repositorySources(new RegExp(`\\b${name}\\b`, 'u'))) {
    visit(source, (node) => {
      if (ts.isIdentifier(node) && node.text === name) findings.push(location(source, node));
    });
  }
  return findings.sort();
}

function findIdentifierReferencesUnder(root: string, name: string): string[] {
  const findings: string[] = [];
  for (const path of sourcePaths(root)) {
    const text = readFileSync(path, 'utf8');
    if (!new RegExp(`\\b${name}\\b`, 'u').test(text)) continue;
    const source = parseSource(path, text);
    visit(source, (node) => {
      if (ts.isIdentifier(node) && node.text === name) findings.push(location(source, node));
    });
  }
  return findings.sort();
}

function findExportedDeclarations(name: string): string[] {
  const findings: string[] = [];
  for (const source of repositorySources(new RegExp(`\\b${name}\\b`, 'u'))) {
    for (const statement of source.statements) {
      if (
        ((ts.isFunctionDeclaration(statement) && statement.name?.text === name) ||
          (ts.isVariableStatement(statement) &&
            statement.declarationList.declarations.some(
              ({ name: declarationName }) => ts.isIdentifier(declarationName) && declarationName.text === name,
            ))) &&
        isExported(statement)
      ) {
        findings.push(relative(ROOT, source.fileName).replaceAll('\\', '/'));
      }
    }
  }
  return findings.sort();
}

function typeSources(): ts.SourceFile[] {
  return sourcePaths(resolve(ROOT, 'packages/types/src'))
    .filter((path) => !path.endsWith('.test.ts'))
    .map((path) => parseSource(path, readFileSync(path, 'utf8')));
}

function repositorySources(candidate: RegExp): ts.SourceFile[] {
  return REPOSITORY_SOURCE_TEXTS.flatMap(({ path, text }) => (candidate.test(text) ? [parseSource(path, text)] : []));
}

function sourcePaths(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return ['build', 'dist', 'node_modules'].includes(entry.name) ? [] : sourcePaths(path);
      return entry.isFile() && /\.tsx?$/u.test(entry.name) ? [path] : [];
    })
    .sort();
}

function parseSource(path: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) ?? false)
  );
}

function location(source: ts.SourceFile, node: ts.Node): string {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${relative(ROOT, source.fileName).replaceAll('\\', '/')}:${line + 1}`;
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}
