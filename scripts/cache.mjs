#!/usr/bin/env node
//
// cache — run on the HOST, from inside a worktree.
//
// Pre-warms an npm cache and packs it into a single tarball the microVM can
// install from offline (`npm run setup`). The container's egress filter makes
// registry downloads painfully slow, so we pay that cost ONCE here on the host's
// fast connection and hand the result across the virtiofs share as one file.
//
// Dependency-free: Node built-ins only, so it runs before node_modules exists and
// on any host (Windows/macOS/Linux), not just WSL/bash.
//
// Does NOT read or create node_modules: it warms the cache from a throwaway
// manifest skeleton in the temp dir, leaving the worktree pristine.
//
// Idempotent: re-running with an unchanged package-lock.json exits immediately.
//
// Env overrides:
//   FLIGHT_NPM_CACHE          host cache dir  (default: <home>/.flight/npm-cache)
//   FLIGHT_NPM_CACHE_TARBALL  output tarball  (default: <worktree>/.npm-cache.tgz)

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = process.env.FLIGHT_NPM_CACHE || join(homedir(), '.flight', 'npm-cache')
const TARBALL = process.env.FLIGHT_NPM_CACHE_TARBALL || join(ROOT, '.npm-cache.tgz')
const LOCK = join(ROOT, 'package-lock.json')
const STAMP = `${TARBALL}.lock-sha256`

if (!existsSync(LOCK)) fail(`No package-lock.json in ${ROOT}`)

const lockHash = createHash('sha256').update(readFileSync(LOCK)).digest('hex')

// Idempotent fast path: tarball already built for this exact lockfile.
if (existsSync(TARBALL) && existsSync(STAMP) && readFileSync(STAMP, 'utf8') === lockHash) {
  console.log('==> Cache already warm for this lockfile — nothing to do.')
  console.log(`    ${TARBALL}`)
  console.log('    In the container run:  npm run setup')
  process.exit(0)
}

console.log(`==> Pre-warming npm cache for ${ROOT}`)
console.log(`    cache:   ${CACHE}`)
console.log(`    tarball: ${TARBALL}`)

// Warm the cache from a manifest-only skeleton so the worktree stays pristine.
// npm ci needs every workspace package.json present (to resolve the workspace
// graph) but no source files, so copy just the manifests, preserving paths.
const skel = mkdtempSync(join(tmpdir(), 'flight-npm-cache-'))
try {
  for (const manifest of findManifests(ROOT)) {
    const dest = join(skel, relative(ROOT, manifest))
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(manifest, dest)
  }
  copyFileSync(LOCK, join(skel, 'package-lock.json'))

  // Download the full tree into the shared cache. --ignore-scripts skips native
  // builds (e.g. canvas) — those are platform/ABI-specific and belong in the
  // container. --prefer-offline reuses the cache across worktrees so only the
  // first worktree pays the download cost.
  npm(['ci', '--ignore-scripts', '--cache', CACHE, '--prefer-offline'], skel)

  // Pack the cache as ONE file: sequential I/O crosses virtiofs cleanly, unlike
  // the tens of thousands of tiny cacache files.
  console.log(`==> Packing cache -> ${TARBALL}`)
  run('tar', ['-C', CACHE, '-czf', TARBALL, '.'])
  writeFileSync(STAMP, lockHash)
} finally {
  rmSync(skel, { recursive: true, force: true })
}

console.log('==> Done. In the container run:  npm run setup')

// Collect every package.json under root, skipping node_modules and .git.
function findManifests(root) {
  const out = []
  walk(root)
  return out
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        walk(join(dir, entry.name))
      } else if (entry.name === 'package.json') {
        out.push(join(dir, entry.name))
      }
    }
  }
}

// Run the exact npm that invoked this script (set by `npm run`); fall back to a
// PATH lookup when invoked directly with `node`.
function npm(args, cwd) {
  const execpath = process.env.npm_execpath
  if (execpath) run(process.execPath, [execpath, ...args], cwd)
  else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd, true)
}

function run(cmd, args, cwd, shell = false) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd, shell })
  if (res.error) fail(`${cmd} failed to start: ${res.error.message}`)
  if (res.status !== 0) fail(`${cmd} exited with code ${res.status}`)
}

function fail(msg) {
  console.error(`!! ${msg}`)
  process.exit(1)
}
