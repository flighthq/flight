// Generates the Flight backend support matrix from GROUND TRUTH, so it cannot silently rot.
//
// Two sources feed it:
//   1. DERIVED (authoritative) — every committed functional baseline under `functional/baselines/*.json`
//      carries a per-backend fingerprint (`canvas` / `dom` / `webgl` / `webgpu`). A fingerprint's
//      presence is proof the scene rendered deterministically on that backend and was captured; its
//      absence is proof it was not. This is machine truth and no one edits it by hand.
//   2. DECLARED (overlay) — the small `DECLARED_GAPS` table below records capabilities that have NO
//      functional scene yet (so the baselines cannot speak to them) and cross-cutting caveats. This is
//      the only hand-authored part; keep it short and honest.
//
// Run `npm run support` to regenerate `agents/support-matrix.md` + `agents/support-matrix.json`.
// `npm run support:check` (wired into `npm run check`) regenerates in memory and fails if the committed
// files differ — the same generate-and-diff guard as `order:check`, so the matrix can never drift from
// the baselines without CI catching it.
//
// IMPORTANT semantic caveat, baked into the generated doc: a present fingerprint proves "renders
// deterministically and was captured", NOT "renders correctly". A stub/passthrough effect still
// produces a stable fingerprint. Correctness caveats live in DECLARED_GAPS.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const BASELINES_DIR = join(REPO_ROOT, 'functional', 'baselines');
const MATRIX_MD = join(REPO_ROOT, 'agents', 'support-matrix.md');
const MATRIX_JSON = join(REPO_ROOT, 'agents', 'support-matrix.json');

const BACKENDS = [
  { key: 'canvas', label: 'Canvas' },
  { key: 'dom', label: 'DOM' },
  { key: 'webgl', label: 'WebGL' },
  { key: 'webgpu', label: 'WebGPU' },
] as const;

// Backends an agent can re-verify inside the Docker Sbx sandbox today (proven 2026-07-17). WebGPU is
// blind here — software Vulkan, no GPU passthrough — so its fingerprints are HOST-captured and cannot be
// re-checked in-sandbox. Rendered into the doc so a green agent run never implies WebGPU was verified.
const SANDBOX_VERIFIABLE = new Set(['canvas', 'dom', 'webgl']);

// Human-readable area label per scene-id prefix (the first '-' segment). Unlisted prefixes title-case.
const AREA_LABELS: Record<string, string> = {
  bitmap: 'Bitmaps',
  camera: 'Camera',
  clip: 'Clipping',
  color: 'Color / Adjustments',
  displayobject: 'Display Object',
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
    capability: 'GPU skinning — PBR / toon / unlit / matcap families',
    status: 'not-implemented',
    note: 'HAS_SKIN wired only for the classic prelude on WebGL; other families fall back to CPU deform. WebGPU: none.',
  },
  {
    area: 'Skinning',
    capability: 'Morph targets / blend shapes / IK / blend trees',
    status: 'not-implemented',
    note: 'skeleton3d Phase 4, chartered separately, not built.',
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
    status: 'not-implemented',
    note: 'Containers parse to descriptors; no transcoder or compressed-GPU upload on any backend.',
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
  backend: string;
  baselined: boolean;
  sandboxVerifiable: boolean;
}
interface SceneRow {
  scene: string;
  backends: BackendCell[];
}
interface AreaGroup {
  key: string;
  label: string;
  scenes: SceneRow[];
}

function loadBaselineCoverage(): Map<string, Set<string>> {
  const coverage = new Map<string, Set<string>>();
  const files = readdirSync(BASELINES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const file of files) {
    const scene = file.replace(/\.json$/, '');
    const data = JSON.parse(readFileSync(join(BASELINES_DIR, file), 'utf8')) as Record<string, unknown>;
    const present = new Set<string>();
    for (const { key } of BACKENDS) {
      if (data[key] != null) present.add(key);
    }
    coverage.set(scene, present);
  }
  return coverage;
}

