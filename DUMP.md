# DUMP — breadth/depth review session state (2026-07-13, rate-limited mid-fan-out)

Session hit the usage limit (resets 9:20am UTC) mid-way through the breadth+depth review fan-out. This file preserves everything received so far, verbatim-condensed, plus resume state. Nothing below is committed doctrine — it is raw subagent feedback awaiting synthesis into `agents/packages/*` cells and the two review docs.

## Resume state

**Completed (results captured below):**

- Depth: codec formats cluster (image-codec, texture-formats, tilemap-formats, path-formats, shape-formats, path-boolean, binpack) — agent aec95887824a23222. **Its 14 review.md/assessment.md files ARE WRITTEN to the working tree (uncommitted).**
- Breadth: adjacent content use-cases — agent ab7abc32a718480ef (report only, read-only).
- Breadth: platform/execution variance — agent a89687bc5956ec3d0 (report only, read-only).
- Breadth: cloud/distributed systems — agent a143d592bd05b1939 (report only, read-only).
- Breadth: current-domain deepening — agent a4e87bbb7a4108c36 (report only, read-only).

**Failed on session limit (0 tokens used, re-launch fresh or SendMessage to resume):**

- Depth game-sim cluster (camera2d, collision, spatial, flow, snapshot, spring, motionpath, clock) — abaa9294d63c4db2a
- Depth new-text cluster (text-markup, textsegment, textbidi, glyphatlas, bitmapfont, bitmapfont-formats, bitmaptext) — a2dc5838151beb66e
- Depth infra cluster (assets, capture, tool-capture, debug, intl, accessibility) — a53fbf1441d3a7806
- Depth net/platform-new (net, socket, permissions, mediasession, host-tauri, host-capacitor) — a6556c70024d1382b
- Depth image-op cluster (adjustments + effects rereviews) — aa9e9e3274eb1534a
- Depth render core (render, render-gl, render-wgpu, velocity) — a3a740422f79a871d
- Depth displayobject cluster — a222606348ba01e75
- Depth scene-graph core (node, geometry, path, shape, interaction, sprite, clip) — ac3bc15c0f869c8a1
- Depth core primitives (types, entity, signals, math, sdk, surface) — a998fe3fd5286b7a7
- Depth stale text (text, textlayout, textshaper, textshaper-canvas, textinput) — a13c9d5eee249793b
- Depth 3D cluster (scene, scene-gl, scene-wgpu, camera, mesh, materials, lighting + light: skeleton, picking, animation, scene-formats) — aaf39407f0113bf54
- Depth animation family (movieclip, particleemitter, particles, particles-formats, spritesheet, spritesheet-formats, tween, timeline, easing) — afe972389f0296f48
- Depth platform suite 1 light (app, application, clipboard, connectivity, device, dialog, filesystem, geolocation, haptics, ipc, keyboard, lifecycle) — ac2dba98adbd3665f
- Depth platform suite 2 light (log, menu, notification, platform, power, protocol, screen, sensors, share, shell, shortcut, statusbar, storage, tray, updater, webcam, xml, useragent, input, host-electron) — a96aaed44cf7460ec
- Depth resources light (image, font, audio, video, texture, textureatlas, textureatlas-formats, tileset, loader, media) — a92aeb62e089f4078

The full prompts for every cluster are in this session's transcript; each failed agent can be re-launched with the same cluster prompt (tier FULL/REREVIEW/LIGHT assignments as originally split). After all depth clusters land: regenerate `agents/packages/TODO.md` via `node agents/packages/todo.mjs`, write the two synthesis docs (breadth report + depth report under `agents/`), update register.md with new candidates, commit.

---

## DEPTH — codec formats cluster (COMPLETE, files written to tree)

Per-package verdicts (review.md + assessment.md written for each, front matter `updated: 2026-07-13`):

