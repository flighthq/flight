import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { registerDeflateDecompressor } from '@flighthq/compression';
import { createGlyphOutlineSourceFromOpenTypeFont } from '@flighthq/font-formats';
import { parseParticleConfigDocument } from '@flighthq/particles-formats';
import {
  createScene2DFromLottieDocument,
  createScene2DFromRiveDocument,
  createScene2DFromSvgDocument,
} from '@flighthq/scene2d-formats';
import {
  createScene3DFrom3ds,
  createScene3DFromAwd2,
  createScene3DFromMd2,
  createScene3DFromMd5Mesh,
  createScene3DFromObj,
  createScene3DsFromGlb,
  createScene3DsFromGltf,
  findScene3DSkeletonJoints,
  GltfAnisotropyExtensionHandler,
  GltfClearcoatExtensionHandler,
  GltfEmissiveStrengthExtensionHandler,
  GltfIorExtensionHandler,
  GltfIridescenceExtensionHandler,
  GltfPunctualLightsExtensionHandler,
  GltfSheenExtensionHandler,
  GltfSpecularExtensionHandler,
  GltfSpecularGlossinessExtensionHandler,
  GltfTransmissionExtensionHandler,
  GltfUnlitExtensionHandler,
  GltfVolumeExtensionHandler,
  parseMd5Anim,
  parseObjMaterialLibrary,
} from '@flighthq/scene3d-formats';
import { parseSkeleton2D, parseSpineSkeletonBinary } from '@flighthq/skeleton2d-formats';
import { createScene2DImportFromSwf } from '@flighthq/swf';
import { parseAtf, parseBasis, parseDds, parseKtx2 } from '@flighthq/texture-formats';
import type {
  GltfDocument,
  GltfExtensionHandler,
  ImportDiagnostic,
  ObjMaterial,
  ObjMaterialLibrary,
} from '@flighthq/types/contract';

import type {
  ConformanceFixtureAdapter,
  ConformanceFixtureInput,
  ConformanceFixtureObservation,
  ConformanceFixtureTree,
} from '../core/fixture-conformance';

export function createImportFixtureAdapters(): ConformanceFixtureAdapter[] {
  // Fixture parsing is an explicit assembly. Both compressed SWF and compressed AWD2 go through the same
  // public decompressor registry production applications use; merely importing this module registers nothing.
  // A family without a Flight importer still owns an individual unavailable slot. Wiring support is therefore
  // local: import the public Flight method, add its runner below, and replace that family's unavailablePackAdapter
  // call with packAdapter. Discovery, scoring, selection, and report structure do not change.
  registerDeflateDecompressor();
  return [
    unavailablePackAdapter('alembic', ['3d', 'alembic', 'mesh', 'model'], ['.abc']),
    adapter('atf', ['.atf'], runAtf),
    adapter('awd2', ['.awd'], runAwd2),
    adapter('basis', ['.basis'], runBasis),
    unavailableAdapter('blender', ['.blend']),
    unavailableAdapter('bvh', ['.bvh']),
    unavailableAdapter('collada', ['.dae']),
    adapter('dds', ['.dds'], runDds),
    unavailableAdapter('directx-x', ['.x']),
    unavailableAdapter('fbx', ['.fbx']),
    adapter('gltf', ['.glb', '.gltf'], runGltf),
    adapter('ktx2', ['.ktx2'], runKtx2),
    unavailableAdapter('lightwave', ['.lwo']),
    packAdapter('lottie', ['lottie', 'bodymovin'], ['.json'], runLottie),
    adapter('md2', ['.md2'], runMd2),
    adapter('md5-animation', ['.md5anim'], runMd5Animation),
    adapter('md5-mesh', ['.md5mesh'], runMd5Mesh),
    adapter('obj', ['.obj'], runObj),
    adapter('obj-material', ['.mtl'], runObjMaterial),
    adapter('open-type-font', ['.otf', '.ttf', '.woff'], runOpenTypeFont),
    packAdapter('particle-config', ['particle'], ['.json', '.p', '.pex', '.plist'], runParticleConfig),
    unavailableAdapter('ply', ['.ply']),
    adapter('rive', ['.riv'], runRive),
    packAdapter('skeleton2d-json', ['dragon-bones', 'dragonbones', 'spine'], ['.json'], runSkeleton2D, ['particle']),
    adapter('spine-binary', ['.skel', '.skel.bytes'], runSpineBinary),
    unavailableAdapter('stl', ['.stl']),
    adapter('svg', ['.svg'], runSvg),
    adapter('swf', ['.swf'], runSwf),
    adapter('three-ds', ['.3ds'], runThreeDs),
    unavailableAdapter('three-ds-max', ['.max']),
    unavailableAdapter('usd', ['.usd', '.usda', '.usdc']),
    unavailableAdapter('woff2', ['.woff2']),
  ];
}

