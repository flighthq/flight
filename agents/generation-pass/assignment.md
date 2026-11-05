# Generation Pass: Package-by-Package Alignment

## Goal

Run every package with a Rust counterpart through a generate-evaluate-patch cycle. The output is an aligned TS codebase where every package owns its types, plus a structured compiler backlog for future improvement rounds.

## Rules

### Compiler is frozen
The compiler is pinned at its current version for the entire pass. No changes to `crates/flight-compiler/` for any reason. If the compiler can't handle a pattern, note it in the log and move on. Compiler improvements are a separate future workstream that consumes the log this pass produces.

### Packages are done-done
Once a package is committed, it is not revisited during this pass — not when the next package reveals a pattern, not when another builder finds a better approach, not for any reason. A future regeneration round is a separate proposal. This is the single most important rule: it breaks the revisitation cycle that has been burning tokens.

### One package at a time, sequential
No parallel package work. This respects shared CPU and keeps progress legible.

### Budget: 30 minutes per package, hard cap
If a package can't be resolved in 30 minutes, skip it. Log why and move to the next. A skipped package is not a failure — it's data.

### No rollbacks
Once a package is committed, it stays committed. Forward only.

## Per-Package Procedure

### Step 1: Generate
Run the compiler against the Rust crate, output to a scratch directory (not in-place). This produces the compiler's best attempt at TS for every source file in the crate.

### Step 2: Evaluate
Diff the generated output against the hand-written TS. Classify the delta:

- **Close**: generated output is structurally correct, needs minor patches (wrong import paths, missing a helper, off-by-one in an edge case). Threshold: fewer than ~10 manual edits per file on average.
- **Far**: generated output is missing large sections, has wrong architecture, or would need rewriting. More than half the file would be hand-patched.

### Step 3: Act (builder decides, no escalation)

**If close:** Adopt the generated sources. Patch to pass tests. Commit.

**If far:** Keep the hand-written sources. Patch them to align with the Rust shapes:
- Move any types this package owns out of `@flighthq/types` into the package's contract lane
- Update signatures to match Rust (parameter order, nullability, return types) where the Rust shape is clearly better
- Update imports across consumers
- Commit.

**Either way:** the package ends up with types it owns, signatures aligned to Rust, and passing tests.

### Step 4: Log
Append to `agents/generation-pass/log.jsonl` (one JSON object per file processed):

```json
{
  "package": "@flighthq/math",
  "file": "scalar.ts",
  "decision": "generated" | "handwritten",
  "patches": ["description of each manual patch applied"],
  "compiler_gaps": ["pattern the compiler couldn't handle"],
  "types_moved": ["TypeName from @flighthq/types to @flighthq/math"]
}
```

This log is the compiler backlog. Each `compiler_gaps` entry is a concrete improvement target.

### Step 5: Verify and commit
Run `npm run fix`, then `npm run check <package>` and `npm run test <package>`. Single commit per package: `chore(<package>): align with Rust generation pass`. Move on.

## Package Order (leaf-first)

Process in this order. Packages earlier in the list have fewer SDK dependencies and are safer to align first.

### Tier 1 — Leaf packages (0-1 SDK deps)
entity, resource, binpack, importdiagnostics, webcam, host, encoding, haptics, buffer, xml, requirement, registry, color, math, easing, spring, signals, layout, abc, path-formats, useragent (via platform)

### Tier 2 — Low-dependency packages (2-4 SDK deps)
geometry, log, accessibility, path, camera, clock, collision, flow, snapshot, spatial, statechart, debug, shell, motionpath, velocity, capture, path-boolean, tween, sensors

### Tier 3 — Mid-dependency packages (5-10 SDK deps)
clip, font, animation, texture, materials, adjustments, input, lifecycle, menu, screen, meshgeometry, shading, selection, textformat, textsegment, textbidi, text-markup, net, loader, assets, audio, dialog, intl, ipc, keyboard, power, connectivity, notification, geolocation, permissions, filesystem, lighting, shape, camera-controls, skeleton2d, particles, spritesheet, timeline

### Tier 4 — High-dependency packages (10+ SDK deps)
node, text, textshaper, textlayout, textinput, bitmapfont, bitmaptext, scene2d, scene3d, render, effects, quadbatch, tilemap, interaction, gui, media, video, image, bitmap, glyphatlas, textureatlas, movieclip, particleemitter, surface, app, skeleton3d, picking

### Tier 5 — Renderer and format packages (highest dependency, most complex)
render-gl, render-wgpu, effects-gl, effects-wgpu, scene2d-gl, scene2d-wgpu, scene3d-gl, scene3d-wgpu, scene2d-formats, scene3d-formats, scene2d-resources, scene3d-resources, font-formats, bitmapfont-formats, skeleton2d-formats, spritesheet-formats, textureatlas-formats, texture-formats, tilemap-formats, particles-formats, path-boolean, shape-formats, image-codec, scene-document, swf, command, tokens, gizmo, preferences

### Tier 6 — Barrel
sdk (last — re-exports everything, process after all others)

## Foreman Role

1. Maintain the queue — track which package is current, which are done, which were skipped
2. Assign one package at a time to one builder
3. Collect the log entry when the builder commits
4. Do not audit quality, do not probe, do not evaluate readiness
5. If a builder is stuck past 30 minutes, tell it to skip and log

## What This Is Not

- Not a compiler improvement pass (no changes to flight-compiler)
- Not a full regeneration (the compiler runs once, then humans patch)
- Not a quality audit (the builder makes pragmatic calls, not perfect ones)
- Not reversible per-package (committed = done, move forward)

## Success Criteria

- Every package with a Rust counterpart has been processed (generated, evaluated, patched or kept, committed)
- `@flighthq/types` has fewer exported type declarations than it started with (target: as many moved as possible)
- `agents/generation-pass/log.jsonl` contains a complete record of decisions and compiler gaps
- All packages pass their own tests
