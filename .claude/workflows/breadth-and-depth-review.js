// Breadth-and-Depth Review
// =========================
// Two independent fleets of agents review the SDK and each writes its own Markdown doc:
//
//   DEPTH   — one agent per package. Taken IN ISOLATION, does the package have the depth of a
//             robust, exhaustive, AUTHORITATIVE library for its domain? (Is "easing" an
//             authoritative easing lib alone? Is "path" an authoritative path lib?)
//   BREADTH — one agent per stakeholder PERSPECTIVE. From a 1000-foot view, does the whole
//             package set cover the breadth that perspective expects? (missing categories, thin
//             areas, cross-package coherence).
//
// The two fleets are independent and run concurrently in a single parallel() barrier.
//
// Output (each agent writes its own file):
//   <root>/tools/agents/docs/reviews/depth/<package>.md
//   <root>/tools/agents/docs/reviews/breadth/<perspective-key>.md
// The workflow returns { depth[], breadth[] } summaries; write an index.md from those after the run.
//
// HOW TO RUN
//   Workflow({ name: 'breadth-and-depth-review' })                         // uses defaults below
//   Workflow({ name: 'breadth-and-depth-review', args: { ... } })         // override any of root/packages/perspectives
//
// HOW TO IMPROVE FOR FUTURE RUNS (edit this file, or pass args)
//   • root        — absolute worktree root. Override per checkout via args.root.
//   • packages    — the package short-names (no @flighthq/ prefix). Regenerate the list with:
//                     for d in packages/*/; do node -p "require('./$d/package.json').name" 2>/dev/null; done \
//                       | sed 's#@flighthq/##' | sort
//   • perspectives— add/remove/retune the breadth lenses. Each is { key, title, lens }.
//   • Tune the depth/breadth prompts (depthPrompt / breadthPrompt) and the doc section template.
//   • Add a verification stage (a skeptic per review) if you want findings adversarially checked.
//
// args shape (all optional): { root: string, packages: string[], perspectives: {key,title,lens}[] }

export const meta = {
  name: 'breadth-and-depth-review',
  description:
    'Depth review per package (authoritative-in-isolation?) + breadth review per stakeholder perspective (coverage across all packages); each agent writes its own doc',
  whenToUse: 'Audit SDK maturity: per-package depth and cross-package breadth, as committed Markdown reviews.',
  phases: [
    { title: 'Depth', detail: 'one agent per package — is it authoritative taken alone?' },
    { title: 'Breadth', detail: 'one agent per perspective — does the package set cover what they expect?' },
  ],
};

const ROOT = (args && args.root) || '/home/joshua/Development/flight/worktrees/review';
const DEPTH_DIR = ROOT + '/tools/agents/docs/reviews/depth';
const BREADTH_DIR = ROOT + '/tools/agents/docs/reviews/breadth';

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