function adapter(
  id: string,
  extensions: readonly string[],
  run: Extract<ConformanceFixtureAdapter['implementation'], { state: 'available' }>['run'],
): ConformanceFixtureAdapter {
  return {
    id,
    implementation: { run, state: 'available' },
    selects: (_tree, reference) => hasExtension(reference, extensions),
  };
}

function packAdapter(
  id: string,
  packTokens: readonly string[],
  extensions: readonly string[],
  run: Extract<ConformanceFixtureAdapter['implementation'], { state: 'available' }>['run'],
  excludedPackTokens: readonly string[] = [],
): ConformanceFixtureAdapter {
  return {
    id,
    implementation: { run, state: 'available' },
    selects: (tree, reference) =>
      hasExtension(reference, extensions) && hasPackToken(tree, packTokens) && !hasPackToken(tree, excludedPackTokens),
  };
}

function unavailableAdapter(id: string, extensions: readonly string[]): ConformanceFixtureAdapter {
  return {
    id,
    implementation: { reason: 'flight-importer-unavailable', state: 'unavailable' },
    selects: (_tree, reference) => hasExtension(reference, extensions),
  };
}

function unavailablePackAdapter(
  id: string,
  packTokens: readonly string[],
  extensions: readonly string[],
): ConformanceFixtureAdapter {
  return {
    id,
    implementation: { reason: 'flight-importer-unavailable', state: 'unavailable' },
    selects: (tree, reference) => hasExtension(reference, extensions) && hasPackToken(tree, packTokens),
  };
}

async function runAtf(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  return { diagnostics: [], imported: parseAtf(new Uint8Array(await readFile(input.absolutePath))) !== null };
}

async function runAwd2(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  createScene3DFromAwd2(new Uint8Array(await readFile(input.absolutePath)), diagnostics);
  return observation(diagnostics);
}

async function runBasis(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  return { diagnostics: [], imported: parseBasis(new Uint8Array(await readFile(input.absolutePath))) !== null };
}

async function runDds(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  return { diagnostics: [], imported: parseDds(new Uint8Array(await readFile(input.absolutePath))) !== null };
}

async function runGltf(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  if (input.reference.toLowerCase().endsWith('.glb')) {
    createScene3DsFromGlb(new Uint8Array(await readFile(input.absolutePath)), diagnostics, {
      basePath: referenceDirectory(input.reference),
      extensionHandlers: GLTF_EXTENSION_HANDLERS,
    });
  } else {
    const source = await readFile(input.absolutePath, 'utf8');
    createScene3DsFromGltf(source, diagnostics, {
      basePath: referenceDirectory(input.reference),
      extensionHandlers: GLTF_EXTENSION_HANDLERS,
      externalBuffers: await readGltfExternalBuffers(input, source),
    });
  }
  return observation(diagnostics);
}

async function runKtx2(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  return { diagnostics: [], imported: parseKtx2(new Uint8Array(await readFile(input.absolutePath))) !== null };
}