function buildGroups(coverage: Map<string, Set<string>>): AreaGroup[] {
  const byArea = new Map<string, SceneRow[]>();
  for (const [scene, present] of coverage) {
    const areaKey = scene.split('-')[0];
    const row: SceneRow = {
      scene,
      backends: BACKENDS.map(({ key }) => ({
        backend: key,
        baselined: present.has(key),
        sandboxVerifiable: SANDBOX_VERIFIABLE.has(key),
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

function cellGlyph(cell: BackendCell): string {
  if (!cell.baselined) return '·'; // no baseline for this backend
  return cell.sandboxVerifiable ? '✓' : '✓ᴴ'; // ᴴ = host-captured, not re-verifiable in-sandbox
}

function renderMarkdown(groups: AreaGroup[]): string {
  const lines: string[] = [];
  lines.push(
    '<!-- GENERATED by `npm run support` from functional/baselines + scripts/support.ts DECLARED_GAPS. Do not edit by hand. -->',
  );
  lines.push('');
  lines.push('# Flight SDK — Backend Support Matrix');
  lines.push('');
  lines.push('Derived from committed functional baselines (ground truth), regenerated by `npm run support` and');
  lines.push('drift-gated by `npm run support:check` (part of `npm run check`).');
  lines.push('');
  lines.push('## Legend');
  lines.push('');
  lines.push(
    '- `✓` — a committed functional-baseline fingerprint exists for this scene×backend, and the backend is **re-verifiable in-sandbox** (Canvas/DOM/WebGL).',
  );
  lines.push(
    '- `✓ᴴ` — a fingerprint exists but was **host-captured**; WebGPU is blind in the Docker Sbx sandbox (software Vulkan, no GPU passthrough), so it cannot be re-verified by an agent here.',
  );
  lines.push('- `·` — no committed baseline for this scene on this backend.');
  lines.push('');
  lines.push(
    '> **A fingerprint proves the scene renders deterministically and was captured — NOT that it renders _correctly_.** A stub/passthrough (e.g. a screen-space effect with no G-buffer) still yields a stable fingerprint. Correctness caveats are in *Declared gaps & caveats* below.',
  );
  lines.push('');

  // Coverage summary.
  const totals = BACKENDS.map(({ key, label }) => {
    let n = 0;
    for (const g of groups) for (const s of g.scenes) if (s.backends.find((b) => b.backend === key)?.baselined) n++;
    return { label, n };
  });
  const sceneCount = groups.reduce((sum, g) => sum + g.scenes.length, 0);
  lines.push('## Coverage summary');
  lines.push('');
  lines.push(`${sceneCount} functional scenes with committed baselines. Scenes carrying a fingerprint per backend:`);
  lines.push('');
  lines.push(`| ${totals.map((t) => t.label).join(' | ')} |`);
  lines.push(`| ${totals.map(() => '---').join(' | ')} |`);
  lines.push(`| ${totals.map((t) => `${t.n} / ${sceneCount}`).join(' | ')} |`);
  lines.push('');
  lines.push('WebGPU counts are host-captured (`✓ᴴ`) and not re-verifiable in-sandbox.');
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

  lines.push('## Verified-by-baseline (per area)');
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
  return lines.join('\n') + '\n';
}

function renderJson(groups: AreaGroup[]): string {
  const payload = {
    generatedBy: 'scripts/support.ts',
    note: 'A backend fingerprint proves deterministic render + capture, not correctness. WebGPU is host-captured and not re-verifiable in the Docker Sbx sandbox.',
    backends: BACKENDS.map((b) => ({ ...b, sandboxVerifiable: SANDBOX_VERIFIABLE.has(b.key) })),
    areas: groups.map((g) => ({
      key: g.key,
      label: g.label,
      scenes: g.scenes.map((s) => ({
        scene: s.scene,
        backends: Object.fromEntries(s.backends.map((b) => [b.backend, b.baselined])),
      })),
    })),
    declaredGaps: DECLARED_GAPS,
  };
  return JSON.stringify(payload, null, 2) + '\n';
}

function main(): void {
  const check = process.argv.includes('--check');
  const coverage = loadBaselineCoverage();
  const groups = buildGroups(coverage);
  const md = renderMarkdown(groups);
  const json = renderJson(groups);

  if (check) {
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

  writeFileSync(MATRIX_MD, md);
  writeFileSync(MATRIX_JSON, json);
  console.log(`support — wrote agents/support-matrix.{md,json} (${coverage.size} scenes)`);
}

main();