const DEFAULT_PERSPECTIVES = [
  {
    key: 'game-2d',
    title: '2D Game Developer',
    lens: 'You are shipping a complete 2D action/platformer game. You care about sprites, tilemaps, sprite batching, particles, animation, frame/movie timelines, collision & hit detection, pointer/keyboard/gamepad input, audio sfx/music, cameras/viewport, object pooling, and a render loop. Walk the whole package set and judge whether the breadth lets you build a full game without leaving the SDK.',
  },
  {
    key: 'animation-motion',
    title: 'Animation & Motion Designer',
    lens: 'You build rich animated/motion-graphics experiences. You care about tweening, easing curves, timelines/keyframes, spritesheet & cel animation, MovieClip-style playback, sequencing/staggering, springs, velocity/physics-driven motion, and time control. Judge whether the package set covers the full motion toolbox.',
  },
  {
    key: 'rendering-gpu',
    title: 'Rendering / GPU Engineer',
    lens: 'You care about the renderer architecture: render core + GL/WebGPU backends, per-subject leaf renderers, render state/queue/update pipeline, materials/shaders, textures/samplers/render targets, blending, masking/clipping, post-process effects and filters across backends, surface/pixel access, and color management. Judge whether the rendering stack is complete and coherent across backends.',
  },
  {
    key: 'application-platform',
    title: 'Application & OS-Platform Integration Developer',
    lens: 'You build a desktop/mobile application. You care about the app/window lifecycle, windowing, and the full platform-integration suite: clipboard, dialogs, filesystem, notifications, shell, menu, tray, shortcuts, screen, storage, device, share, haptics, geolocation, statusbar, network/power/lifecycle/keyboard/sensors events, app/protocol/updater/ipc, and host adapters. Judge whether an app developer has every OS-integration capability they expect.',
  },
  {
    key: 'text-typography',
    title: 'Text & Typography / i18n Engineer',
    lens: 'You render correct international text. You care about the text stack: layout, shaping (HarfBuzz-class GSUB/GPOS), bidi, rich/multi-format text, single-format labels, native text fields, text input/editing, font resources, measurement, line breaking, and per-backend text rendering. Judge whether the text breadth supports correct Latin AND complex-script typography.',
  },
  {
    key: 'asset-pipeline',
    title: 'Asset & Resource Pipeline Engineer',
    lens: 'You care about loading and managing assets: image/audio/video/font resources, texture atlases, tilesets, spritesheets and their formats, batch/parallel loaders with progress & retry, caching, and media playback. Judge whether the breadth provides a complete asset pipeline from disk/network to GPU.',
  },
  {
    key: 'spatial-3d',
    title: '3D / Spatial Graphics Developer',
    lens: 'You build 3D/spatial content. You care about the 3D scene graph, meshes & geometry builders, cameras & projections, lighting, materials, textures/cubemaps/samplers, and 3D rendering across backends. Judge how complete the 3D story is relative to a mature 3D layer (acknowledging it is a younger road in this SDK).',
  },
  {
    key: 'openfl-lime-parity',
    title: 'OpenFL / Lime Feature-Parity Auditor',
    lens: 'OpenFL+Lime define the FEATURE TARGET (not the API). Audit whether every capability OpenFL/Lime offer is reachable here: display list, vector graphics/Graphics drawing, BitmapData/pixel ops, filters, blend modes, text/text fields, tilemaps, sound (incl. transforms), video, net/URLLoader/URLRequest, events, geom, system/stage, accessibility, and assets. Flag OpenFL/Lime features with no home in the package set.',
  },
  {
    key: 'missing-domains',
    title: 'Cross-Cutting Architect — Absent Categories',
    lens: 'Take the 1000-foot view and hunt for ENTIRE categories that are missing or notably thin, that a mature application/graphics SDK would be expected to offer: networking/HTTP/websockets, accessibility/a11y, scene serialization & migration, asset/build tooling, physics/collision systems, audio DSP/spatial audio, video pipeline, internationalization/localization, state/data binding, math beyond geometry, debugging/devtools/profiling, security, and testing utilities. Judge the breadth for structural blind spots rather than per-package depth.',
  },
];

const PACKAGES = (args && args.packages) || DEFAULT_PACKAGES;
const PERSPECTIVES = (args && args.perspectives) || DEFAULT_PERSPECTIVES;

function depthPrompt(name) {
  return [
    'You are reviewing ONE package of the Flight SDK in ISOLATION: @flighthq/' +
      name +
      ' (source at ' +
      ROOT +
      '/packages/' +
      name +
      ').',
    '',
    'Question: taken ALONE, does this package have the depth of a robust, exhaustive, AUTHORITATIVE, full-featured library for its domain? (e.g. would "easing" stand as an authoritative easing library on its own? would "path" stand as an authoritative path library?)',
    '',
    'Method:',
    '1. Read ' +
      ROOT +
      '/packages/' +
      name +
      '/package.json and the source under ' +
      ROOT +
      '/packages/' +
      name +
      '/src (skim the exported surface; you may run `cd ' +
      ROOT +
      ' && npm run api ' +
      name +
      '` for a compact signature list).',
    '2. Read the relevant entry in ' +
      ROOT +
      '/tools/agents/docs/index.md (Package Map) for the intended scope. Note the project rule: every package should reach "AAA completeness" — canonical, industry-recognized scope and naming for its domain.',
    '3. Independently derive the CANONICAL feature set a mature, industry-standard library in THIS domain is expected to provide, then compare what exists against that bar. Be concrete and domain-specific (name the specific functions/features that are present vs missing).',
    '',
    'Judge depth only (do NOT judge whether other packages exist — that is a separate breadth review). Account for the entity/runtime + free-function + tree-shakable style; missing-by-design is different from missing-by-omission, so call out which.',
    '',
    'Write your review as Markdown to EXACTLY this path: ' + DEPTH_DIR + '/' + name + '.md',
    'Use these sections: a title `# Depth Review: @flighthq/' +
      name +
      '`, then **Domain**, **Verdict** (one of: authoritative / solid / partial / stub) with a completeness score NN/100, then `## Present capabilities`, `## Gaps vs an authoritative <domain> library`, `## Naming / API-shape notes`, `## Recommendation`.',
    'Be specific and honest — a stub is a stub. After writing the file, return the structured summary.',
  ].join('\n');
}

