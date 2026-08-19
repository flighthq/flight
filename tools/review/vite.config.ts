import { randomUUID } from 'node:crypto';

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

import { getOracleRequestCells, readOracleRequest } from '../../scripts/reference-image-records';
import { workspacePackages } from '../../scripts/workspaces';
import { isReviewableCell, reviewableCells, reviewCellRole } from './src/cellRole';
import type { ReviewCellRole } from './src/cellRole';
import type { ReviewCommissionState as CommissionState } from './src/commissionState';
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
  provenance: ReviewCellProvenance | null;
  build: ReviewBuildProvenance | null;
  commissionState: CommissionState | null;
  holdReason: string | null;
  parityStatus: ParityStatus;
}

interface ReviewTest {
  tool: string;
  name: string;
  cells: ReviewCell[];
  expectedImageDescription?: string;
  sourceHasDescription: boolean;
  withheldReason?: string;
}

const lockPath = join(projectRoot, 'scripts', 'reference-image-lock.json');
const heldPath = join(projectRoot, 'scripts', 'reference-image-held.json');
const requestsDir = join(projectRoot, 'reference-image-requests');

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

function readRequestedCells(): Set<string> {
  const requested = new Set<string>();
  if (!existsSync(requestsDir)) return requested;
  for (const file of readdirSync(requestsDir).filter((f) => f.endsWith('.json'))) {
    const result = readOracleRequest(join(requestsDir, file));
    if ('request' in result) {
      for (const cell of getOracleRequestCells(result.request)) {
        requested.add(cell);
      }
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
  hash: string | null,
  locked: ReadonlyMap<string, string>,
  requested: ReadonlySet<string>,
): CommissionState {
  const imageKey = `${tool}/${name}/${renderer}`;
  const lockedHash = locked.get(imageKey);
  if (lockedHash !== undefined) {
    return hash !== null && hash === lockedHash ? 'included' : 'differs';
  }
  if (requested.has(imageKey)) return 'requested';
  return 'not-commissioned';
}

function discoverReviewTests(): ReviewTest[] {
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

    const names = readdirSync(toolPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    for (const name of names) {
      const testPath = join(toolPath, name);
      const cells: ReviewCell[] = [];
      let expectedImageDescription: string | undefined;

      const rendererDirs = readdirSync(testPath, { withFileTypes: true })
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

        if (!existsSync(screenshotPath)) continue;

        let state: 'ready' | 'error' = 'ready';
        let error: string | null = null;
        let changed: boolean | null = null;
        let hash: string | null = null;
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

        if (role === 'reviewable' && cellDescription !== undefined && expectedImageDescription === undefined) {
          expectedImageDescription = cellDescription;
        }
        const commissionState =
          role === 'reviewable' ? resolveCommissionState(tool, name, renderer, hash, locked, requested) : null;
        const imageKey = `${tool}/${name}/${renderer}`;
        const holdReason = role === 'reviewable' ? (held.get(imageKey) ?? null) : null;
        const parityStatus: ParityStatus = parity.get(imageKey) ?? 'no-data';
        cells.push({
          renderer,
          role,
          state,
          error,
          changed,
          hash,
          provenance,
          build,
          commissionState,
          holdReason,
          parityStatus,
        });
      }

      if (cells.some(isReviewableCell)) {
        const renderers = reviewableCells(cells).map((cell) => cell.renderer);
        const hasDesc = sourceHasExpectedDescription(tool, name, renderers);
        const withheld = sourceWithheldReason(tool, name, renderers);
        const entry: ReviewTest = { tool, name, cells, sourceHasDescription: hasDesc };
        if (withheld !== null) entry.withheldReason = withheld;
        if (expectedImageDescription !== undefined) entry.expectedImageDescription = expectedImageDescription;
        results.push(entry);
      }
    }
  }

  return results;
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
        server.watcher.add(join(requestsDir, '*.json'));
        server.watcher.on('add', (file: string) => {
          if (!file.startsWith(requestsDir) || !file.endsWith('.json')) return;
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
                // A cell without a hash has no capture to commission; it is filtered below. A cell WITH
                // captured pixels but no build stamp is different: the build already happened, and the
                // missing step is to capture again so status.json records that completed build.
                const capturedCells = payload.cells.filter((c) => c.pixelSha256 !== null);
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
                const eligible = payload.cells.filter(
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
                  const noHash = payload.cells.filter((c) => c.pixelSha256 === null).length;
                  res.statusCode = 400;
                  res.end(
                    JSON.stringify({
                      error:
                        noHash === payload.cells.length
                          ? `no capture hash for any cell of ${payload.entry} — these artifacts predate pixel hashing, or the capture failed. Capture the cells before commissioning`
                          : 'no eligible cells: every cell needs a capture hash and a host identity',
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
                  schemaVersion: 3,
                  id,
                  subject: payload.tool,
                  targets: eligible.map((c) => ({
                    entry: payload.entry,
                    renderer: c.renderer,
                    pixelSha256: c.pixelSha256,
                    build: c.build,
                    capture: {
                      hostInstanceId: c.hostInstanceId,
                      environmentId: registeredEnvironmentId,
                    },
                  })),
                  frames: 1,
                  reason: payload.reason || 'Commissioned from review',
                };

                const queueDir = join(projectRoot, 'reference-image-requests');
                mkdirSync(queueDir, { recursive: true });
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

                // Rebuild the manifest so the cell's commission state becomes `requested` immediately.
                // Without this the UI kept reporting `not-commissioned` after a successful write, which
                // reads as "the click did nothing" — and a user filed six requests for one scene before
                // anything on screen changed. The watcher covers .artifacts, never oracle-requests.
                const manifestModule = server.moduleGraph.getModuleById('\0virtual:review-manifest');
                if (manifestModule) server.moduleGraph.invalidateModule(manifestModule);
                server.ws.send({ type: 'full-reload' });

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
                    skipped: payload.cells.filter((c) => c.pixelSha256 === null).map((c) => c.renderer),
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

          if (req.method === 'POST' && urlPath === '/api/hold') {
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
                  res.end(JSON.stringify({ error: 'a hold requires a reason' }));
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

                let heldData: { $comment?: string; schemaVersion?: number; held: Record<string, string> };
                if (existsSync(heldPath)) {
                  heldData = JSON.parse(readFileSync(heldPath, 'utf8')) as typeof heldData;
                } else {
                  heldData = { schemaVersion: 1, held: {} };
                }

                const keys: string[] = [];
                for (const renderer of payload.renderers) {
                  const key = `${payload.tool}/${payload.entry}/${renderer}`;
                  heldData.held[key] = payload.reason.trim();
                  keys.push(key);
                }

                writeFileSync(heldPath, JSON.stringify(heldData, null, 2) + '\n');

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ keys, path: relative(projectRoot, heldPath) }));
              } catch {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'invalid JSON body' }));
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
