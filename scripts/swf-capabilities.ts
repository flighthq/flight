// The declared SWF capability enumeration — the identity every conformance number is keyed on.
//
// WHY THIS IS A DECLARED LIST AND NOT SOMETHING DERIVED. The evidence denominator ("how many documented
// capabilities does the corpus exercise at all") and the witness-depth count are both computed against
// this list, so it must be able to name a capability the corpus never reaches. A list derived from what
// a walk emitted could only ever contain what was already found, which would make the unexercised bucket
// an absence of evidence rather than a measurement.
//
// WHY THIS IS NOT A DIAGNOSTIC-KIND REGISTRY, WHICH IS THE OPPOSITE RULE. `ImportDiagnostic.kind` is a
// value colocated at each drop site and deliberately has no central list, because a registry drifts and
// preserves stale "cannot do X" claims after X is built (see packages/types/src/ImportDiagnostic.ts).
// The two are different axes and must never be unified: a CAPABILITY is something the importer can do
// and mostly emits no diagnostic at all, while a KIND names a place it declined. Several kinds here —
// container rejections — correspond to no capability whatsoever.
//
// Run `npm run capabilities` to regenerate `agents/packages/swf/capabilities.md` and `capabilities.json`.
// `npm run capabilities:check` (wired into `npm run check`) regenerates in memory and fails if the
// committed files differ, so the machine list and its doc rendering cannot drift apart.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// `id` is the machine key: dot-namespaced, format first, kebab within a segment, so it reads as one
// system with the diagnostic kinds without sharing their namespace. `label` is the human rendering and
// is the only thing that appears in a doc table.
interface SwfCapability {
  id: string;
  label: string;
}