- `image-codec | solid 70` — AVIF registered by web decoder but unreachable via detectImageMimeType sniffing; no explain\* queries for null sentinels; web encoder silently falls back to PNG when convertToBlob rejects the type (no failure channel).
- `texture-formats | solid 68` — parseBasis field offsets disagree with published basisu header layout (tests share the same reconstructed layout so can't catch it); no parser validated against a real file (synthetic buffers only); no explain\* diagnostics.
- `tilemap-formats | solid 68` — fidelity holes (object rotation/visible, layer tint/parallax, hex/stagger params, tileOffset silently dropped); serialization TMX-only (no formatTiledTmj, no TSX/TSJ formatters); infinite/chunked layers decode all-zero + no diagnostics.
- `path-formats | solid 74` — no explain\* for sentinels; appendSvgPathData can leave half-appended path on failure; writer is absolute-long-form only (no compact/relative/minified mode).
- `shape-formats | partial 62` — parseShapeJson does no arity/type validation — malformed entries corrupt the command buffer instead of the charter-promised null; round-trip test covers only 9 of 15 non-bitmap keys; no explain\* diagnostics.
- `path-boolean | solid 85` — no open-path (polyline) clipping (blocked on flattenPath closedness); deflation instability on dense/round-join rings (documented 40–94% area loss); no Minkowski/PolyTree/perf-tier vs Clipper2.
- `binpack | solid 74` — only BSSF heuristic (charter names Best-Area-Fit too; no Skyline/Guillotine); no online/incremental packing while glyphatlas rolled its own shelf packer; no occupancy metric or explainUnpackedRectangles.

Cross-package findings:

- **Stale Package Map lines:** `image` claims re-export of `detectImageMimeType` from image-codec — false, and a 2026-07-09 charter decision rules it out; glyphatlas claims "binpack-backed batch repack" — false, binpack has zero in-repo consumers; texture-formats line omits ATF + selectTextureContainer; tilemap-formats line misses the faithful-document/projection split + formatTiledTmx; path-formats line omits appendSvgPathData; path-boolean's "full AAA set" overstates vs Clipper2.
- **Charter drift:** path-boolean and shape-formats charters cite stale dep lists; tilemap-formats' "dropped-with-warning" decision landed as silent all-zero; texture-formats' ATF identify-only decision unimplemented, needs a TextureContainerFormat vocabulary ruling.
- **Cross-package unlocks:** path's flattenPath losing per-subpath closedness blocks path-boolean open-path clipping; shape lacks a public forEachShapeCommand iterator (shape-formats coupled to raw buffer); ImageEncoder type needs a failure channel; sprite's TilemapData has no per-tile flip capacity for Tiled GID flips.
- **Duplication signal:** glyphatlas' self-owned shelf packer is live demand-evidence for binpack's chartered online-allocator direction.

---

## BREADTH 1 — adjacent content use-cases beyond games (agent ab7abc32a718480ef)

Domain coverage: **data-viz** ~80% built by accident (camera2d, intl, spatial, interaction, tween, QuadBatch, math stats); missing bedrock = `scale` (d3-scale tier: linear/log/time/ordinal/band, ticks, nice(), invert — name collides with transform-scale vocabulary, discuss) and `color` (spaces sRGB↔linear/HSL/OKLab/LCH, ramps/schemes, contrast). **Creative/design tools** = Flight's strongest adjacent claim (path-boolean CSG, shape hit-test registry, snapshot undo, textinput, app shell); missing = `snapping` (align/distribute/magnetism math, later), `history` (command-stack undo — discuss overlap vs snapshot memento + textinput undo), plus the open fork-I constraint/anchor layer. **Motion graphics** mostly chartered (svg/lottie/rive-formats); genuinely missing = export → `video-codec` (WebCodecs mux/demux seam, mirror of image-codec; serves motion graphics + creative tools + signage). **Geo-lite** needs a fork-G-style scope ruling first; then `geo` (projections, haversine), `geo-formats` (GeoJSON/TopoJSON/MVT), `maptile` (slippy z/x/y math) — all later. **Presentations/e-learning + kiosk/signage**: zero new packages — pure depth + one example each as evidence. **AV/music**: `audio-formats` (triad-predicted; decode rust-intended), audio FFT/analysis rust-intended, `midi` reserve. **Camera/photo**: EXIF → image-codec deepening, RAW → rust-intended, color mgmt → `color`.

Candidates: color (now), scale (now), video-codec (soon), audio-formats (soon), history (soon), snapping (later), geo/geo-formats/maptile (later, after ruling), midi (reserve), chart (reserve-name-only — assembly not bedrock), schedule (reserve-name-only).

Stressed: textlayout/textshaper/text (axis labels: thousands of small measured strings, rotation, ellipsis); path/shape stroke perf + polyline decimation gap (simplifyPath is self-intersection resolution, NOT Douglas-Peucker); sprite QuadBatch 100k scatter (per-instance tint gl/wgpu-only — viz needs it everywhere); interaction+spatial hover recipes; intl tick formatting; camera2d axis-locked zoom; snapshot undo cost per keystroke (structural sharing?); surface photo depth; **gl/wgpu blend modes gate motion graphics more than any new package**; accessibility for charts/kiosks; updater/power/lifecycle kiosk robustness.

Strategic: charting is the cheapest authoritative-in-new-domain purchase (two small pure-math cells); codec symmetry extends to time media (video-codec/audio-formats, encode is the differentiator); creative-tool runtime is the strongest positioning claim; geo needs one scope ruling; presentations/kiosk prove the app layer with examples only.

---

## BREADTH 2 — platform & execution variance (agent a89687bc5956ec3d0)

Coverage: **Server/headless** — DOM-free chain (image-codec/surface/capture/tool-capture) is real BUT surface leaks DOM in surfaceFrom.ts/surfaceEncode.ts (4× document.createElement('canvas')); missing app-layer host. **Workers/OffscreenCanvas** — house style accidentally excellent (plain data = clone-friendly; rAF exists in workers; render-gl/wgpu take contexts); missing typed transferable-aware channel + a codified "entity crosses, runtime rebuilds" serialization contract. **WebXR** — 3D substrate positioned (explicit view/projection is XR-shaped); nothing XR exists; LoopBackend fits XRSession.rAF. **Smart TV** — web backends run as-is; hard miss = spatial dpad focus navigation (nothing in input/textinput/accessibility); no overscan/safe-area in screen/statusbar. **Watch/embedded** — tree-shaking is the story, no package. **Cloud gaming** — composition (socket+media+input+snapshot), document as recipe. **Consoles** — the \*Backend seam inventory IS the C/C++ porting surface; audit seams for web types. **PWA** — mostly covered; SW registration marginal.

Candidates: `focus` (spatial dpad/LRUD focus nav over plain-data {id,bounds} regions; oracle BBC LRUD/Norigin; **now** — TV+console+gamepad+keyboard-a11y converge); `host-node` (Node/Deno/Bun host: timer LoopBackend, fs storage/filesystem, file log sink — **soon**, unlocks the headless chain); `worker` (typed cross-context channel w/ explicit transferables, comlink-minus-proxy-magic; **soon after** settling the ipc boundary call — lean distinct: transferables don't exist in process IPC); `xr` (session/reference-space/input-source data + XrBackend; **later**, gated on 3D maturity); host-tizen/host-webos (reserve); serviceworker/host-pwa (reserve, marginal).

Stressed: input (no focus concept; snapshot serialization; TV keys); accessibility (must share one focus model with `focus`); surface (the 2 DOM-leak files → route through image-codec seam); image-codec (Node registrars); ipc (worker boundary call); entity/node (serialization contract needs documenting + guard); application (worker sentinel story); screen/statusbar (safe-area insets); media (worker/Node absence → sentinels or seams); textshaper-harfbuzz priority rises for server text; camera/scene-gl/wgpu (stereo per-eye stress).

Strategic: architecture already paid the porting tax — only two genuinely missing primitives (focus, worker channel); headless is 90% built 0% assembled; codify entity-crosses-runtime-rebuilds now; a generated backend-seam matrix would make console/native portability auditable like packages:check.

---

## BREADTH 3 — cloud/distributed (agent a143d592bd05b1939) — the user's stated personal direction

Standing: transport+state floor built and deliberately minimal (net/socket/snapshot/storage/assets/log); `session` name RESERVED for live-state container (auth must take `identity`); snapshot charter invites a separate wire format; **no binary serialization, no time-sync, no delta/patch primitive exists anywhere — that tier is the actual gap.**

Candidates: deepen `snapshot` (chartered diffSnapshots/applySnapshotDelta + determinism — **now**); `serialize` (plain-data↔compact bytes with schema, varint/float32 policy; oracle msgpack/FlatBuffers; wasm-mixable value leaf — **soon**); deepen `assets` (contentHash/version on descriptors, remote-manifest refresh — **now**); `tool-assetpipeline` (build-time producer: binpack+image-codec+texture-formats → hashed manifest; same package local or cloud-CI — **soon**); `telemetry` (event envelope, offline batch queue in storage, backoff flush over net, flush-on-lifecycle-hide; log sink feeds it; resolves log's flagged neighbor fork — **soon**); `flags` (typed remote-config seam, OpenFeature-shaped, exposure events → telemetry — soon/later); `replication` (server-authoritative entity sync over snapshot-diff+serialize+socket — **later**, blocked on the now/soon tier); `rollback` (GGPO-style — later/reserve, demands determinism audit); `bindiff` (bsdiff-class — later; serves updater differential + asset patching); `peer` (WebRTC data channels — the only unreliable/unordered browser transport, TCP-semantics socket caps netcode; **later**); `presence` (reserve); CRDT (pass-as-subject fail-as-timing; heavy kernel rust-intended; blocked on scene-serialization design call; reserve); `identity` (fail today — vendor territory; reserve name). **Fail bedrock:** cloud-save-as-package (= composition), matchmaking/lobby/leaderboards (vendor services), remote-preview/capture-farm packages (Vite upstream / tool-capture deepening).

Stressed: snapshot (delta → load-bearing; determinism of clone ordering + float lerp on the wire; partial-slice capture); socket (deferred reconnect/heartbeat/backpressure now needed; binary framing); net (range requests, retry/backoff, ETag); storage (async IndexedDB/OPFS backend becomes prerequisite); assets (versioned manifests, streaming priority); log (telemetry fork resolves via candidate; correlation-ID non-goal may need routed exception); clock (network time offset/RTT — fold into replication or clock deepening); updater (bindiff, staged rollout vocabulary overlap with flags); ipc (its unbuilt IpcSerializer seam should BE `serialize`, not a second codec); lifecycle/connectivity/permissions/webcam/media; tool-capture (remote endpoints, sharded sweeps).

Strategic: the missing tier is **bytes/deltas/time**, not "multiplayer" — serialize + snapshot-delta + bindiff first, everything composes over exactly those three; the \*Backend seam is Flight's native answer to vendor services (own the vocabulary + seam, vendor owns the server; OpenFeature is external proof); two open design calls block collab work (scene serialization naming; session/identity naming); cloud dev mostly = run existing deterministic tools elsewhere — tool-assetpipeline is the one missing tool; **determinism becomes a cross-cutting contract** (seeded RNG + reproducible floats) — worth explicit charter notes in math/snapshot before any netcode cell.

---

## BREADTH 4 — current-domain deepening (agent a4e87bbb7a4108c36)

Pre-verified: noise already blessed into `math` (2026-07-02 decision, parked builder task); collision charter anticipates a physics composer; `session` reserved; devtools/testing/compute-wgpu already queued; Rive SM runtime already flagged.

Candidates: `physics2d` (**now** — the single largest gap; rigid-body dynamics/constraints/joints over collision+spatial; oracle Box2D/planck.js; TS-feasible, constraint solver rust-intended-optional; prereq = collision's chartered swept/TOI + contact phases); `physics` 3D (reserve-name-only, rust-intended, after physics2d proves the seam); `pathfinding` (**soon** — A\*/Dijkstra/JPS/flow fields; charter must draw the path≠pathfinding line); `navmesh` (later; bake rust-intended, query TS; Recast/Detour split precedent); `steering` (**soon** — Reynolds seek/flee/arrive/flocking; distinct from motionpath (authored) and spring (smoothing)); `behaviortree` (**soon** — plain-data BTs, open node-kind registry, explicit tick, caller-owned blackboard); `statechart` (**soon** — hierarchical FSM, doubly motivated: gameplay + Rive SM runtime substrate; clean vs flow); `dialogue` + `dialogue-formats` (later — Yarn/Ink/Twine; fork I extended to content); `localization` + `localization-formats` (**soon** — string catalogs, ICU MessageFormat plural/select, locale fallback, PO/XLIFF/FTL/ARB; intl = values, localization = catalogs); `videocodec`-or-video-depth (later; editing suite = composition not cell); save-file versioning (**discuss** — widen the register's scene-serialization design call to one versioned-migration story for scene docs + app saves + replays); `replay` (reserve-name-only — primitives exist, do stressed work first + a determinism functional example); WFC (reserve), L-systems (reject as package — a path recipe); inventory/economy (**reject** — app-domain, record it); ECS (**reject → anti-goals.md entry** with the entity/runtime+SoA alternative spelled out); audio synthesis/DSP (online = media depth per its charter expansion #3; offline DSP reserve, rust-intended).

Stressed: math (noise tier = highest-leverage single item); collision (phases 2–3 prereq for physics2d); media/audio (per-bus inserts, analyser, spatial audio, AudioContext singleton decision to execute); snapshot (delta); input (timestamped event-stream capture hook); application+clock (documented + functionally-tested determinism); debug (profiler depth before a devtools package); intl (redirect catalog pressure to localization); flow (keep as app stack, route FSM pressure to statechart).

Strategic: Flight stopped one layer below gameplay exactly where oracles are strongest — next game tier: physics2d → pathfinding/steering → statechart/behaviortree; fork I generalizes from visuals to content (dialogue, localization); rust-intended lane is the pressure valve for every heavy solver; three "missing features" are ONE design call (versioned serialization/migration); two loud asks deserve recorded rejections (ECS → anti-goals, inventory/economy → register).

---

## Cross-report convergences (synthesis seeds)

1. **Determinism as contract** — breadth 3 (netcode/capture-farms/CRDT) and breadth 4 (replay/rollback/physics) independently demand seeded-RNG + reproducible-float charter notes in math/snapshot/application/clock.
2. **One versioned-serialization design call** unblocks: scene-save naming (register), app save files, replay streams, CRDT timing, `serialize` shape, ipc's IpcSerializer.
3. **fork I generalizes** — visual artifacts (svg/lottie/rive) → content artifacts (dialogue, localization catalogs); the constraint/anchor layer remains the open half.
4. **Two genuinely missing platform primitives**: `focus` (spatial navigation) and `worker` (transferable channel); everything else environmental is host adapters or discipline.
5. **Small pure-math cells buy new authority cheaply**: color, scale, serialize, pathfinding, steering — all value leaves, C-portable, wasm-mixable.
6. **Depth gates that outrank new packages**: gl/wgpu blend modes; per-instance tint everywhere; surface's 2 DOM-leak files; snapshot delta; storage async backend; socket reconnect layer; collision phases 2–3; math noise tier.
7. **Recorded rejections wanted**: ECS (anti-goals entry), inventory/economy, cloud-save-as-package, matchmaking/leaderboards, chart-grammar (reserve only).
