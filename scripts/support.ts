// Generates the Flight backend support matrix from repository facts, so it cannot silently rot.
//
// Three sources feed it:
//   1. DERIVED (authoritative) — committed functional baseline fingerprints prove a scene rendered
//      deterministically and was captured on a backend. A screenshot hash alone is different evidence
//      and makes no support claim. Fingerprints do NOT prove the backend realized the feature;
//      unsupported control scenes produce fingerprints too.
//   2. DERIVED + COLOCATED DECLARATION — current functional scene discovery proves which backend
//      targets exist. A target is a realization unless the target itself exports
//      `functionalBackendSupport = 'control'`, for the exceptional fixture that deliberately renders an
//      unsupported control. A baseline without a realized target is preserved as `control`, never a tick.
//   3. DECLARED (overlay) — the small `DECLARED_GAPS` table below records capabilities that have NO
//      functional scene yet and cross-cutting caveats. Keep it short and honest.
//
// Run `npm run support` to regenerate `agents/support-matrix.md` + `agents/support-matrix.json`.
// `npm run support:check` (wired into `npm run check`) regenerates in memory and fails if the committed
// files differ — the same generate-and-diff guard as `order:check`, so the matrix cannot drift from
// either source fact without CI catching it.
//
// IMPORTANT semantic caveat, baked into the generated doc: a tick proves a discoverable realization
// plus a deterministic capture, NOT full correctness. A partial runner can still produce a stable
// fingerprint. Correctness caveats live in DECLARED_GAPS.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverFunctionalScene3Ds, functionalScene3DFile } from '../packages/tool-capture/src/functionalScene3Ds';
import type { FunctionalBackend } from '../packages/tool-capture/src/functionalScene3Ds';

const REPO_ROOT = join(import.meta.dirname, '..');
const BASELINES_DIR = join(REPO_ROOT, 'functional', 'baselines');
const SCENES_DIR = join(REPO_ROOT, 'functional', 'scenes');
const MATRIX_MD = join(REPO_ROOT, 'agents', 'support-matrix.md');
const MATRIX_JSON = join(REPO_ROOT, 'agents', 'support-matrix.json');

const BACKENDS = [
  { key: 'canvas', label: 'Canvas' },
  { key: 'dom', label: 'DOM' },
  { key: 'webgl', label: 'WebGL' },
  { key: 'webgpu', label: 'WebGPU' },
] as const;

// Backends an agent can re-verify inside the Docker Sbx sandbox. Canvas/DOM/WebGL run natively; WebGPU
// runs via Playwright's Chromium with the bundled SwiftShader software Vulkan adapter
// (--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader) plus the GPU-readback present path — proven
// re-verifiable in-sandbox 2026-07-18 (most functional scenes match host baselines exactly; a small set
// exceed the fingerprint tolerance on software-vs-hardware antialiasing — see maturity-gaps).
const SANDBOX_VERIFIABLE = new Set(['canvas', 'dom', 'webgl', 'webgpu']);

// Human-readable area label per scene-id prefix (the first '-' segment). Unlisted prefixes title-case.
const AREA_LABELS: Record<string, string> = {
  bitmap: 'Bitmaps',
  camera: 'Camera',
  clip: 'Clipping',
  color: 'Color / Adjustments',
  scene2d: 'Display Object',
  effect: 'Effects',
  env: 'Environment / IBL',
  light: 'Lighting',
  material: 'Materials (3D)',
  mesh: 'Mesh (3D)',
  node: 'Scene Node',
  particle: 'Particles',
  quadbatch: 'QuadBatch',
  scale9: 'Scale9',
  shadow: 'Shadows',
  shape: 'Shapes / Vector',
  sprite: 'Sprites',
  text: 'Text',
  textlabel: 'Text',
  tilemap: 'Tilemap',
  video: 'Video',
};