async function runLottie(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  createScene2DFromLottieDocument(await readFile(input.absolutePath, 'utf8'), diagnostics);
  return observation(diagnostics);
}

async function runMd2(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  createScene3DFromMd2(new Uint8Array(await readFile(input.absolutePath)), diagnostics);
  return observation(diagnostics);
}

async function runMd5Animation(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const meshReference = findMd5MeshReference(input.reference, input.references);
  if (meshReference === null) return { diagnostics: [], imported: false, notRunReason: 'md5-mesh-unavailable' };

  const diagnostics: ImportDiagnostic[] = [];
  const meshSource = await readFile(resolveFixtureReference(input.tree.directory, meshReference), 'utf8');
  const scene = createScene3DFromMd5Mesh(meshSource, diagnostics);
  const joints = findScene3DSkeletonJoints(scene.root);
  if (joints === null) return { diagnostics, imported: false, notRunReason: 'md5-joints-unavailable' };
  const clip = parseMd5Anim(await readFile(input.absolutePath, 'utf8'), joints, diagnostics);
  return { diagnostics, imported: clip !== null };
}

async function runMd5Mesh(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  createScene3DFromMd5Mesh(await readFile(input.absolutePath, 'utf8'), diagnostics);
  return observation(diagnostics);
}

async function runObj(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  const source = await readFile(input.absolutePath, 'utf8');
  createScene3DFromObj(source, await readObjMaterialLibraries(input, source, diagnostics), diagnostics);
  return observation(diagnostics);
}

async function runObjMaterial(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  parseObjMaterialLibrary(await readFile(input.absolutePath, 'utf8'), diagnostics);
  return observation(diagnostics);
}

async function runOpenTypeFont(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const imported = createGlyphOutlineSourceFromOpenTypeFont(new Uint8Array(await readFile(input.absolutePath)));
  return { diagnostics: [], imported: imported !== null };
}

async function runParticleConfig(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const parsed = parseParticleConfigDocument(await readFile(input.absolutePath, 'utf8'));
  return { diagnostics: parsed.diagnostics, imported: parsed.format !== null };
}

async function runRive(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  createScene2DFromRiveDocument(new Uint8Array(await readFile(input.absolutePath)), diagnostics);
  return observation(diagnostics);
}

async function runSkeleton2D(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  const imported = parseSkeleton2D(await readFile(input.absolutePath, 'utf8'), diagnostics);
  return { diagnostics, imported: imported !== null };
}

async function runSpineBinary(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  const imported = parseSpineSkeletonBinary(new Uint8Array(await readFile(input.absolutePath)), diagnostics);
  return { diagnostics, imported: imported !== null };
}

async function runSvg(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  createScene2DFromSvgDocument(await readFile(input.absolutePath, 'utf8'), diagnostics);
  return observation(diagnostics);
}

async function runSwf(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  const imported = createScene2DImportFromSwf(new Uint8Array(await readFile(input.absolutePath)), diagnostics);
  return { diagnostics, imported: imported !== null };
}

async function runThreeDs(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  createScene3DFrom3ds(new Uint8Array(await readFile(input.absolutePath)), diagnostics);
  return observation(diagnostics);
}

function observation(diagnostics: readonly Readonly<ImportDiagnostic>[]): ConformanceFixtureObservation {
  return { diagnostics, imported: !diagnostics.some((diagnostic) => diagnostic.severity === 'Reject') };
}

async function readObjMaterialLibraries(
  input: Readonly<ConformanceFixtureInput>,
  source: string,
  diagnostics: ImportDiagnostic[],
): Promise<ObjMaterialLibrary | undefined> {
  const materials = new Map<string, ObjMaterial>();
  for (const uri of listObjMaterialLibraryUris(source)) {
    const path = resolveCompanionFixtureUri(input, uri);
    if (path === null) continue;
    try {
      const library = parseObjMaterialLibrary(await readFile(path, 'utf8'), diagnostics);
      for (const [name, material] of library.materials) materials.set(name, material);
    } catch {
      // The OBJ importer accepts an already-acquired material library. Missing sidecars therefore remain
      // absent at this harness seam, just as they do when an application's acquisition step cannot supply one.
    }
  }
  return materials.size === 0 ? undefined : { materials };
}