// The four `axis:` entries are sub-features of a carried construct rather than constructs of their own,
// and they are first-class capabilities on purpose: a parent witness routinely never reaches the branch
// they name, so folding them into the parent would score a fixture as covering something it never
// exercises. That is the false-oracle shape this whole arc exists to prevent.
const CAPABILITIES: readonly SwfCapability[] = [
  { id: 'swf.audio.define-sound', label: 'audio: DefineSound' },
  { id: 'swf.audio.envelope', label: 'audio: envelope' },
  { id: 'swf.audio.in-point', label: 'audio: in point' },
  { id: 'swf.audio.loop-count', label: 'audio: loop count' },
  { id: 'swf.audio.out-point', label: 'audio: out point' },
  { id: 'swf.audio.sound-stream-block', label: 'audio: SoundStreamBlock' },
  { id: 'swf.audio.sound-stream-head', label: 'audio: SoundStreamHead' },
  { id: 'swf.audio.start-sound', label: 'audio: StartSound' },
  { id: 'swf.audio.start-sound-2', label: 'audio: StartSound2 (by class)' },
  { id: 'swf.axis.advanced-blend-mode', label: 'axis: advanced (destination-reading) blend modes' },
  { id: 'swf.axis.colour-transform-alpha-add', label: 'axis: colour transform alpha add' },
  { id: 'swf.axis.filter-colour-matrix', label: 'axis: colour-matrix filter folding into node adjustments' },
  { id: 'swf.axis.sound-format-non-mp3', label: 'axis: non-MP3 sound formats (ADPCM, Nellymoser, raw PCM)' },
  { id: 'swf.bitmap.define-bits-jpeg-2', label: 'bitmap: DefineBitsJPEG2' },
  { id: 'swf.bitmap.define-bits-jpeg-3', label: 'bitmap: DefineBitsJPEG3 (separate alpha)' },
  { id: 'swf.bitmap.define-bits-jpeg-4', label: 'bitmap: DefineBitsJPEG4' },
  { id: 'swf.bitmap.define-bits-jpeg-tables', label: 'bitmap: DefineBits + JPEGTables' },
  { id: 'swf.bitmap.lossless-15-bit', label: 'bitmap: lossless format 15-bit' },
  { id: 'swf.bitmap.lossless-24-32-bit', label: 'bitmap: lossless format 24/32-bit' },
  { id: 'swf.bitmap.lossless-colormapped', label: 'bitmap: lossless format colormapped' },
  { id: 'swf.bitmap.lossless-with-alpha', label: 'bitmap: lossless with alpha' },
  { id: 'swf.document.set-background-colour', label: 'document: SetBackgroundColor' },
  { id: 'swf.fill.bitmap', label: 'fill: bitmap' },
  { id: 'swf.fill.bitmap-clamp-nearest', label: 'fill: bitmap clamp/nearest' },
  { id: 'swf.fill.bitmap-clamp-smoothed', label: 'fill: bitmap clamp/smoothed' },
  { id: 'swf.fill.bitmap-repeat-nearest', label: 'fill: bitmap repeat/nearest' },
  { id: 'swf.fill.bitmap-repeat-smoothed', label: 'fill: bitmap repeat/smoothed' },
  { id: 'swf.fill.focal-gradient', label: 'fill: focal gradient' },
  { id: 'swf.fill.gradient-interpolation-mode', label: 'fill: gradient interpolation mode' },
  { id: 'swf.fill.gradient-spread-mode', label: 'fill: gradient spread mode' },
  { id: 'swf.fill.linear-gradient', label: 'fill: linear gradient' },
  { id: 'swf.fill.radial-gradient', label: 'fill: radial gradient' },
  { id: 'swf.fill.solid', label: 'fill: solid' },
  { id: 'swf.font.define-font', label: 'font: DefineFont' },
  { id: 'swf.font.define-font-2', label: 'font: DefineFont2' },
  { id: 'swf.font.define-font-3', label: 'font: DefineFont3' },
  { id: 'swf.font.define-font-info', label: 'font: DefineFontInfo' },
  { id: 'swf.linkage.export-assets', label: 'linkage: ExportAssets' },
  { id: 'swf.linkage.symbol-class', label: 'linkage: SymbolClass' },
  { id: 'swf.morph.define-morph-shape', label: 'morph: DefineMorphShape' },
  { id: 'swf.morph.define-morph-shape-2', label: 'morph: DefineMorphShape2' },
  { id: 'swf.placement.background-colour', label: 'placement: background colour' },
  { id: 'swf.placement.blend-mode', label: 'placement: blend mode' },
  { id: 'swf.placement.cache-as-bitmap', label: 'placement: cache-as-bitmap' },
  { id: 'swf.placement.class-name', label: 'placement: class name' },
  { id: 'swf.placement.clip-actions', label: 'placement: clip actions' },
  { id: 'swf.placement.clip-depth', label: 'placement: clip depth (mask)' },
  { id: 'swf.placement.colour-transform', label: 'placement: colour transform' },
  { id: 'swf.placement.filter-list', label: 'placement: filter list' },
  { id: 'swf.placement.instance-name', label: 'placement: instance name' },
  { id: 'swf.placement.place-object', label: 'placement: PlaceObject (legacy)' },
  { id: 'swf.placement.place-object-2', label: 'placement: PlaceObject2' },
  { id: 'swf.placement.place-object-3', label: 'placement: PlaceObject3' },
  { id: 'swf.placement.place-object-4', label: 'placement: PlaceObject4' },
  { id: 'swf.placement.ratio', label: 'placement: ratio' },
  { id: 'swf.placement.remove-object', label: 'placement: RemoveObject' },
  { id: 'swf.placement.remove-object-2', label: 'placement: RemoveObject2' },
  { id: 'swf.placement.visible-flag', label: 'placement: visible flag' },
  { id: 'swf.scale9.define-scaling-grid', label: 'scale9: DefineScalingGrid' },
  { id: 'swf.script.do-abc', label: 'script: DoABC' },
  { id: 'swf.script.do-abc-anonymous', label: 'script: DoABC anonymous' },
  { id: 'swf.script.do-action', label: 'script: DoAction (AVM1)' },
  { id: 'swf.script.do-init-action', label: 'script: DoInitAction' },
  { id: 'swf.shape.define-shape', label: 'shape: DefineShape' },
  { id: 'swf.shape.define-shape-2', label: 'shape: DefineShape2' },
  { id: 'swf.shape.define-shape-3', label: 'shape: DefineShape3' },
  { id: 'swf.shape.define-shape-4', label: 'shape: DefineShape4' },
  { id: 'swf.stroke.has-fill', label: 'stroke: has fill instead of colour' },
  { id: 'swf.stroke.line-style', label: 'stroke: line style' },
  { id: 'swf.stroke.miter-limit', label: 'stroke: miter limit' },
  { id: 'swf.stroke.non-round-cap', label: 'stroke: non-round cap' },
  { id: 'swf.stroke.non-round-join', label: 'stroke: non-round join' },
  { id: 'swf.text.define-edit-text', label: 'text: DefineEditText' },
  { id: 'swf.text.define-text', label: 'text: DefineText' },
  { id: 'swf.text.define-text-2', label: 'text: DefineText2' },
  { id: 'swf.timeline.define-scene-and-frame-label-data', label: 'timeline: DefineSceneAndFrameLabelData' },
  { id: 'swf.timeline.define-sprite', label: 'timeline: DefineSprite' },
  { id: 'swf.timeline.frame-label', label: 'timeline: FrameLabel' },
  { id: 'swf.video.define-video-stream', label: 'video: DefineVideoStream' },
  { id: 'swf.video.video-frame', label: 'video: VideoFrame' },
];