// DECLARED overlay — capabilities with NO functional scene (so baselines are silent) and cross-cutting
// caveats. Hand-authored; keep honest and short. `backends` lists the intended targets; `status` is the
// declared reality for those that have no baseline to derive from.
interface DeclaredGap {
  area: string;
  capability: string;
  status: 'not-implemented' | 'implemented-unverified' | 'partial';
  note: string;
}
const DECLARED_GAPS: readonly DeclaredGap[] = [
  {
    area: 'Model Import',
    capability: 'glTF materials / textures / animations',
    status: 'not-implemented',
    note: 'glTF imports geometry + skins only; drops materials, textures, animation channels, external .bin (gltfParse.ts header).',
  },
  {
    area: 'Model Import',
    capability: 'OBJ / 3DS / MD2 / MD5 textures',
    status: 'not-implemented',
    note: 'Only AWD emits SceneResourceRefs; other parsers leave textures unresolved.',
  },
  {
    area: 'Model Import',
    capability: 'FBX / USD / COLLADA / PLY / STL',
    status: 'not-implemented',
    note: 'No parser exists.',
  },
  {
    area: 'Skinning',
    capability: 'Inverse kinematics / dual-quaternion skinning / retargeting',
    status: 'not-implemented',
    note: 'Blend trees and state machines are implemented in animation; IK, DQS, and retargeting remain absent.',
  },
  {
    area: 'Resource lifecycle',
    capability: 'Texture unload / eviction / streaming (mip/LOD)',
    status: 'not-implemented',
    note: 'scene-resources resolves but never releases; assets refcount wired to nothing; no progressive streaming.',
  },
  {
    area: 'Resource lifecycle',
    capability: 'Compressed texture upload (KTX2 / DDS / Basis)',
    status: 'partial',
    note: 'GL and WebGPU native block upload plus display draw paths are implemented behind opt-in uploader seams, with RGBA decode fallbacks. WebGPU supports native BC/ETC2/ASTC and decoder-backed PVRTC/unavailable families. Canvas/DOM have none. Still no Basis/supercompression transcoder — supercompressed containers report the failure sentinel.',
  },
  {
    area: 'Materials (3D)',
    capability: 'Per-vertex color (mesh color0 → VertexColorMaterial)',
    status: 'partial',
    note: 'WebGL multiplies the mesh color0 attribute into the tint (material-vertex-color-interpolated covers it). The WebGPU mesh pipeline binds one fixed arrayStride-48 position/normal/tangent/uv0 layout with no color0 slot, so a color0-carrying geometry is not just untinted per-vertex there — its wider record is read at the wrong stride and the positions are wrong too. material-vertex-color uses color0-free geometry on both backends and so does not detect this.',
  },
  {
    area: 'Effects',
    capability: 'Screen-space effects (SSAO/SSR/TAA/motion-blur/contact-shadow/volumetric)',
    status: 'implemented-unverified',
    note: 'Effect pipeline is color-only (no depth/normal/velocity/history buffers) — these render a passthrough/approximate stub, so their baselines captured the STUB, not correct output.',
  },
  {
    area: 'Text',
    capability: 'Bidi / complex-script shaping / MSDF',
    status: 'not-implemented',
    note: 'textbidi (UAX#9) + textsegment (UAX#29) ship but are wired into nothing; no real shaping backend (advances-only); MSDF parses, no shader. Non-Latin renders wrong.',
  },
  {
    area: 'Simulation',
    capability: 'Physics / dynamics (rigid-body solver, swept/TOI, contacts)',
    status: 'not-implemented',
    note: 'collision is discrete overlap + MTV only; no solver, no world integration.',
  },
];

interface BackendCell {
  backend: FunctionalBackend;
  fingerprinted: boolean;
  realization: boolean;
  sandboxVerifiable: boolean;
  status: BackendSupportStatus;
}
export type BackendSupportStatus = 'control' | 'realized' | 'unbaselined';
export interface SceneRow {
  scene: string;
  backends: BackendCell[];
}
export interface AreaGroup {
  key: string;
  label: string;
  scenes: SceneRow[];
}

export function loadBaselineCoverage(directory = BASELINES_DIR): Map<string, Set<FunctionalBackend>> {
  const coverage = new Map<string, Set<FunctionalBackend>>();
  const files = readdirSync(directory)
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const file of files) {
    const scene = file.replace(/\.json$/, '');
    const data = JSON.parse(readFileSync(join(directory, file), 'utf8')) as Record<string, unknown>;
    const present = new Set<FunctionalBackend>();
    for (const { key } of BACKENDS) {
      const baseline = data[key];
      if (
        typeof baseline === 'object' &&
        baseline !== null &&
        typeof (baseline as { fingerprint?: unknown }).fingerprint === 'string'
      ) {
        present.add(key);
      }
    }
    coverage.set(scene, present);
  }
  return coverage;
}

/** Every (scene, backend) a functional target exists for — declared controls included, since a control
 * is still a scene that renders. Distinct from realization coverage, which excludes controls. */