function breadthPrompt(p) {
  return [
    'You are giving a BREADTH review of the entire Flight SDK package set from ONE perspective:',
    '',
    'PERSPECTIVE: ' + p.title,
    'LENS: ' + p.lens,
    '',
    'This is a 1000-foot view. Do NOT deeply audit any single package. Instead judge whether the BREADTH of packages covers what someone with this perspective expects from a complete SDK.',
    '',
    'Method:',
    '1. Read the Package Map and architecture in ' +
      ROOT +
      '/tools/agents/docs/index.md (it lists every package with a one-line description). This is your map of the 1000-foot view.',
    '2. The full package list is: ' + PACKAGES.join(', ') + '.',
    '3. You may spot-check a few package roots with `cd ' +
      ROOT +
      ' && npm run api <name>` if a name is ambiguous, but stay at the breadth level.',
    '4. Note the SDK explicitly targets OpenFL/Lime feature parity plus a full application/platform layer and a Rust port.',
    '',
    'From your perspective, decide: what is well covered, what whole capabilities or packages are missing or too thin, and whether the set hangs together for your use case. Suggest concrete packages/capabilities that should exist.',
    '',
    'Write your review as Markdown to EXACTLY this path: ' + BREADTH_DIR + '/' + p.key + '.md',
    'Use these sections: a title `# Breadth Review: ' +
      p.title +
      '`, then **Lens** (one sentence), **Coverage** NN/100, then `## What a complete SDK owes this perspective`, `## Well covered`, `## Gaps & missing capabilities`, `## Missing or too-thin packages I would expect`, `## Verdict`.',
    'After writing the file, return the structured summary.',
  ].join('\n');
}

const DEPTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    package: { type: 'string' },
    domain: { type: 'string' },
    verdict: { type: 'string', enum: ['authoritative', 'solid', 'partial', 'stub'] },
    completeness: { type: 'number' },
    present: { type: 'array', items: { type: 'string' } },
    missing: { type: 'array', items: { type: 'string' } },
    file: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['package', 'domain', 'verdict', 'completeness', 'missing', 'file', 'summary'],
};

const BREADTH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    perspective: { type: 'string' },
    coverage: { type: 'number' },
    wellCovered: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    missingPackages: { type: 'array', items: { type: 'string' } },
    file: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['perspective', 'coverage', 'gaps', 'missingPackages', 'file', 'summary'],
};

log('Launching ' + PACKAGES.length + ' depth agents + ' + PERSPECTIVES.length + ' breadth agents, all concurrent.');

const depthThunks = PACKAGES.map(
  (name) => () =>
    agent(depthPrompt(name), {
      label: 'depth:' + name,
      phase: 'Depth',
      agentType: 'general-purpose',
      schema: DEPTH_SCHEMA,
    }),
);

const breadthThunks = PERSPECTIVES.map(
  (p) => () =>
    agent(breadthPrompt(p), {
      label: 'breadth:' + p.key,
      phase: 'Breadth',
      agentType: 'general-purpose',
      effort: 'high',
      schema: BREADTH_SCHEMA,
    }),
);

const results = await parallel([...depthThunks, ...breadthThunks]);

const depth = [];
const breadth = [];
for (const r of results) {
  if (!r) continue;
  if (r.perspective !== undefined) breadth.push(r);
  else depth.push(r);
}

depth.sort((a, b) => a.completeness - b.completeness);
breadth.sort((a, b) => a.coverage - b.coverage);

log(
  'Depth done: ' +
    depth.length +
    '/' +
    PACKAGES.length +
    '. Breadth done: ' +
    breadth.length +
    '/' +
    PERSPECTIVES.length +
    '.',
);

return { depth, breadth, depthCount: depth.length, breadthCount: breadth.length };
