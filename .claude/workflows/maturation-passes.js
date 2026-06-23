// Maturation Passes (Bronze / Silver / Gold)
// ===========================================
// Two autonomous passes that turn the breadth-and-depth review into improvement plans. Each agent
// writes its own Markdown doc.
//
//   PASS 1 — Depth maturation: one agent per existing package. Reads that package's depth review
//            (reviews/depth/<pkg>.md) + source and writes a Bronze/Silver/Gold roadmap to mature it.
//   PASS 2 — New-package specs: one agent per net-new package that the breadth reviews found
//            missing. Writes a Bronze/Silver/Gold spec of what that package would represent.
//
// PREREQUISITE: run `breadth-and-depth-review` first — this workflow reads the docs it produced
// under <root>/tools/agents/docs/reviews/{depth,breadth}/. The MISSING list below was harvested from
// those breadth reviews' "Missing or too-thin packages" sections (pure enrichments of existing
// packages were dropped — Pass 1 already covers them).
//
// Output (each agent writes its own file):
//   <root>/tools/agents/docs/reviews/maturation/depth/<pkg>.md
//   <root>/tools/agents/docs/reviews/maturation/breadth/<name>.md
// Returns { depth[], breadth[] } summaries; build maturation/index.md from those after the run.
//
// HOW TO RUN
//   Workflow({ name: 'maturation-passes' })                       // uses defaults below
//   Workflow({ name: 'maturation-passes', args: { ... } })       // override root/packages/missing
//
// HOW TO IMPROVE FOR FUTURE RUNS (edit this file, or pass args)
//   • args.root      — absolute worktree root (per-checkout override).
//   • args.packages  — package short-names for Pass 1 (regen list: see breadth-and-depth-review.js).
//   • args.missing   — Pass-2 specs, each { name, scope, by }. Re-harvest after a new review run:
//       for f in tools/agents/docs/reviews/breadth/*.md; do
//         awk '/^## Missing or too-thin packages/{f=1;next}/^## /{f=0}f' "$f"; done
//   • Retune the TIERS / CONVENTIONS strings or the depth/breadth prompt templates and doc sections.
//
// args shape (all optional): { root: string, packages: string[], missing: {name,scope,by}[] }

export const meta = {
  name: 'maturation-passes',
  description:
    'Pass 1: per-package Bronze/Silver/Gold maturation roadmap from each depth review. Pass 2: per missing-package (harvested from breadth reviews) a Bronze/Silver/Gold spec of what that package would represent. Each agent writes its own doc.',
  whenToUse: 'After breadth-and-depth-review: turn the findings into tiered improvement plans + new-package specs.',
  phases: [
    { title: 'DepthMaturation', detail: 'one agent per package — Bronze/Silver/Gold to mature it' },
    {
      title: 'BreadthMaturation',
      detail: 'one agent per missing package — Bronze/Silver/Gold spec of what it represents',
    },
  ],
};

const ROOT = (args && args.root) || '/home/joshua/Development/flight/worktrees/review';
const REVIEWS = ROOT + '/tools/agents/docs/reviews';
const OUT_DEPTH = REVIEWS + '/maturation/depth';
const OUT_BREADTH = REVIEWS + '/maturation/breadth';

const TIERS =
  'Define three concrete, cumulative tiers (each builds on the previous):\n' +
  '- BRONZE = the minimum viable, first genuinely useful version: fill the most glaring gaps, the 20% of features that deliver 80% of the value. Shippable but basic.\n' +
  '- SILVER = competitive and solid: matches what a good, well-regarded library in this space offers; covers common professional use, the important edge cases, and cross-backend consistency where relevant.\n' +
  '- GOLD = authoritative / AAA / production-grade: the canonical reference for this domain — exhaustive feature coverage, performance, full edge-case and error handling, tests, docs, and (where applicable) 1:1 Rust-port parity. Nothing a domain expert would find missing.\n' +
  'For each tier list CONCRETE, specific additions (named functions/types/capabilities), not vague goals. Be honest about effort and ordering.';

