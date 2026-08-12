import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { registerDeflateDecompressor } from '@flighthq/compression';
import { parseParticleConfigDocument } from '@flighthq/particles-formats';
import { createScene2DFromRiveDocument } from '@flighthq/scene2d-formats';
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
import type { GltfDocument, GltfExtensionHandler, ImportDiagnostic } from '@flighthq/types/contract';

import type {
  ConformanceFixtureAdapter,
  ConformanceFixtureInput,
  ConformanceFixtureObservation,
  ConformanceFixtureTree,
} from '../core/fixture-conformance';

export function createImportFixtureAdapters(): ConformanceFixtureAdapter[] {
  // Fixture parsing is an explicit assembly. Both compressed SWF and compressed AWD2 go through the same
  // public decompressor registry production applications use; merely importing this module registers nothing.
  registerDeflateDecompressor();
  return [
    adapter('awd2', ['.awd'], runAwd2),
    adapter('gltf', ['.glb', '.gltf'], runGltf),
    adapter('md2', ['.md2'], runMd2),
    adapter('md5-animation', ['.md5anim'], runMd5Animation),
    adapter('md5-mesh', ['.md5mesh'], runMd5Mesh),
    adapter('obj', ['.obj'], runObj),
    adapter('obj-material', ['.mtl'], runObjMaterial),
    packAdapter('particle-config', ['particle'], ['.json', '.p', '.pex', '.plist'], runParticleConfig),
    adapter('rive', ['.riv'], runRive),
    packAdapter('skeleton2d-json', ['dragon-bones', 'dragonbones', 'spine'], ['.json'], runSkeleton2D, ['particle']),
    adapter('spine-binary', ['.skel'], runSpineBinary),
    adapter('swf', ['.swf'], runSwf),
    adapter('three-ds', ['.3ds'], runThreeDs),
    packAdapter(
      'unsupported-3d',
      ['3d', 'mesh', 'model'],
      ['.abc', '.blend', '.bvh', '.dae', '.fbx', '.lwo', '.max', '.ply', '.stl', '.usd', '.usda', '.usdc', '.x'],
      runUnsupported3D,
    ),
  ];
}

function adapter(
  id: string,
  extensions: readonly string[],
  run: ConformanceFixtureAdapter['run'],
): ConformanceFixtureAdapter {
  return { id, run, selects: (_tree, reference) => hasExtension(reference, extensions) };
}

function packAdapter(
  id: string,
  packTokens: readonly string[],
  extensions: readonly string[],
  run: ConformanceFixtureAdapter['run'],
  excludedPackTokens: readonly string[] = [],
): ConformanceFixtureAdapter {
  return {
    id,
    run,
    selects: (tree, reference) =>
      hasExtension(reference, extensions) && hasPackToken(tree, packTokens) && !hasPackToken(tree, excludedPackTokens),
  };
}

async function runAwd2(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  createScene3DFromAwd2(new Uint8Array(await readFile(input.absolutePath)), diagnostics);
  return observation(diagnostics);
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
  createScene3DFromObj(await readFile(input.absolutePath, 'utf8'), undefined, diagnostics);
  return observation(diagnostics);
}

async function runObjMaterial(input: Readonly<ConformanceFixtureInput>): Promise<ConformanceFixtureObservation> {
  const diagnostics: ImportDiagnostic[] = [];
  parseObjMaterialLibrary(await readFile(input.absolutePath, 'utf8'), diagnostics);
  return observation(diagnostics);
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

async function runUnsupported3D(): Promise<ConformanceFixtureObservation> {
  return { diagnostics: [], imported: false, notRunReason: 'flight-importer-unavailable' };
}

function observation(diagnostics: readonly Readonly<ImportDiagnostic>[]): ConformanceFixtureObservation {
  return { diagnostics, imported: !diagnostics.some((diagnostic) => diagnostic.severity === 'Reject') };
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
