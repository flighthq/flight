import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import type { ReferenceImageCellComparison } from '../../scripts/reference-image-compare';
import { decodeOraclePng, hashOraclePixelBytes } from '../../scripts/reference-image-png';
import { getOracleRequestCells, readOracleRequest } from '../../scripts/reference-image-records';
import {
  compareReferenceImage,
  LEGACY_EXACT_COMPARISON_POLICY_ID,
  readReferenceImageToleranceCatalog,
  resolveReferenceImageTolerance,
  writeReferenceImageSceneTolerance,
  type ResolvedReferenceImageTolerance,
  type ReferenceImageSceneTolerance,
  type ReferenceImageToleranceCatalog,
} from '../../scripts/reference-image-tolerance';
import { workspacePackages } from '../../scripts/workspaces';
import { isReviewableCell, reviewableCells, reviewCellRole } from './src/cellRole';
import type { ReviewCellRole } from './src/cellRole';
import type { ReviewCommissionState as CommissionState } from './src/commissionState';
import { recordReviewHoldReleases, recordReviewHolds } from './src/holdLedger';
import type { ReviewHoldLedger } from './src/holdLedger';
import {
  createReferenceImageRequestTarget,
  isReviewRequestStillPending,
  resolveReferenceImageCommissionState,
} from './src/referenceImageCommission';
import { readRequiredReferenceImageCells } from './src/requiredReferenceImageCells';
import type { ReviewCoverageManifest } from './src/requiredReferenceImageCells';
import {
  sourceContainsExpectedDescription,
  sourceDeclaresFunctionalBackendControl,
  sourceWithheldExpectedDescription,
} from './src/sourceExpectedDescription';

const projectRoot = resolve(__dirname, '../..');
const artifactsDir = resolve(projectRoot, '.artifacts');
const reviewArtifactFiles = [
  join(artifactsDir, '*', '*', '*', 'screenshot.png'),
  join(artifactsDir, '*', '*', '*', 'status.json'),
];

const TOOL_ORDER = ['functional', 'examples', 'reference'];
const RENDERER_ORDER = ['dom', 'canvas', 'webgl', 'webgpu', 'control'];
const EXCLUDE_TOOLS = new Set(['site']);

interface ReviewCellProvenance {
  hostInstanceId: string | null;
  environmentId: string | null;
}

interface ReviewBuildProvenance {
  commit: string | null;
  dirty: string[];
  dirtyOmitted: number;
}

type ParityStatus = 'passed' | 'failed' | 'no-data';

interface ReviewCell {
  renderer: string;
  role: ReviewCellRole;
  state: 'ready' | 'error';
  error: string | null;
  changed: boolean | null;
  hash: string | null;
  referencePixelSha256: string | null;
  provenance: ReviewCellProvenance | null;
  build: ReviewBuildProvenance | null;
  commissionState: CommissionState | null;
  comparisonPolicy: ResolvedReferenceImageTolerance | null;
  referenceComparison: ReferenceImageCellComparison | null;
  referenceComparisonMatches: boolean | null;
  referenceComparisonMeasured: boolean;
  referenceComparisonProblem: string | null;
  holdReason: string | null;
  parityStatus: ParityStatus;
}

interface ReviewTest {
  tool: string;
  name: string;
  cells: ReviewCell[];
  expectedImageDescription?: string;
  sourceHasDescription: boolean;
  toleranceWritable: boolean;
  withheldReason?: string;
}

const lockPath = join(projectRoot, 'scripts', 'reference-image-lock.json');
const heldPath = join(projectRoot, 'scripts', 'reference-image-held.json');
const requestsDir = join(projectRoot, 'reference-image-requests');
const tolerancePaths = {
  captureIdentityPath: join(projectRoot, 'scripts', 'reference-image-capture-identity.json'),
  coverageManifestPath: join(projectRoot, 'scripts', 'capture-baseline-coverage-manifest.json'),
  manifestPath: join(projectRoot, 'scripts', 'reference-image-tolerances.json'),
};

const SCENE_DIRS: Record<string, string> = {
  functional: join(projectRoot, 'functional', 'scenes'),
};

const packsRoot = join(artifactsDir, 'reference-image-packs');