const CONVENTIONS =
  'Honor the Flight design rules: define shared types in @flighthq/types first (the header layer); plain data over runtime objects; free functions over methods; explicit allocation (create*/out-params); Readonly by default; *Kind string identifiers; tree-shakable, "sideEffects": false, single root "." export; swappable *Backend seams with get*/set*/createWeb* for platform capabilities; the "-formats" neighbor-package pattern for importers/parsers; signals via enable* groups; sentinels (null/false/-1) for expected failure, throw only on misuse; native-first with a Rust crate mirror (flighthq-<name>). Names carry the full unabbreviated type word.';

const DEFAULT_PACKAGES = [
  'application',
  'app',
  'camera',
  'clipboard',
  'clip',
  'device',
  'dialog',
  'displayobject-canvas',
  'displayobject-dom',
  'displayobject-gl',
  'displayobject-wgpu',
  'displayobject',
  'easing',
  'effects-canvas',
  'effects-gl',
  'effects-wgpu',
  'effects',
  'entity',
  'filesystem',
  'filters-canvas',
  'filters-css',
  'filters-gl',
  'filters-surface',
  'filters-wgpu',
  'filters',
  'geolocation',
  'geometry',
  'haptics',
  'host-electron',
  'input',
  'interaction',
  'ipc',
  'keyboard',
  'lifecycle',
  'lighting',
  'loader',
  'log',
  'materials',
  'math',
  'media',
  'menu',
  'mesh',
  'network',
  'node',
  'notification',
  'particles-formats',
  'particles',
  'path',
  'platform',
  'power',
  'protocol',
  'render-gl',
  'render-wgpu',
  'render',
  'resources',
  'scene-gl',
  'scene-wgpu',
  'scene',
  'screen',
  'sdk',
  'sensors',
  'shape',
  'share',
  'shell',
  'shortcut',
  'signals',
  'spritesheet-formats',
  'spritesheet',
  'sprite',
  'statusbar',
  'storage',
  'surface-rs',
  'surface',
  'textinput',
  'textlayout',
  'textshaper-canvas',
  'textshaper',
  'texture',
  'text',
  'timeline',
  'tray',
  'tween',
  'types',
  'updater',
  'velocity',
  'webcam',
];