export function loadTargetCoverage(directory = SCENES_DIR): Map<string, Set<FunctionalBackend>> {
  const coverage = new Map<string, Set<FunctionalBackend>>();
  for (const scene of discoverFunctionalScene3Ds(directory)) {
    coverage.set(scene.name, new Set(scene.renderers as FunctionalBackend[]));
  }
  return coverage;
}

/**
 * Committed fingerprints with no functional target to validate.
 *
 * A GATE MUST FAIL WHEN ITS EVIDENCE HAS NO REFERENT. That is the twin of the auditor's non-empty
 * rule, "a gate must fail when its required evidence is zero" — here the evidence exists but points at
 * nothing. A fingerprint for a backend with no scene cannot be a control, because a control is a scene
 * that renders; it is a leftover, and it manufactures a support mark out of nothing.
 *
 * This is why the matrix does not need a second glyph. Splitting ⊘ into declared-control and orphan
 * would make the bad state legible; failing here makes it unrepresentable, after which ⊘ means
 * declared-control unambiguously because the other meaning cannot survive a passing tree.
 */
export function findOrphanedBaselineFingerprints(
  baselines: ReadonlyMap<string, ReadonlySet<FunctionalBackend>>,
  targets: ReadonlyMap<string, ReadonlySet<FunctionalBackend>>,
): { scene: string; backend: FunctionalBackend }[] {
  const orphans: { scene: string; backend: FunctionalBackend }[] = [];
  for (const scene of [...baselines.keys()].sort()) {
    const declared = targets.get(scene);
    for (const { key } of BACKENDS) {
      if (!baselines.get(scene)!.has(key)) continue;
      if (declared === undefined || !declared.has(key)) orphans.push({ scene, backend: key });
    }
  }
  return orphans;
}

/** Reads scene discovery into the realized backend targets the support matrix may tick. */
export function loadRealizationCoverage(directory = SCENES_DIR): Map<string, Set<FunctionalBackend>> {
  const coverage = new Map<string, Set<FunctionalBackend>>();
  for (const scene of discoverFunctionalScene3Ds(directory)) {
    const realized = new Set<FunctionalBackend>();
    for (const backend of scene.renderers as FunctionalBackend[]) {
      const source = readFileSync(functionalScene3DFile(directory, scene.name, backend), 'utf8');
      if (findFunctionalBackendSupport(source) !== 'control') realized.add(backend);
    }
    coverage.set(scene.name, realized);
  }
  return coverage;
}