// The registered environment identity, read from the committed record rather than from a capture.
// `reference-image-capture.yml` reads the same file for the same reason: the id is owned by
// flight-reference-images and copied verbatim, so nothing local may derive or substitute one.
// Declares that each named cell now OWES a reference image. Mirrors `addReferenceImageCoverage` in
// reference-image-eligibility.ts, applied to the committed manifest rather than an in-memory copy.
function addReferenceImageCoverageForCells(cells: readonly string[]): number {
  const manifestPath = resolve(projectRoot, 'scripts', 'capture-baseline-coverage-manifest.json');
  if (!existsSync(manifestPath)) return 0;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      subjects?: Record<string, Record<string, string[]>>;
    };
    const functional = manifest.subjects?.['functional'];
    if (functional === undefined) return 0;
    let added = 0;
    for (const cell of cells) {
      const kinds = functional[cell];
      // A cell absent from coverage is not ours to invent — it means the manifest and the live corpus
      // disagree, which is a finding rather than something to paper over from a dev server.
      if (kinds === undefined || kinds.includes('referenceImage')) continue;
      kinds.push('referenceImage');
      kinds.sort();
      added++;
    }
    if (added > 0) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    return added;
  } catch {
    return 0;
  }
}

function readRegisteredEnvironmentId(): string | null {
  try {
    const raw = readFileSync(resolve(projectRoot, 'scripts', 'reference-image-capture-identity.json'), 'utf8');
    const parsed = JSON.parse(raw) as { environmentId?: string };
    return parsed.environmentId ?? null;
  } catch {
    return null;
  }
}

function readLockedImages(): Map<string, string> {
  const locked = new Map<string, string>();
  if (!existsSync(lockPath)) return locked;
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      packs?: Record<string, { images?: Record<string, { pixelSha256?: string }> }>;
    };
    if (lock.packs) {
      for (const pack of Object.values(lock.packs)) {
        if (!pack.images) continue;
        for (const [key, img] of Object.entries(pack.images)) {
          if (img.pixelSha256) locked.set(key, img.pixelSha256);
        }
      }
    }
  } catch {
    // ignore malformed lock
  }
  return locked;
}