const DEFAULT_MISSING = [
  {
    name: 'net',
    scope:
      'HTTP request/response (the OpenFL URLLoader/URLRequest home): method, headers, body, text/binary/JSON/form responses, progress + completion signals, abort, retry/backoff, over a swappable transport backend (web fetch, native host, Rust reqwest).',
    by: 'missing-domains, openfl-lime-parity, asset-pipeline',
  },
  {
    name: 'socket',
    scope:
      'WebSocket / streaming transport over the same swappable backend pattern as net: connect, send/receive text+binary frames, backpressure, reconnect, close codes, signals.',
    by: 'missing-domains',
  },
  {
    name: 'assets',
    scope:
      'Id-keyed, content-addressed asset library above resources+loader (the Lime/OpenFL Assets analogue): load-once dedup by key, reference counting, eviction, multiple libraries, preload-by-group, getAssetBitmap/Sound/Text, and a manifest/bundle loader.',
    by: 'asset-pipeline, openfl-lime-parity',
  },
  {
    name: 'atlas-packer',
    scope:
      'Runtime bin-packing to build TextureAtlas/Tileset from loose regions (MaxRects/Guillotine/Skyline), rotation/padding/extrude, feeding glyph atlases and dynamic content.',
    by: 'asset-pipeline',
  },
  {
    name: 'texture-formats',
    scope:
      'KTX2 / Basis Universal / DDS / compressed-texture decode plus per-backend upload of compressed blocks, mip handling, and transcode target selection. The "-formats" neighbor of texture.',
    by: 'asset-pipeline',
  },
  {
    name: 'image-codec',
    scope:
      'registerImageDecoder over swappable PNG/JPEG/WebP/AVIF backends so the native Rust host and off-thread decode have a DOM-free path (no HTMLImageElement). Encode side too.',
    by: 'asset-pipeline',
  },
  {
    name: 'tilemap-formats',
    scope:
      'Tiled (TMX/JSON) and LDtk import to the existing Tilemap/Tileset types; layers, object groups, custom properties. The "-formats" neighbor of sprite/tilemap.',
    by: 'game-2d',
  },
  {
    name: 'skeleton',
    scope:
      'Skeletal/bone animation runtime: joint hierarchy, inverse-bind matrices, skinning palette, IK, and importers (Spine/DragonBones 2D; glTF skins 3D). Consumes mesh joints0/weights0; pairs with the animation package.',
    by: 'animation-motion, spatial-3d',
  },
  {
    name: 'spring',
    scope:
      'Critically-damped spring solver + decay/inertia/rubber-band, usable standalone and as a tween driver; value-typed, slots beside easing.',
    by: 'animation-motion',
  },
  {
    name: 'motion-path',
    scope:
      'Animate a Transform2DNode along a Path with orient-to-tangent and arc-length parameterization; bridges path + tween.',
    by: 'animation-motion',
  },
  {
    name: 'clock',
    scope:
      'Shared, scalable, pausable animation clock/time domain so tween/timeline/spritesheet/particles run under one scrubable, time-scaled root (global slow-motion, pause, seek).',
    by: 'animation-motion',
  },
  {
    name: 'animation',
    scope:
      '3D (and general node) animation clips: channels, keyframe samplers (step/linear/cubic), an evaluator driving SceneNode TRS / morph weights / skeleton poses, blending and layering. Distinct from the 2D timeline/tween.',
    by: 'spatial-3d',
  },
  {
    name: 'gltf',
    scope:
      'glTF/GLB (and ideally OBJ) import producing MeshGeometry + Material + a SceneNode graph, with a model-formats parser neighbor; PBR materials, textures, skins, animations.',
    by: 'spatial-3d',
  },
  {
    name: 'picking',
    scope:
      '3D raycasting: ray construction from camera + screen point, ray-vs-AABB/sphere/triangle, and a pickScene query. The 3D counterpart to interaction.',
    by: 'spatial-3d',
  },
  {
    name: 'environment',
    scope:
      'Image-based lighting + skybox: equirect/HDR->cubemap conversion, irradiance + prefiltered-specular + BRDF-LUT bake, and skybox draw. Backs the existing Environment material type.',
    by: 'rendering-gpu, spatial-3d',
  },
  {
    name: 'shadow',
    scope:
      'Shadow mapping: shadow-map render targets, light-space passes, cascade/atlas support, the sampler-compare seam, and light/material opt-in flags.',
    by: 'rendering-gpu, spatial-3d',
  },
  {
    name: 'instancing',
    scope:
      'Instanced draw support: per-instance attribute buffers and instanced draw paths in mesh + scene-gl/scene-wgpu (or a dedicated cell) for crowds/foliage/particles at scale.',
    by: 'rendering-gpu, spatial-3d',
  },
  {
    name: 'postprocess',
    scope:
      'Composable 3D HDR post chain over renderTarget: tone mapping/exposure, bloom from HDR, SSAO, motion blur, AA resolve, ordered passes. (3D scene post, distinct from the 2D effects fullscreen package.)',
    by: 'spatial-3d, rendering-gpu',
  },
  {
    name: 'compute-wgpu',
    scope:
      'WebGPU compute seam: compute pipeline, bind groups, dispatch, storage buffers/textures, readback — to author compute passes (particles, culling, IBL bake).',
    by: 'rendering-gpu',
  },
  {
    name: 'render-graph',
    scope:
      'Frame-graph / render-graph: declare passes + resource (target/buffer) reads/writes, automatic ordering, transient-resource aliasing, and barrier insertion to orchestrate effects + post + 3D passes.',
    by: 'rendering-gpu',
  },
  {
    name: 'displayobject-skia',
    scope:
      'Rust in-box software-render reference backend (tiny-skia) over render: rasterizes shapes/paths/text into a flighthq-surface buffer; bit-deterministic, the conformance reference the GPU backends are checked against and the universal no-GPU fallback.',
    by: 'rendering-gpu',
  },
  {
    name: 'camera2d',
    scope:
      'World 2D camera: position/zoom/rotation, follow-with-deadzone/lerp, bounds clamping, parallax layers, worldToScreen/screenToWorld, and a visible-bounds rect for culling.',
    by: 'game-2d',
  },
  {
    name: 'collision',
    scope:
      'Value-typed 2D collision: AABB/circle/polygon overlap + swept tests, penetration/separation vectors, a tile-collision resolver, and a minimal body integrator (velocity, gravity, restitution). Data + free functions.',
    by: 'game-2d, missing-domains',
  },
  {
    name: 'spatial',
    scope:
      'Broadphase spatial index: quadtree / uniform grid / spatial hash for culling and collision broadphase, with insert/remove/query and ray/region queries.',
    by: 'game-2d',
  },
  {
    name: 'gamestate',
    scope:
      'Game flow: a screen/scene stack (push/pop/replace, transitions) and a finite-state-machine helper for entity and app state.',
    by: 'game-2d',
  },
  {
    name: 'audio',
    scope:
      'Audio mixer graph beyond simple playback: gain/pan/buses/groups, ducking/crossfade, analyser/FFT, spatial/positional audio, generated/streaming sampleData, and microphone/audio input. The mature counterpart to media playback channels.',
    by: 'game-2d, missing-domains, openfl-lime-parity',
  },
  {
    name: 'textshaper-harfbuzz',
    scope:
      'The full-glyph text shaper tier (HarfBuzz on web/native; rustybuzz in the Rust port) implementing the TextShaperBackend at full strength: positioned glyphs (ids/advances/offsets/clusters), GSUB/GPOS features, complex scripts. Unblocks GPU text + i18n.',
    by: 'text-typography',
  },
  {
    name: 'textbidi',
    scope:
      'Unicode bidi (UAX #9): resolution, reordering, mirroring, plus script/font itemization for layout. (Or folded into textlayout — spec it as its own cell.)',
    by: 'text-typography',
  },
  {
    name: 'font',
    scope:
      'A real font subsystem: family/weight/style/stretch matching, fallback chains, codepoint coverage, variable-font axes, font metrics, and missing-glyph handling — distinct from the current single Font{name} interface.',
    by: 'text-typography',
  },
  {
    name: 'font-atlas',
    scope:
      'Glyph-atlas generation/loading for GPU text: SDF/MSDF rasterization + BMFont import, dynamic atlas growth, and metrics — feeding the GPU text renderers.',
    by: 'asset-pipeline, text-typography',
  },
  {
    name: 'text-gpu',
    scope:
      'GPU glyph rendering (text-gl / text-wgpu): draw shaped runs from the glyph/SDF/MSDF atlas on GL and WebGPU so non-Canvas backends render real text instead of a Canvas2D overlay.',
    by: 'text-typography, rendering-gpu',
  },
  {
    name: 'textsegment',
    scope:
      'Unicode segmentation (UAX #29): grapheme-cluster and word segmentation with emoji-cluster awareness, used by line breaking and caret/selection.',
    by: 'text-typography',
  },
  {
    name: 'text-markup',
    scope:
      'HTML/markup parser for rich text (the htmlText equivalent): parse a tag subset into format ranges feeding setRichTextFormatRange.',
    by: 'text-typography, openfl-lime-parity',
  },
  {
    name: 'intl',
    scope:
      'Internationalization: message catalogs (ICU MessageFormat), number/date/currency/relative-time/plural formatting, and locale resolution + locale-aware line breaking. A host-backed seam matching the platform suite pattern.',
    by: 'missing-domains, text-typography',
  },
  {
    name: 'accessibility',
    scope:
      'Accessibility tree: accessible name/role/description/state and focus order for display objects, over a backend (DOM ARIA on web; native host seam). Pairs with interaction/focus.',
    by: 'missing-domains, openfl-lime-parity',
  },
  {
    name: 'scene-format',
    scope:
      'Scene serialization: save/load the scene graph to a portable format and the versioned migration step the docs already promise for the string-kind model. The persistence seam.',
    by: 'missing-domains',
  },
  {
    name: 'devtools',
    scope:
      'Developer tooling: frame/timing stats, draw-call + triangle counters, scene-graph inspector, GPU timing, and an overlay — exported for SDK consumers.',
    by: 'missing-domains',
  },
  {
    name: 'testing',
    scope:
      'Consumer testing utilities: mock/fake backends for every *Backend seam, scene fixtures/builders, and golden-image (fingerprint/screenshot) helpers exported so SDK users can test their apps.',
    by: 'missing-domains',
  },
  {
    name: 'host-capacitor',
    scope:
      'Mobile host backend (Capacitor/Cordova) implementing the platform-suite seams on device: sensors, haptics, statusbar, share, webcam, filesystem, notifications, etc. The missing mobile host.',
    by: 'application-platform',
  },
  {
    name: 'host-tauri',
    scope:
      'A second desktop host backend (Tauri) implementing the window/app/dialog/clipboard/menu/tray/etc. seams — proving the seams are not Electron-shaped and giving a lighter desktop target.',
    by: 'application-platform',
  },
  {
    name: 'permission',
    scope:
      'Unified permission capability: query/request/observe permission state across geolocation, notifications, webcam, sensors, and filesystem, over a backend seam.',
    by: 'application-platform',
  },
  {
    name: 'purchase',
    scope:
      'In-app purchase / store / entitlements: product catalog, purchase flow, restore, receipt validation, subscription state, over a swappable store backend (App Store / Play / web).',
    by: 'application-platform',
  },
  {
    name: 'biometrics',
    scope:
      'Biometric auth + secure credential storage: Touch/Face ID / fingerprint prompt and a keychain/keystore-backed secure store, distinct from plaintext storage.',
    by: 'application-platform',
  },
  {
    name: 'mediasession',
    scope:
      'OS now-playing / lock-screen transport controls + metadata, and audio focus / interruption handling, complementing media.',
    by: 'application-platform',
  },
  {
    name: 'contacts',
    scope: 'Contacts integration: query/pick contacts over a host backend (web sentinel where unavailable).',
    by: 'application-platform',
  },
  {
    name: 'calendar',
    scope: 'Calendar/events integration: read/create events and reminders over a host backend.',
    by: 'application-platform',
  },
];