export function formatSwfCapabilitiesJson(): string {
  return `${JSON.stringify({ capabilities: CAPABILITIES, count: CAPABILITIES.length }, null, 2)}\n`;
}

export function formatSwfCapabilitiesMarkdown(): string {
  const rows = CAPABILITIES.map((capability) => `| \`${capability.id}\` | ${capability.label} |`).join('\n');
  return `---
package: '@flighthq/swf'
generated: true
---

# swf — declared capabilities

<!-- GENERATED by \`npm run capabilities\` from scripts/swf-capabilities.ts. DO NOT EDIT BY HAND. -->

The identity every conformance number is keyed on: the evidence denominator, the witness-depth count, and
the targeted-run selector all resolve against these ids. **A capability id is not a diagnostic kind** —
kinds live at their drop sites and have no central list on purpose, most capabilities emit no diagnostic
at all, and several kinds (the container rejections) name no capability.

Listing a capability here does not claim the corpus reaches it. Which ones it does reach, and how deeply,
is measured in [fixture-evidence.md](fixture-evidence.md#what-the-corpus-actually-exercises).

${CAPABILITIES.length} declared.

| Id | Capability |
| --- | --- |
${rows}
`;
}

export function verifySwfCapabilityIds(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const capability of CAPABILITIES) {
    if (seen.has(capability.id)) problems.push(`duplicate id: ${capability.id}`);
    seen.add(capability.id);
    if (!/^swf(\.[a-z0-9]+(-[a-z0-9]+)*)+$/.test(capability.id)) problems.push(`malformed id: ${capability.id}`);
  }
  const sorted = CAPABILITIES.map((capability) => capability.id)
    .slice()
    .sort();
  for (let index = 0; index < CAPABILITIES.length; index++) {
    if (CAPABILITIES[index].id !== sorted[index]) {
      problems.push(`out of order at ${index}: ${CAPABILITIES[index].id} should be ${sorted[index]}`);
      break;
    }
  }
  return problems;
}

const REPO_ROOT = join(import.meta.dirname, '..');
const CELL_DIR = join(REPO_ROOT, 'agents', 'packages', 'swf');
const MARKDOWN_PATH = join(CELL_DIR, 'capabilities.md');
const JSON_PATH = join(CELL_DIR, 'capabilities.json');

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function main(): void {
  const problems = verifySwfCapabilityIds();
  if (problems.length > 0) {
    console.error(`✗ declared capability list is malformed:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }

  const markdown = formatSwfCapabilitiesMarkdown();
  const json = formatSwfCapabilitiesJson();
  if (process.argv.includes('--check')) {
    const stale = [
      readIfPresent(MARKDOWN_PATH) === markdown ? null : 'agents/packages/swf/capabilities.md',
      readIfPresent(JSON_PATH) === json ? null : 'agents/packages/swf/capabilities.json',
    ].filter((entry): entry is string => entry !== null);
    if (stale.length > 0) {
      console.error(`✗ stale, run \`npm run capabilities\`:\n  ${stale.join('\n  ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`OK ${CAPABILITIES.length} declared SWF capabilities, renderings current`);
    return;
  }

  writeFileSync(MARKDOWN_PATH, markdown);
  writeFileSync(JSON_PATH, json);
  console.log(`✓ wrote ${CAPABILITIES.length} declared SWF capabilities`);
}

main();