function resolveReferenceImagePath(imageKey: string): string | null {
  if (!existsSync(lockPath)) return null;
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as {
      packs?: Record<string, { images?: Record<string, unknown> }>;
    };
    if (!lock.packs) return null;
    for (const [packId, pack] of Object.entries(lock.packs)) {
      if (!pack.images) continue;
      if (imageKey in pack.images) {
        const imgPath = join(packsRoot, packId, 'images', `${imageKey}.png`);
        if (existsSync(imgPath)) return imgPath;
        return null;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function readHeldCells(): Map<string, string> {
  const held = new Map<string, string>();
  if (!existsSync(heldPath)) return held;
  try {
    const data = JSON.parse(readFileSync(heldPath, 'utf8')) as {
      held?: Record<string, string>;
    };
    if (data.held) {
      for (const [key, reason] of Object.entries(data.held)) {
        held.set(key, reason);
      }
    }
  } catch {
    // ignore malformed held file
  }
  return held;
}

function readHoldLedger(): ReviewHoldLedger {
  if (!existsSync(heldPath)) return { schemaVersion: 2, held: {}, history: [] };
  const parsed = JSON.parse(readFileSync(heldPath, 'utf8')) as Partial<ReviewHoldLedger>;
  return { ...parsed, held: parsed.held ?? {} };
}

function writeHoldLedger(ledger: ReviewHoldLedger): void {
  writeFileSync(heldPath, JSON.stringify(ledger, null, 2) + '\n');
}

function reviewActor(): string {
  try {
    const name = execFileSync('git', ['config', 'user.name'], { cwd: projectRoot, encoding: 'utf8' }).trim();
    const email = execFileSync('git', ['config', 'user.email'], { cwd: projectRoot, encoding: 'utf8' }).trim();
    if (name.length > 0) return email.length > 0 ? `${name} <${email}>` : name;
  } catch {
    // Fall through to the local account identity only when this checkout has no Git identity.
  }
  return process.env['USER']?.trim() || 'unknown reviewer';
}

function readRequestedCells(): Map<string, string> {
  const requested = new Map<string, string>();
  if (!existsSync(requestsDir)) return requested;
  for (const file of readdirSync(requestsDir).filter((f) => f.endsWith('.json'))) {
    const result = readOracleRequest(join(requestsDir, file));
    if (!('request' in result)) continue;
    for (const target of result.request.targets) {
      requested.set(`${result.request.subject}/${target.entry}/${target.renderer}`, target.pixelSha256);
    }
  }
  return requested;
}

function readParityStatuses(): Map<string, ParityStatus> {
  const statuses = new Map<string, ParityStatus>();
  if (!existsSync(artifactsDir)) return statuses;

  for (const toolDir of readdirSync(artifactsDir, { withFileTypes: true })) {
    if (!toolDir.isDirectory() || EXCLUDE_TOOLS.has(toolDir.name)) continue;
    const reportPath = join(artifactsDir, toolDir.name, 'validation-report.json');
    if (!existsSync(reportPath)) continue;
    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
        result?: {
          checks?: readonly {
            entry: string;
            renderers?: readonly string[];
            kind: string;
            status: string;
          }[];
        };
      };
      const checks = report.result?.checks;
      if (!checks) continue;
      for (const check of checks) {
        if (check.kind !== 'parity' || !check.renderers) continue;
        const failed = check.status === 'failed';
        for (const renderer of check.renderers) {
          const key = `${toolDir.name}/${check.entry}/${renderer}`;
          const existing = statuses.get(key);
          if (failed || existing === undefined) {
            statuses.set(key, failed ? 'failed' : 'passed');
          }
        }
      }
    } catch {
      // ignore malformed report
    }
  }
  return statuses;
}

function sourceWithheldReason(tool: string, name: string, renderers: readonly string[]): string | null {
  const sceneDir = SCENE_DIRS[tool];
  if (!sceneDir) return null;
  const candidates = [`${name}.ts`, ...renderers.map((r) => `${name}.${r}.ts`)];
  for (const candidate of candidates) {
    const filePath = join(sceneDir, candidate);
    if (!existsSync(filePath)) continue;
    try {
      const reason = sourceWithheldExpectedDescription(readFileSync(filePath, 'utf8'));
      if (reason !== null) return reason;
    } catch {
      continue;
    }
  }
  return null;
}

function sourceHasExpectedDescription(tool: string, name: string, renderers: readonly string[]): boolean {
  const sceneDir = SCENE_DIRS[tool];
  if (!sceneDir) return false;
  const candidates = [`${name}.ts`, ...renderers.map((r) => `${name}.${r}.ts`)];
  for (const candidate of candidates) {
    const filePath = join(sceneDir, candidate);
    if (!existsSync(filePath)) continue;
    try {
      if (sourceContainsExpectedDescription(readFileSync(filePath, 'utf8'))) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function readRequiredReferenceImageCellsForTool(tool: string): Map<string, string[]> {
  try {
    return readRequiredReferenceImageCells(
      JSON.parse(readFileSync(tolerancePaths.coverageManifestPath, 'utf8')) as ReviewCoverageManifest,
      tool,
    );
  } catch {
    // A manifest we cannot read falls back to artifact-driven discovery, which is what this widens —
    // never a reason to show the reviewer nothing.
    return new Map();
  }
}

/** A required cell with no decodable capture: visible, never commissionable (it has no pixels). */
function createUncapturedReviewCell(tool: string, renderer: string, detail: string): ReviewCell {
  return {
    renderer,
    role: reviewCellRole(tool, renderer),
    state: 'error',
    error: detail,
    changed: null,
    hash: null,
    referencePixelSha256: null,
    provenance: null,
    build: null,
    commissionState: 'not-commissioned',
    comparisonPolicy: null,
    referenceComparison: null,
    referenceComparisonMatches: null,
    referenceComparisonMeasured: false,
    referenceComparisonProblem: null,
    holdReason: null,
    parityStatus: 'no-data',
  };
}

function functionalCellIsControl(tool: string, name: string, renderer: string): boolean {
  const sceneDir = SCENE_DIRS[tool];
  if (sceneDir === undefined) return false;
  const specific = join(sceneDir, `${name}.${renderer}.ts`);
  const generic = join(sceneDir, `${name}.ts`);
  const sourcePath = existsSync(specific) ? specific : generic;
  if (!existsSync(sourcePath)) return false;
  try {
    return sourceDeclaresFunctionalBackendControl(readFileSync(sourcePath, 'utf8'));
  } catch {
    return false;
  }
}

function resolveCommissionState(
  tool: string,
  name: string,
  renderer: string,
  cell: Pick<ReviewCell, 'hash' | 'referencePixelSha256'>,
  locked: ReadonlyMap<string, string>,
  requested: ReadonlyMap<string, string>,
  comparisonMatches: boolean | null,
): CommissionState {
  const imageKey = `${tool}/${name}/${renderer}`;
  const lockedHash = locked.get(imageKey);
  // A request whose pinned pixels no longer match this capture has been overtaken by the tree; it is not
  // a pending decision, it is a stale one, and the reviewer needs to be able to replace it. Superseding
  // makes that safe — the newer commission retires the older request rather than stacking a duplicate.
  const stillPending = isReviewRequestStillPending(requested.get(imageKey), cell.referencePixelSha256);
  return resolveReferenceImageCommissionState(cell, lockedHash, stillPending, comparisonMatches);
}

function discoverReviewTests(): ReviewTest[] {
  const toleranceCatalog = readToleranceCatalogOrThrow();
  if (!existsSync(artifactsDir)) return [];

  const locked = readLockedImages();
  const held = readHeldCells();
  const requested = readRequestedCells();
  const parity = readParityStatuses();

  const toolFilter = process.env['VITE_REVIEW_TOOL'];
  const toolDirs = readdirSync(artifactsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !EXCLUDE_TOOLS.has(d.name) && (!toolFilter || d.name === toolFilter))
    .sort((a, b) => {
      const ai = TOOL_ORDER.indexOf(a.name);
      const bi = TOOL_ORDER.indexOf(b.name);
      const aRank = ai === -1 ? Infinity : ai;
      const bRank = bi === -1 ? Infinity : bi;
      return aRank !== bRank ? aRank - bRank : a.name.localeCompare(b.name);
    });

  const results: ReviewTest[] = [];

  for (const toolDir of toolDirs) {
    const tool = toolDir.name;
    const toolPath = join(artifactsDir, tool);
    const requiredCells = readRequiredReferenceImageCellsForTool(tool);

    const captured = readdirSync(toolPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    // Union, not concatenation: a required scene that captured nothing at all has no directory here, and
    // that is precisely the case where staying artifact-driven shows the reviewer an empty list.
    const names = [...new Set([...captured, ...requiredCells.keys()])].sort();

    for (const name of names) {
      const testPath = join(toolPath, name);
      const cells: ReviewCell[] = [];
      let expectedImageDescription: string | undefined;

      const rendererDirs = (existsSync(testPath) ? readdirSync(testPath, { withFileTypes: true }) : [])
        .filter((d) => d.isDirectory())
        .sort((a, b) => {
          const ai = RENDERER_ORDER.indexOf(a.name);
          const bi = RENDERER_ORDER.indexOf(b.name);
          const aRank = ai === -1 ? Infinity : ai;
          const bRank = bi === -1 ? Infinity : bi;
          return aRank !== bRank ? aRank - bRank : a.name.localeCompare(b.name);
        });

      for (const rendererDir of rendererDirs) {
        const renderer = rendererDir.name;
        // Unsupported controls still run assertions and produce fingerprints, so their artifacts exist.
        // They are not review subjects: a deliberately different column would dilute the disagreement
        // signal this tool asks a reviewer to inspect.
        if (functionalCellIsControl(tool, name, renderer)) continue;
        const role = reviewCellRole(tool, renderer);
        const rendererPath = join(testPath, renderer);
        const screenshotPath = join(rendererPath, 'screenshot.png');
        const statusPath = join(rendererPath, 'status.json');

        if (!existsSync(screenshotPath)) {
          if (requiredCells.get(name)?.includes(renderer) === true) {
            cells.push(createUncapturedReviewCell(tool, renderer, 'required, but this run produced no screenshot.png'));
          }
          continue;
        }

        let state: 'ready' | 'error' = 'ready';
        let error: string | null = null;
        let changed: boolean | null = null;
        let hash: string | null = null;
        let referencePixelSha256: string | null = null;
        let decodedCandidate: ReturnType<typeof decodeOraclePng> | null = null;
        let provenance: ReviewCellProvenance | null = null;
        let build: ReviewBuildProvenance | null = null;
        let cellDescription: string | undefined;

        if (existsSync(statusPath)) {
          try {
            const s = JSON.parse(readFileSync(statusPath, 'utf8')) as {
              state?: string;
              error?: string;
              changed?: boolean;
              hash?: string;
              provenance?: { hostInstanceId?: string; environmentId?: string };
              build?: { commit?: string | null; dirty?: unknown; dirtyOmitted?: number };
              expectedImageDescription?: string;
            };
            if (s.state === 'error') state = 'error';
            error = s.error ?? null;
            changed = s.changed ?? null;
            hash = s.hash ?? null;
            if (s.provenance) {
              provenance = {
                hostInstanceId: s.provenance.hostInstanceId ?? null,
                environmentId: s.provenance.environmentId ?? null,
              };
            }
            if (
              (s.build?.commit === null ||
                (typeof s.build?.commit === 'string' && /^[0-9a-f]{40}$/.test(s.build.commit))) &&
              Array.isArray(s.build?.dirty) &&
              s.build.dirty.every((path) => typeof path === 'string') &&
              typeof s.build.dirtyOmitted === 'number' &&
              Number.isInteger(s.build.dirtyOmitted) &&
              s.build.dirtyOmitted >= 0
            ) {
              build = { commit: s.build.commit, dirty: [...s.build.dirty], dirtyOmitted: s.build.dirtyOmitted };
            }
            cellDescription = s.expectedImageDescription;
          } catch {
            // ignore malformed status
          }
        }

        try {
          decodedCandidate = decodeOraclePng(readFileSync(screenshotPath));
          if ('png' in decodedCandidate) referencePixelSha256 = hashOraclePixelBytes(decodedCandidate.png.data);
        } catch {
          // A missing or unreadable reference-domain identity is not interchangeable with status.hash.
        }

        if (role === 'reviewable' && cellDescription !== undefined && expectedImageDescription === undefined) {
          expectedImageDescription = cellDescription;
        }
        const imageKey = `${tool}/${name}/${renderer}`;
        const comparisonPolicy =
          role === 'reviewable' ? resolveReferenceImageTolerance(toleranceCatalog, imageKey) : null;
        let referenceComparison: ReferenceImageCellComparison | null = null;
        let referenceComparisonMatches: boolean | null = null;
        let referenceComparisonMeasured = false;
        let referenceComparisonProblem: string | null = null;
        const lockedHash = locked.get(imageKey);
        if (comparisonPolicy !== null && lockedHash !== undefined) {
          if (decodedCandidate === null || 'refused' in decodedCandidate) {
            referenceComparisonProblem = 'candidate capture is not decodable in the reference-image domain';
          } else {
            const referencePath = resolveReferenceImagePath(imageKey);
            let decodedReference: ReturnType<typeof decodeOraclePng> | null = null;
            if (referencePath !== null) {
              try {
                decodedReference = decodeOraclePng(readFileSync(referencePath));
                if ('refused' in decodedReference) {
                  referenceComparisonProblem = `blessed reference is not decodable: ${decodedReference.refused}`;
                  decodedReference = null;
                }
              } catch (error) {
                referenceComparisonProblem = `blessed reference could not be read: ${String(error)}`;
              }
            }
            if (referenceComparisonProblem === null) {
              const compared = compareReferenceImage(
                decodedCandidate.png,
                lockedHash,
                decodedReference !== null && 'png' in decodedReference ? decodedReference.png : null,
                comparisonPolicy,
              );
              if ('problem' in compared) {
                referenceComparisonProblem = compared.problem;
              } else {
                referenceComparison = compared.comparison;
                referenceComparisonMatches = compared.matches;
                referenceComparisonMeasured = compared.measured;
              }
            }
            if (referenceComparisonProblem !== null) referenceComparisonMatches = false;
          }
        }
        const commissionState =
          role === 'reviewable'
            ? resolveCommissionState(
                tool,
                name,
                renderer,
                { hash, referencePixelSha256 },
                locked,
                requested,
                referenceComparisonMatches,
              )
            : null;
        const holdReason = role === 'reviewable' ? (held.get(imageKey) ?? null) : null;
        const parityStatus: ParityStatus = parity.get(imageKey) ?? 'no-data';
        cells.push({
          renderer,
          role,
          state,
          error,
          changed,
          hash,
          referencePixelSha256,
          provenance,
          build,
          commissionState,
          comparisonPolicy,
          referenceComparison,
          referenceComparisonMatches,
          referenceComparisonMeasured,
          referenceComparisonProblem,
          holdReason,
          parityStatus,
        });
      }

      for (const renderer of requiredCells.get(name) ?? []) {
        if (cells.some((cell) => cell.renderer === renderer)) continue;
        if (functionalCellIsControl(tool, name, renderer)) continue;
        cells.push(createUncapturedReviewCell(tool, renderer, 'required, but this run captured no cell at all'));
      }

      if (cells.some(isReviewableCell)) {
        const renderers = reviewableCells(cells).map((cell) => cell.renderer);
        const hasDesc = sourceHasExpectedDescription(tool, name, renderers);
        const withheld = sourceWithheldReason(tool, name, renderers);
        const entry: ReviewTest = {
          tool,
          name,
          cells,
          sourceHasDescription: hasDesc,
          toleranceWritable: toleranceCatalog.comparisonPolicyId !== LEGACY_EXACT_COMPARISON_POLICY_ID,
        };
        if (withheld !== null) entry.withheldReason = withheld;
        if (expectedImageDescription !== undefined) entry.expectedImageDescription = expectedImageDescription;
        results.push(entry);
      }
    }
  }

  return results;
}

function readToleranceCatalogOrThrow(): ReferenceImageToleranceCatalog {
  const result = readReferenceImageToleranceCatalog(tolerancePaths);
  if ('catalog' in result) return result.catalog;
  throw new Error(
    `Invalid reference-image tolerance catalog:\n${result.problems
      .map((problem) => `  ${problem.path}: ${problem.detail}`)
      .join('\n')}`,
  );
}

function reviewPlugin(): Plugin[] {
  return [
    {
      name: 'review:manifest',

      resolveId(source) {
        if (source === 'virtual:review-manifest') return '\0virtual:review-manifest';
      },

      load(id) {
        if (id !== '\0virtual:review-manifest') return;
        return `export const tests = ${JSON.stringify(discoverReviewTests())};`;
      },

      configureServer(server) {
        if (existsSync(artifactsDir)) {
          // Capture output also contains logs and transient files. Watch only the two fixed-depth
          // files that can change the manifest instead of recursively subscribing to the artifact tree.
          server.watcher.add(reviewArtifactFiles);
          const refresh = (file: string) => {
            if (!file.endsWith('screenshot.png') && !file.endsWith('status.json')) return;
            const mod = server.moduleGraph.getModuleById('\0virtual:review-manifest');
            if (mod) server.moduleGraph.invalidateModule(mod);
            server.ws.send({ type: 'full-reload' });
          };
          server.watcher.on('add', refresh);
          server.watcher.on('change', refresh);
        }

        // Requests can also arrive from outside the UI — `reference-image:commission:write` files them
        // from the CLI. Without this the tool would keep offering a Commission button for a scene that
        // already has a queued request, which is the same stale-state defect one layer out.
        // Watch the directory and filter events ourselves so externally-written requests use the same
        // targeted client update as requests filed through the review UI.
        server.watcher.add(requestsDir);
        server.watcher.on('add', (file: string) => {
          if (!file.startsWith(requestsDir) || !file.endsWith('.json')) return;
          const request = readOracleRequest(file);
          if ('problems' in request) return;
          const mod = server.moduleGraph.getModuleById('\0virtual:review-manifest');
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({
            type: 'custom',
            event: 'review:commission-requested',
            data: { cells: getOracleRequestCells(request.request) },
          });
        });

        // ★ A REQUEST LEAVING THE QUEUE IS A STATE CHANGE TOO, AND ONLY ARRIVALS WERE WATCHED. Clearing
        // the queue left every affected cell reading "Request pending" with its Commission button
        // disabled until the dev server was restarted — the tool reporting a queue that no longer
        // existed. `unlink` cannot say which cells were freed, because the file is already gone by the
        // time we hear about it, so this invalidates and reloads rather than sending a targeted update.
        server.watcher.on('unlink', (file: string) => {
          if (!file.startsWith(requestsDir) || !file.endsWith('.json')) return;
          const mod = server.moduleGraph.getModuleById('\0virtual:review-manifest');
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        });

        server.watcher.add(tolerancePaths.manifestPath);
        server.watcher.on('change', (file: string) => {
          if (file !== tolerancePaths.manifestPath) return;
          const mod = server.moduleGraph.getModuleById('\0virtual:review-manifest');
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        });

        server.middlewares.use((req, res, next) => {
          const urlPath = (req.url ?? '/').split('?')[0];

          if (req.method === 'POST' && urlPath === '/api/commission') {
            let body = '';
            req.on('data', (chunk: Buffer) => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body) as {
                  tool: string;
                  entry: string;
                  cells: readonly {
                    renderer: string;
                    pixelSha256: string | null;
                    hostInstanceId: string | null;
                    environmentId: string | null;
                    build: ReviewBuildProvenance | null;
                  }[];
                  reason: string;
                };
                if (!payload.tool || !payload.entry || !payload.cells?.length) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'missing required fields: tool, entry, cells' }));
                  return;
                }
                const referenceRenderers = payload.cells
                  .filter((cell) => reviewCellRole(payload.tool, cell.renderer) === 'reference')
                  .map((cell) => cell.renderer);
                if (referenceRenderers.length > 0) {
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      error: `reference cells are context-only and cannot be commissioned: ${referenceRenderers.join(', ')}`,
                    }),
                  );
                  return;
                }

                // The environment identity is REGISTERED, never derived from a capture: it is owned by
                // flight-reference-images and copied verbatim into capture-identity.json. A local capture
                // has no FLIGHT_CAPTURE_ENVIRONMENT_ID, so reading it from provenance rejected every
                // locally-captured cell — the workflow reads the file for the same reason.
                const registeredEnvironmentId = readRegisteredEnvironmentId();
                // A cell without a reference-domain pixel hash has no decodable screenshot to commission;
                // it is filtered below. A cell WITH captured pixels but no build stamp is different: the
                // build already happened, and the missing step is to capture again so status.json records
                // that completed build.
                // ★ THE LEDGER IS THE AUTHORITY ON WHAT IS HELD, NOT THE PAGE. The client already leaves
                // held cells out of the payload, but a hold recorded after the page loaded — or by another
                // reviewer — would otherwise be commissioned by a stale tab. Dropping them here costs one
                // read and makes the held file the single place the answer comes from.
                const heldNow = readHeldCells();
                const heldSkipped = payload.cells
                  .filter((c) => heldNow.has(`${payload.tool}/${payload.entry}/${c.renderer}`))
                  .map((c) => c.renderer);
                const openCells = payload.cells.filter(
                  (c) => !heldNow.has(`${payload.tool}/${payload.entry}/${c.renderer}`),
                );
                const capturedCells = openCells.filter((c) => c.pixelSha256 !== null);
                const noBuild = capturedCells.filter((c) => c.build === null).length;
                const unstamped = capturedCells.filter((c) => c.build?.commit === null).length;
                if (noBuild + unstamped > 0) {
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      error: `${noBuild + unstamped} captured cell(s) of ${payload.entry} have no usable build stamp — re-capture now that the build is complete`,
                    }),
                  );
                  return;
                }
                const eligible = openCells.filter(
                  (
                    c,
                  ): c is typeof c & {
                    pixelSha256: string;
                    hostInstanceId: string;
                    build: ReviewBuildProvenance & { commit: string };
                  } =>
                    c.pixelSha256 !== null && c.hostInstanceId !== null && c.build !== null && c.build.commit !== null,
                );
                if (eligible.length === 0) {
                  const noHash = openCells.filter((c) => c.pixelSha256 === null).length;
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      error:
                        openCells.length === 0
                          ? `every cell of ${payload.entry} is held (${heldSkipped.join(', ')}) — release a hold, or commission a scene with an open cell`
                          : noHash === openCells.length
                            ? `no reference pixel hash for any cell of ${payload.entry} — the screenshot is absent or cannot be decoded. Capture the cells before commissioning`
                            : 'no eligible cells: every cell needs a reference pixel hash and a host identity',
                    }),
                  );
                  return;
                }

                const build = eligible[0]!.build;
                const mixedBuild = eligible.some(
                  (cell) =>
                    cell.build.commit !== build.commit ||
                    cell.build.dirtyOmitted !== build.dirtyOmitted ||
                    JSON.stringify(cell.build.dirty) !== JSON.stringify(build.dirty),
                );
                if (mixedBuild) {
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      error: 'selected cells came from different static builds — rebuild and recapture them together',
                    }),
                  );
                  return;
                }

                const id = randomUUID();
                const request = {
                  schemaVersion: 3 as const,
                  id,
                  subject: payload.tool,
                  targets: eligible.map((c) =>
                    createReferenceImageRequestTarget(payload.entry, c, registeredEnvironmentId),
                  ),
                  frames: 1,
                  reason: payload.reason || 'Commissioned from review',
                  // Orders two requests that claim one cell, so the gate can prefer the newer instead of
                  // failing. File mtime cannot serve — a fresh checkout stamps every file with today.
                  createdAt: new Date().toISOString(),
                };

                const queueDir = join(projectRoot, 'reference-image-requests');
                mkdirSync(queueDir, { recursive: true });

                // ★ A COMMISSION NEVER EDITS ANOTHER REQUEST FILE. It used to narrow or delete the
                // requests it superseded, which is safe only for a request nobody has reviewed — and
                // Flight cannot tell. An approval binds to the exact bytes Oracle reviewed, so rewriting
                // a released request changed its checksum and reconciliation refused to write the lock.
                // Deleting one is no better: intake removes a released request itself on completion, and
                // removing it here strands the approval with nothing to complete against.
                //
                // Coexistence is safe now because the GATE resolves an overlap instead of failing it:
                // two requests claiming one cell settle to the newer, which is this one. The queue is
                // append-only from Flight's side; the store owns removal.
                const outPath = join(queueDir, `${id}.json`);
                writeFileSync(outPath, JSON.stringify(request, null, 2) + '\n');

                // §7 step 1 commissions with TWO artifacts, not one: the request AND the cell's
                // `referenceImage` coverage identity. Writing only the request produced 31
                // `request-off-target` failures in CI — `reference-image-check` treats a cell as required
                // only when the coverage manifest names that kind, so an uncovered request reads as
                // naming a cell nobody is watching. The request is the ask; the coverage is what makes
                // the cell answerable.
                const coverageAdded = addReferenceImageCoverageForCells(
                  eligible.map((c) => `${payload.entry}/${c.renderer}`),
                );

                // Tell every connected review client exactly which cells changed. The requesting client
                // also patches from this response, so neither path relies on a file-watcher race and no
                // page teardown destroys review context.
                const manifestModule = server.moduleGraph.getModuleById('\0virtual:review-manifest');
                if (manifestModule) server.moduleGraph.invalidateModule(manifestModule);
                server.ws.send({
                  type: 'custom',
                  event: 'review:commission-requested',
                  data: { cells: eligible.map((cell) => `${payload.tool}/${payload.entry}/${cell.renderer}`) },
                });

                res.setHeader('Content-Type', 'application/json');
                // Report the COUNT, not just the path. Ineligible cells are filtered out above, so a
                // request can legitimately cover a subset of the scene — and "Written: <path>" told the
                // user nothing about which. A success message narrower than its reader believes is the
                // same defect as a silent drop, one layer up.
                res.end(
                  JSON.stringify({
                    id,
                    path: relative(projectRoot, outPath),
                    committed: eligible.length,
                    coverageAdded,
                    total: payload.cells.length,
                    held: heldSkipped,
                    skipped: openCells.filter((c) => c.pixelSha256 === null).map((c) => c.renderer),
                    buildCommit: build.commit,
                    dirty: build.dirty,
                    dirtyOmitted: build.dirtyOmitted,
                  }),
                );
              } catch {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'invalid JSON body' }));
              }
            });
            return;
          }

          if ((req.method === 'POST' || req.method === 'DELETE') && urlPath === '/api/hold') {
            let body = '';
            req.on('data', (chunk: Buffer) => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body) as {
                  tool: string;
                  entry: string;
                  renderers: readonly string[];
                  reason: string;
                };
                if (!payload.tool || !payload.entry || !payload.renderers?.length) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'missing required fields: tool, entry, renderers' }));
                  return;
                }
                if (!payload.reason || payload.reason.trim().length === 0) {
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      error: req.method === 'DELETE' ? 'a release requires a reason' : 'a hold requires a reason',
                    }),
                  );
                  return;
                }
                const referenceRenderers = payload.renderers.filter(
                  (renderer) => reviewCellRole(payload.tool, renderer) === 'reference',
                );
                if (referenceRenderers.length > 0) {
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      error: `reference cells are context-only and cannot be held: ${referenceRenderers.join(', ')}`,
                    }),
                  );
                  return;
                }

                const heldData = readHoldLedger();
                const requestedKeys = payload.renderers.map(
                  (renderer) => `${payload.tool}/${payload.entry}/${renderer}`,
                );
                const actor = reviewActor();
                const at = new Date().toISOString();
                const keys =
                  req.method === 'DELETE'
                    ? recordReviewHoldReleases(heldData, requestedKeys, actor, payload.reason, at)
                    : recordReviewHolds(heldData, requestedKeys, actor, payload.reason, at);

                writeHoldLedger(heldData);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ actor, keys, path: relative(projectRoot, heldPath) }));
              } catch (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'invalid JSON body' }));
              }
            });
            return;
          }

          if ((req.method === 'PUT' || req.method === 'DELETE') && urlPath === '/api/tolerance') {
            let body = '';
            req.on('data', (chunk: Buffer) => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body) as {
                  tool?: string;
                  entry?: string;
                  tolerance?: ReferenceImageSceneTolerance;
                };
                if (!payload.tool || !payload.entry) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'missing required fields: tool, entry' }));
                  return;
                }
                if (req.method === 'PUT' && payload.tolerance === undefined) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'a tolerance declaration with a reason is required' }));
                  return;
                }
                const scene = `${payload.tool}/${payload.entry}`;
                const updated = writeReferenceImageSceneTolerance(
                  tolerancePaths,
                  scene,
                  req.method === 'DELETE' ? null : payload.tolerance!,
                );
                if ('problems' in updated) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(
                    JSON.stringify({
                      error: updated.problems.map((problem) => `${problem.path}: ${problem.detail}`).join('; '),
                    }),
                  );
                  return;
                }

                const manifestModule = server.moduleGraph.getModuleById('\0virtual:review-manifest');
                if (manifestModule) server.moduleGraph.invalidateModule(manifestModule);
                server.ws.send({ type: 'full-reload' });
                res.setHeader('Content-Type', 'application/json');
                res.end(
                  JSON.stringify({
                    path: relative(projectRoot, tolerancePaths.manifestPath),
                    policy: resolveReferenceImageTolerance(updated.catalog, `${scene}/__review__`),
                  }),
                );
              } catch (error) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'invalid JSON body' }));
              }
            });
            return;
          }

          if (urlPath.startsWith('/reference/')) {
            const imageKey = urlPath.slice('/reference/'.length).replace(/\.png$/, '');
            const fsPath = resolveReferenceImagePath(imageKey);
            if (fsPath) {
              res.setHeader('Content-Type', 'image/png');
              res.end(readFileSync(fsPath));
            } else {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'reference image not found — run npm run reference-image:fetch' }));
            }
            return;
          }

          if (!urlPath.startsWith('/artifacts/')) return next();

          const rel = urlPath.slice('/artifacts/'.length);
          const fsPath = join(artifactsDir, rel);

          if (relative(artifactsDir, fsPath).startsWith('..')) return next();
          if (!existsSync(fsPath)) return next();

          const ext = fsPath.split('.').pop() ?? '';
          const mime: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            json: 'application/json',
            jsonl: 'text/plain',
          };

          res.setHeader('Content-Type', mime[ext] ?? 'application/octet-stream');
          res.end(readFileSync(fsPath));
        });
      },
    },
  ];
}

export default defineConfig(() => {
  const alias = Object.fromEntries(workspacePackages.map((pkg) => [pkg.name, pkg.dir + '/src']));

  return {
    root: __dirname,
    base: process.env.VITE_BASE ?? '/',

    plugins: reviewPlugin(),

    resolve: { alias, preserveSymlinks: false },

    optimizeDeps: {
      exclude: workspacePackages.map((p) => p.name),
    },

    server: {
      fs: { allow: [projectRoot, artifactsDir] },
    },
  };
});