function listObjMaterialLibraryUris(source: string): string[] {
  const uris: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*mtllib\s+(.+?)\s*(?:#.*)?$/.exec(line);
    if (match !== null && match[1] !== '') uris.push(match[1]!);
  }
  return [...new Set(uris)];
}

function findMd5MeshReference(reference: string, references: readonly string[]): string | null {
  const directory = reference.slice(0, Math.max(0, reference.lastIndexOf('/') + 1));
  const meshes = references.filter((candidate) => candidate.toLowerCase().endsWith('.md5mesh'));
  return meshes.find((candidate) => candidate.startsWith(directory)) ?? (meshes.length === 1 ? meshes[0]! : null);
}

function hasExtension(reference: string, extensions: readonly string[]): boolean {
  const lower = reference.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

function hasPackToken(tree: Readonly<ConformanceFixtureTree>, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return false;
  const identities = [tree.tree, ...tree.packs.map((pack) => pack.id)].map((identity) => identity.toLowerCase());
  return tokens.some((token) => identities.some((identity) => identity.includes(token)));
}

async function readGltfExternalBuffers(
  input: Readonly<ConformanceFixtureInput>,
  source: string,
): Promise<Record<string, Uint8Array>> {
  let document: GltfDocument;
  try {
    document = JSON.parse(source) as GltfDocument;
  } catch {
    return {};
  }
  if (document === null || typeof document !== 'object') return {};

  const buffers: Record<string, Uint8Array> = {};
  for (const buffer of document.buffers ?? []) {
    const uri = buffer.uri;
    if (uri === undefined || uri.startsWith('data:')) continue;
    const path = resolveGltfFixtureUri(input, uri);
    if (path === null) continue;
    try {
      buffers[uri] = new Uint8Array(await readFile(path));
    } catch {
      // The importer owns the missing-buffer diagnostic. The harness supplies what exists and otherwise
      // leaves the map absent at that key, exactly like a failed application acquisition step.
    }
  }
  return buffers;
}

function resolveGltfFixtureUri(input: Readonly<ConformanceFixtureInput>, uri: string): string | null {
  return resolveCompanionFixtureUri(input, uri);
}

function resolveCompanionFixtureUri(input: Readonly<ConformanceFixtureInput>, uri: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(uri.split(/[?#]/, 1)[0]!);
  } catch {
    return null;
  }
  const path = resolve(dirname(input.absolutePath), decoded);
  const fromTree = relative(input.tree.directory, path);
  if (fromTree === '' || fromTree.startsWith(`..${sep}`) || fromTree === '..' || isAbsolute(fromTree)) return null;
  return path;
}

function resolveFixtureReference(treeDirectory: string, reference: string): string {
  return resolve(treeDirectory, ...reference.split('/'));
}

function referenceDirectory(reference: string): string | null {
  const index = reference.lastIndexOf('/');
  return index < 0 ? null : reference.slice(0, index + 1);
}

const GLTF_EXTENSION_HANDLERS: readonly GltfExtensionHandler[] = [
  GltfAnisotropyExtensionHandler,
  GltfClearcoatExtensionHandler,
  GltfEmissiveStrengthExtensionHandler,
  GltfIorExtensionHandler,
  GltfIridescenceExtensionHandler,
  GltfPunctualLightsExtensionHandler,
  GltfSheenExtensionHandler,
  GltfSpecularExtensionHandler,
  GltfSpecularGlossinessExtensionHandler,
  GltfTransmissionExtensionHandler,
  GltfUnlitExtensionHandler,
  GltfVolumeExtensionHandler,
];