const PACKAGES = (args && args.packages) || DEFAULT_PACKAGES;
const MISSING = (args && args.missing) || DEFAULT_MISSING;

function depthMatPrompt(name) {
  return [
    'You are writing a MATURATION ROADMAP for ONE existing Flight SDK package: @flighthq/' + name + '.',
    '',
    'Inputs to read first:',
    '1. Its depth review: ' +
      REVIEWS +
      '/depth/' +
      name +
      '.md (the gaps already identified — build on them, do not just restate).',
    '2. Its source: ' +
      ROOT +
      '/packages/' +
      name +
      '/src and package.json (you may run `cd ' +
      ROOT +
      ' && npm run api ' +
      name +
      '`).',
    '3. The Package Map entry in ' + ROOT + '/tools/agents/docs/index.md for intended scope.',
    '',
    'Task: lay out how to mature this package across three tiers.',
    TIERS,
    '',
    CONVENTIONS,
    '',
    'Write your roadmap as Markdown to EXACTLY: ' + OUT_DEPTH + '/' + name + '.md',
    'Sections: title `# Maturation Roadmap: @flighthq/' +
      name +
      '`, then **Current verdict** (one line, from the depth review), `## Bronze`, `## Silver`, `## Gold` (each a concrete bullet list of named additions), and `## Sequencing & effort` (recommended order, dependencies on other packages/types, and any cross-package or design-decision items to surface).',
    'If the package is already authoritative, Bronze/Silver may be small polish and Gold should describe the genuine frontier. After writing, return the structured summary.',
  ].join('\n');
}