/** Reads the exceptional, colocated declaration on a functional unsupported-control target. */
export function findFunctionalBackendSupport(source: string): 'control' | null {
  const match = /\bexport\s+const\s+functionalBackendSupport\s*=\s*(['"])([^'"]+)\1(?:\s+as\s+const)?\s*;?/.exec(
    source,
  );
  if (match === null) return null;
  if (match[2] !== 'control') {
    throw new Error(`Unknown functionalBackendSupport value '${match[2]}'; expected 'control'`);
  }
  return 'control';
}

export function classifyBackendSupport(fingerprinted: boolean, realization: boolean): BackendSupportStatus {
  if (!fingerprinted) return 'unbaselined';
  return realization ? 'realized' : 'control';
}

export function buildGroups(
  coverage: Map<string, Set<FunctionalBackend>>,
  realizations: Map<string, Set<FunctionalBackend>>,
): AreaGroup[] {
  const byArea = new Map<string, SceneRow[]>();
  for (const [scene, present] of coverage) {
    const areaKey = scene.split('-')[0];
    const row: SceneRow = {
      scene,
      backends: BACKENDS.map(({ key }) => ({
        backend: key,
        fingerprinted: present.has(key),
        realization: realizations.get(scene)?.has(key) ?? false,
        sandboxVerifiable: SANDBOX_VERIFIABLE.has(key),
        status: classifyBackendSupport(present.has(key), realizations.get(scene)?.has(key) ?? false),
      })),
    };
    const list = byArea.get(areaKey);
    if (list === undefined) byArea.set(areaKey, [row]);
    else list.push(row);
  }
  return [...byArea.entries()]
    .map(([key, scenes]) => ({
      key,
      label: AREA_LABELS[key] ?? key[0].toUpperCase() + key.slice(1),
      scenes: scenes.sort((a, b) => a.scene.localeCompare(b.scene)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function cellGlyph(cell: BackendCell): string {
  if (cell.status === 'unbaselined') return '·';
  if (cell.status === 'control') return '⊘';
  return cell.sandboxVerifiable ? '✓' : '✓ᴴ';
}

export function renderMarkdown(groups: AreaGroup[]): string {
  const lines: string[] = [];
  lines.push(
    '<!-- GENERATED by `npm run support` from functional scenes + baselines + scripts/support.ts DECLARED_GAPS. Do not edit by hand. -->',
  );
  lines.push('');
  lines.push('# Flight SDK — Backend Support Matrix');
  lines.push('');
  lines.push('Derived from current functional-scene realization plus committed baseline fingerprints.');
  lines.push('Regenerated by `npm run support` and drift-gated by `npm run support:check` (part of `npm run check`).');
  lines.push('');
  lines.push(
    '> **Why 88 ticks became dots:** these cells still have current realizations and screenshot hashes, but no committed fingerprint. Changing `✓` to `·` corrects an evidence over-claim under [AGENTS.md](../AGENTS.md)—where a baseline is capture evidence, not by itself a support claim—and is not a capability regression.',
  );
  lines.push(
    '> The `--update-fingerprints` manifest-authority gate had to land before this regeneration so a broad refresh could not mint unaccepted fingerprint coverage for those cells and immediately recreate the over-claim.',
  );
  lines.push('');
  lines.push('## Legend');
  lines.push('');
  lines.push(
    '- `✓` — a current functional target **realizes the feature**, a committed fingerprint exists, and the backend is **re-verifiable in-sandbox**. Canvas/DOM/WebGL run natively; WebGPU runs via Playwright Chromium + the bundled SwiftShader software Vulkan adapter and the GPU-readback present path.',
  );
  lines.push(
    '- `✓ᴴ` — the feature is realized and fingerprinted, but was **host-captured** and is not re-verifiable in this sandbox. (None currently — all four backends re-verify here.)',
  );
  lines.push(
    '- `⊘` — a fingerprint exists, but current scene discovery finds **no realized feature target**. It records an unsupported control (declared beside the fixture) or an orphaned capture; it is not backend support.',
  );
  lines.push('- `·` — no committed fingerprint for this scene on this backend; no support claim is made.');
  lines.push('');
  lines.push(
    '> **A tick proves a realized target plus a deterministic capture — NOT that the realization is fully _correct_.** A partial effect (e.g. a screen-space effect with no G-buffer) can still yield a stable fingerprint. Correctness caveats are in *Declared gaps & caveats* below.',
  );
  lines.push('');

  // Coverage summary.
  const totals = BACKENDS.map(({ key, label }) => {
    let controls = 0;
    let fingerprints = 0;
    let realized = 0;
    for (const group of groups) {
      for (const scene of group.scenes) {
        const cell = scene.backends.find((backend) => backend.backend === key);
        if (cell?.fingerprinted) fingerprints++;
        if (cell?.status === 'control') controls++;
        if (cell?.status === 'realized') realized++;
      }
    }
    return { controls, fingerprints, label, realized };
  });
  const sceneCount = groups.reduce((sum, g) => sum + g.scenes.length, 0);
  lines.push('## Coverage summary');
  lines.push('');
  lines.push(`${sceneCount} functional scene IDs with committed baselines. Per-backend evidence:`);
  lines.push('');
  lines.push(`| Evidence | ${totals.map((total) => total.label).join(' | ')} |`);
  lines.push(`| --- | ${totals.map(() => '---').join(' | ')} |`);
  lines.push(
    `| Realized + fingerprinted | ${totals.map((total) => `${total.realized} / ${sceneCount}`).join(' | ')} |`,
  );
  lines.push(`| Captured controls | ${totals.map((total) => total.controls).join(' | ')} |`);
  lines.push(`| Fingerprints total | ${totals.map((total) => total.fingerprints).join(' | ')} |`);
  lines.push('');
  lines.push(
    'All four backends re-verify in-sandbox — WebGPU via SwiftShader software Vulkan. A small set of WebGPU scenes exceed the fingerprint tolerance on software-vs-hardware antialiasing differences; see [maturity-gaps](maturity-gaps.md).',
  );
  lines.push('');

  lines.push('## Declared gaps & caveats');
  lines.push('');
  lines.push(
    'Hand-authored (from the maturity audit): capabilities with **no functional scene** and cross-cutting caveats. See [maturity-gaps](maturity-gaps.md).',
  );
  lines.push('');
  lines.push('| Area | Capability | Status | Note |');
  lines.push('| --- | --- | --- | --- |');
  for (const g of [...DECLARED_GAPS].sort(
    (a, b) => a.area.localeCompare(b.area) || a.capability.localeCompare(b.capability),
  )) {
    lines.push(`| ${g.area} | ${g.capability} | \`${g.status}\` | ${g.note} |`);
  }
  lines.push('');

  lines.push('## Realized support verified by baseline (per area)');
  lines.push('');
  for (const g of groups) {
    lines.push(`### ${g.label}`);
    lines.push('');
    lines.push(`| Scene | ${BACKENDS.map((b) => b.label).join(' | ')} |`);
    lines.push(`| --- | ${BACKENDS.map(() => ':-:').join(' | ')} |`);
    for (const s of g.scenes) {
      lines.push(`| \`${s.scene}\` | ${s.backends.map(cellGlyph).join(' | ')} |`);
    }
    lines.push('');
  }
  // Every area appends one empty separator line, so joining already contributes the canonical single
  // newline at EOF. Appending another newline creates a blank line that `git diff --check` rejects.
  return lines.join('\n');
}

export function renderJson(groups: AreaGroup[]): string {
  const payload = {
    schemaVersion: 2,
    generatedBy: 'scripts/support.ts',
    note: 'realized means current scene discovery finds a feature realization and a fingerprint. control means a fingerprint exists without a realized target. unbaselined means no fingerprint, so no support claim is made.',
    states: {
      realized: 'Current functional target realizes the feature and has a committed fingerprint.',
      control: 'Fingerprint exists without a discoverable realized target; this is not backend support.',
      unbaselined: 'No committed fingerprint; no support claim is made.',
    },
    backends: BACKENDS.map((b) => ({ ...b, sandboxVerifiable: SANDBOX_VERIFIABLE.has(b.key) })),
    areas: groups.map((g) => ({
      key: g.key,
      label: g.label,
      scenes: g.scenes.map((s) => ({
        scene: s.scene,
        backends: Object.fromEntries(
          s.backends.map((backend) => [
            backend.backend,
            {
              status: backend.status,
              fingerprint: backend.fingerprinted,
              realization: backend.realization,
            },
          ]),
        ),
      })),
    })),
    declaredGaps: DECLARED_GAPS,
  };
  return JSON.stringify(payload, null, 2) + '\n';
}

function main(): void {
  const check = process.argv.includes('--check');
  const coverage = loadBaselineCoverage();
  const realizations = loadRealizationCoverage();
  const groups = buildGroups(coverage, realizations);
  const md = renderMarkdown(groups);
  const json = renderJson(groups);

  // Checked before drift: a stale matrix is a regeneration away, an orphaned fingerprint is a claim
  // with nothing behind it, and regenerating would happily render it as a mark.
  const orphans = findOrphanedBaselineFingerprints(coverage, loadTargetCoverage());
  if (check) {
    if (orphans.length > 0) {
      console.error(
        `support:check — ${orphans.length} committed fingerprint(s) have NO functional target, so they are ` +
          'evidence with no referent and cannot support any mark. Delete the key (or the baseline file), ' +
          'or add the missing scene target:',
      );
      for (const { scene, backend } of orphans) console.error(`  ${scene} [${backend}]`);
      process.exit(1);
    }
    let drift = false;
    for (const [path, next] of [
      [MATRIX_MD, md],
      [MATRIX_JSON, json],
    ] as const) {
      let current = '';
      try {
        current = readFileSync(path, 'utf8');
      } catch {
        current = '';
      }
      if (current !== next) {
        drift = true;
        console.error(`support:check — ${path.replace(REPO_ROOT + '/', '')} is stale. Run \`npm run support\`.`);
      }
    }
    if (drift) process.exit(1);
    console.log(`support:check — OK (${coverage.size} scenes, matrix current)`);
    return;
  }

  if (orphans.length > 0) {
    console.warn(`support — ${orphans.length} fingerprint(s) have no functional target; support:check will fail:`);
    for (const { scene, backend } of orphans) console.warn(`  ${scene} [${backend}]`);
  }
  writeFileSync(MATRIX_MD, md);
  writeFileSync(MATRIX_JSON, json);
  console.log(`support — wrote agents/support-matrix.{md,json} (${coverage.size} scenes)`);
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
