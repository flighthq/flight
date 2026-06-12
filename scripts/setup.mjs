#!/usr/bin/env node
//
// setup — the go-to command to install this worktree's dependencies.
//
// Run from the worktree root. If the host produced a pre-warmed cache tarball
// (`npm run cache`), this installs from it offline — fast, no slow proxied
// registry downloads. If there is no tarball, it falls back to a normal install,
// so `npm run setup` works regardless of whether `cache` was ever run.
//
// Dependency-free: Node built-ins only, so it runs before node_modules exists.
//
// Env overrides:
//   FLIGHT_NPM_CACHE          cache dir to extract into  (default: <home>/.flight/npm-cache)
//   FLIGHT_NPM_CACHE_TARBALL  input tarball              (default: <worktree>/.npm-cache.tgz)

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = process.env.FLIGHT_NPM_CACHE || join(homedir(), '.flight', 'npm-cache')
const TARBALL = process.env.FLIGHT_NPM_CACHE_TARBALL || join(ROOT, '.npm-cache.tgz')

if (existsSync(TARBALL)) {
  // Extract to a LOCAL cache dir (under home), keeping the tens of thousands of
  // small cacache files off the virtiofs share, then install offline.
  console.log(`==> Found warm cache: ${TARBALL}`)
  console.log(`    Extracting to ${CACHE}`)
  mkdirSync(CACHE, { recursive: true })
  run('tar', ['-xzf', TARBALL, '-C', CACHE])

  // --prefer-offline uses the cache for the ~1000 registry tarballs (the slow-
  // through-the-proxy part) and only reaches the network for genuine misses,
  // instead of hard-failing like --offline. Lifecycle scripts run (NOT skipped)
  // so native deps like canvas compile against this container's node ABI.
  console.log('==> npm ci --prefer-offline')
  npm(['ci', '--prefer-offline', '--cache', CACHE])
} else {
  // No pre-warmed cache — still works, just slower. Keeps `setup` a reliable
  // go-to regardless of whether the host ever ran `cache`.
  console.log(`==> No warm cache at ${TARBALL}`)
  console.log('    Tip: run `npm run cache` on the host to make this fast.')
  console.log('==> npm ci')
  npm(['ci'])
}

console.log('==> Done.')

// Run the exact npm that invoked this script (set by `npm run`); fall back to a
// PATH lookup when invoked directly with `node`. node_modules is written into
// the worktree, so run npm at ROOT.
function npm(args) {
  const execpath = process.env.npm_execpath
  if (execpath) run(process.execPath, [execpath, ...args])
  else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, true)
}

function run(cmd, args, shell = false) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell })
  if (res.error) fail(`${cmd} failed to start: ${res.error.message}`)
  if (res.status !== 0) fail(`${cmd} exited with code ${res.status}`)
}

function fail(msg) {
  console.error(`!! ${msg}`)
  process.exit(1)
}