function breadthMatPrompt(p) {
  return [
    'You are SPECCING a NET-NEW Flight SDK package that the breadth reviews found missing: @flighthq/' + p.name + '.',
    '',
    'What it represents: ' + p.scope,
    'Requested by perspectives: ' + p.by + '.',
    '',
    'Inputs for context:',
    '1. The Package Map + architecture + design rules in ' +
      ROOT +
      '/tools/agents/docs/index.md (and rust/index.md for the Rust mirror).',
    '2. The breadth reviews under ' + REVIEWS + '/breadth/ from the requesting perspectives, for the rationale.',
    '3. Spot-check neighboring existing packages (e.g. similar -formats or backend-seam packages) for the house style; you may run `cd ' +
      ROOT +
      ' && npm run api <name>`.',
    '',
    'Task: design what this package would represent across three tiers of quality, exhaustiveness, and production-readiness.',
    TIERS,
    '',
    CONVENTIONS,
    '',
    'Write your spec as Markdown to EXACTLY: ' + OUT_BREADTH + '/' + p.name + '.md',
    'Sections: title `# New Package Spec: @flighthq/' +
      p.name +
      '`, then **Represents** (one line), **Requested by** (' +
      p.by +
      '), **Fits** (where it sits in the architecture: dependencies, neighbor packages, backend seam, Rust crate name), `## Bronze`, `## Silver`, `## Gold` (each a concrete bullet list naming the types/functions/capabilities — types in @flighthq/types first), `## Boundaries` (what stays out / lives in neighbors), and `## Open design questions`.',
    'Name functions and types concretely following the house naming rules. After writing, return the structured summary.',
  ].join('\n');
}

