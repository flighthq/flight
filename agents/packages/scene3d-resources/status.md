---
package: '@flighthq/scene3d-resources'
updated: 2026-08-10
by: builder3
---

# scene3d-resources — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/scene3d-resources/src/` on 2026-08-08. A file:line here
is a claim about this tree, not about a session.

- **`@flighthq/assets` is still unwired, and its deferral condition has half-fired.** Charter Decision
  2026-07-17 defers assets' refcount/unload to "the progressive/streaming phase", because embedded
  byte-refs have no ids. `package.json:41-52` depends on `entity`, `image`, `loader`, `log`, `net`,
  `node`, `scene3d`, `scene3d-formats`, `signals`, `texture`, `tween`, `types` — **`assets` is not
  among them** and no file in `src/` imports it. Streaming has since landed
  (`updateScene3DResourceStreaming`, `resolveScene3DResources.ts:86`) while the progressive half has
  not, so v1's dedup-by-`Texture`-identity at the walk is still the only lifetime story.
- **Phase 2 progressive resolution is absent.** Nothing in `src/` mentions mip levels, a low-res
  placeholder, or a cross-fade between two resolutions. `revealScene3DResourcesOnResolve.ts:34` is the
  pop-vs-fade recipe over `node.alpha` only — one transition, from hidden to final.
- **An unlisted material kind makes reveal-on-resolve skip that material.** The texture registry has
  no default lister, so the recipe cannot associate its textures with their owning meshes; it leaves
  those meshes' alpha unchanged and installs no fade (`revealScene3DResourcesOnResolve.ts:93-117`).
  Image fetching is unaffected — `getScene3DResourceTextures` reads the resource back-edge without the
  registry, so the textures resolve normally. Call `explainScene3DResourceCoverage` after parsing and
  before loading, while the opt-in boundary is actionable.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-10** — Corrected the unlisted-material outcome against the reveal implementation: texture
  acquisition remains registry-free, while reveal-on-resolve skips the material and leaves mesh alpha unchanged.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract, and given the front matter it was missing
  entirely. Three claims checked **false** and dropped. The largest: the 2026-07-31 entry's tiering
  proposal, explicitly "not implemented", **is implemented** — the root `vitest.config.ts` now runs a
  shared-registry fast tier plus an `isolate: true` isolated tier for module-mocking files, with the
  tier list machine-checked by `npm run mocks:check` (`vitest.config.ts:24-33`, `:95-96`). Also dropped:
  "glTF texture import deferred (STOP-AND-ASK)" — `gltfParse.ts:232-235` emits an
  `ImageResourceReference` per `doc.images` entry — and the trailing "No code exists yet", against 27
  source modules. `SceneResourceRef` is now `ImageResourceReference`.
- **2026-07-31** — Measured the cold-run hook cost at ~4x warm and argued no `hookTimeout` number is
  verifiable, which the isolated tier above then made moot.
- **2026-07-30** — Diagnosed the full-suite setup flake as a `beforeAll` budget overrun and raised
  `hookTimeout` to 60s; the `vi.doMock('@flighthq/net/contract')` / `vi.doUnmock('@flighthq/net')`
  specifier mismatch was fixed in `d47635999` and proved non-load-bearing.
- **2026-07-29** — Split the overloaded resolve atom: `resolveScene3DResources` returns the
  resolved/unresolved partition synchronously, `updateScene3DResourceStreaming` owns the
  visibility/priority engine, `retryFailedScene3DResources` advances it explicitly.
- **2026-07-22** — `loadScene3DDocumentFrom*Url` returns `Scene3DDocument | null` with abort and
  byte progress; glTF closes required external `.bin` geometry; no loader touches backend GPU state.
- **2026-07-17** — v1 delivered: resource refs in `types`, the resolver + policy engine with
  cancel-on-drop and stale-settle, `enableScene3DResourceSignals`, and the open
  `Scene3DMaterialTextureRegistry`.