const DEPTH_MAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    package: { type: 'string' },
    currentVerdict: { type: 'string' },
    bronze: { type: 'array', items: { type: 'string' } },
    silver: { type: 'array', items: { type: 'string' } },
    gold: { type: 'array', items: { type: 'string' } },
    file: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['package', 'bronze', 'silver', 'gold', 'file', 'summary'],
};

const BREADTH_MAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    package: { type: 'string' },
    represents: { type: 'string' },
    requestedBy: { type: 'string' },
    bronze: { type: 'array', items: { type: 'string' } },
    silver: { type: 'array', items: { type: 'string' } },
    gold: { type: 'array', items: { type: 'string' } },
    file: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['package', 'bronze', 'silver', 'gold', 'file', 'summary'],
};

log(
  'Pass 1: ' +
    PACKAGES.length +
    ' depth-maturation agents. Pass 2: ' +
    MISSING.length +
    ' breadth (new-package) agents. All concurrent.',
);

const depthThunks = PACKAGES.map(
  (name) => () =>
    agent(depthMatPrompt(name), {
      label: 'mature:' + name,
      phase: 'DepthMaturation',
      agentType: 'general-purpose',
      schema: DEPTH_MAT_SCHEMA,
    }),
);

const breadthThunks = MISSING.map(
  (p) => () =>
    agent(breadthMatPrompt(p), {
      label: 'newpkg:' + p.name,
      phase: 'BreadthMaturation',
      agentType: 'general-purpose',
      effort: 'high',
      schema: BREADTH_MAT_SCHEMA,
    }),
);

const results = await parallel([...depthThunks, ...breadthThunks]);

const depth = [];
const breadth = [];
for (const r of results) {
  if (!r) continue;
  if (r.represents !== undefined || r.requestedBy !== undefined) breadth.push(r);
  else depth.push(r);
}
depth.sort((a, b) => a.package.localeCompare(b.package));
breadth.sort((a, b) => a.package.localeCompare(b.package));

log(
  'Depth maturation: ' +
    depth.length +
    '/' +
    PACKAGES.length +
    '. New-package specs: ' +
    breadth.length +
    '/' +
    MISSING.length +
    '.',
);

return {
  depth,
  breadth,
  depthCount: depth.length,
  breadthCount: breadth.length,
  expectedDepth: PACKAGES.length,
  expectedBreadth: MISSING.length,
};
