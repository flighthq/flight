import { easeCubicBezier } from '@flighthq/easing/contract';
import { collectImportDiagnostics } from '@flighthq/importdiagnostics/contract';
import { applyAnimationClipToSkeleton2D, cloneSkeleton2D } from '@flighthq/skeleton2d/contract';
import type { RegionAttachment2D } from '@flighthq/types/contract';
import { RegionAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseSpineSkeletonBinary } from './spineBinaryParse';

describe('parseSpineSkeletonBinary', () => {
  // EVERY PREFIX OF A VALID FILE, not a handful of chosen cut points. Truncation is the one malformation
  // a corpus can never supply — no exporter emits a half-written file — and it is the one the parser has
  // the most machinery for: `isSpineBinaryReaderOverrun` is a sticky mark, and 38 of this file's loops are
  // written `for (i = 0; i < n && !isSpineBinaryReaderOverrun(reader); i++)` specifically to bail out on it.
  // None of that containment had a test.
  //
  // The property is CONTAINMENT, not correctness: a prefix has no right answer, so there is nothing to
  // assert about what comes back except that it came back. What this catches, verified by removing the
  // guard from `readSpineBinaryFloat` and watching it go red, is a read that stops guarding the buffer end
  // — a DataView RangeError thrown from deep inside a record on somebody's truncated download.
  //
  // What it does NOT catch, also verified: the per-loop overrun checks. Truncation is contained by the
  // READER alone, since every read past the end returns a neutral value, so those loops finish quickly
  // whether or not they test for overrun. Deleting one leaves this test green. The input that discriminates
  // them is an inflated count, which is the test above — the two malformations look alike and are not.
  // THE OTHER MALFORMATION, and the one the loop guards actually exist for. Truncation is contained by the
  // READER alone — once overrun, every read returns a neutral value — so the per-loop overrun checks are
  // invisible to it. What they contain is an INFLATED COUNT: a declared count is a varint the file supplies,
  // and a corrupt or hostile one declares two billion bones in thirty bytes. The reader keeps returning
  // neutral values forever while the loop keeps allocating a bone per iteration.
  //
  // MEASURED, so the margin is not a guess: with the guard this parse returns in ~1ms; with the guard
  // removed the same thirty bytes did not finish in 60 SECONDS. The assertion below is on the bone count
  // rather than on elapsed time, because a count is deterministic where a clock is not — but note that a
  // regression here shows up as this file timing out rather than as this assertion failing, since the
  // unguarded parse never reaches a return.
  // The same hazard one level deeper, and the one that actually bit. A weighted mesh declares an influence
  // count PER VERTEX, inside a loop whose outer bound is already guarded — so the outer guard is consulted
  // between vertices while this inner loop pushes four values a turn. Before the guard on it, this exact
  // input threw `RangeError: Invalid array length` out of `Array.push` after ~4.2 SECONDS and several
  // gigabytes, from 327 bytes. The parser is documented to treat third-party bytes as untrusted and to
  // return sentinels rather than raise, so a throw here is a contract violation, not merely slow.
  // THE WHOLE COUNT-GUARD FAMILY IN ONE SWEEP, and it is only affordable because the guards exist. Every
  // count in this format is a varint the file supplies and a loop bound the parser obeys, and there are 36
  // such loops; a case per loop would pin the loops that EXIST and miss the next one added. So instead:
  // splice an inflated five-byte varint over each byte position in turn and require the parse to come back.
  // A position that lands on a count inflates it; a position that lands elsewhere is garbage the parser must
  // survive anyway. Neither needs to know where the counts are, which is the point.
  //
  // MEASURED BOTH WAYS, and the difference is the reason this test can exist at all: before the bounds
  // checks landed, this sweep did not finish — one position allocated until it threw and another never
  // returned. With them, all 359 positions complete in ~47ms, worst case 3ms. So it is simultaneously a
  // regression net for the denial-of-service class and cheap enough to keep. If a guard is ever removed,
  // this file stops finishing rather than reporting a failed assertion.
  it('survives an inflated count spliced at every byte position of a valid file', () => {
    const base = buildSpineBinary({ animations: true, bezier: true, ikConstraints: 1, weightedMesh: true });

    for (let at = 0; at < base.length; at++) {
      const spliced = Uint8Array.from([
        ...base.subarray(0, at),
        0xff,
        0xff,
        0xff,
        0xff,
        0x07, // varint 0x7fffffff, in place of whatever byte was here
        ...base.subarray(at + 1),
      ]);
      let result: ReturnType<typeof parseSpineSkeletonBinary> | undefined;
      expect(() => {
        result = parseSpineSkeletonBinary(spliced);
      }, `inflated varint spliced at byte ${at} of ${base.length}`).not.toThrow();

      // Restored now that the importer bounds a bone's parent — see the note that used to sit below.
      // A skeleton handed back from a corrupt file must still be one `validateSkeleton2D` would accept,
      // because a caller who got a non-null return has no reason to go and ask.
      const bones = result?.skeleton.bones;
      if (bones === undefined) continue;
      for (const bone of bones) {
        expect(bone.parentIndex, `parentIndex after splice at ${at}`).toBeLessThan(bones.length);
        expect(bone.parentIndex, `parentIndex after splice at ${at}`).toBeGreaterThanOrEqual(-1);
      }
    }
  });

  // The two ALLOCATION-shaped counts, which the per-loop overrun guards cannot help with because the array
  // is sized from the file's number before the first read. Measured before the bounds check existed, on a
  // 304-byte valid file with one varint rewritten: the triangle count RETURNED AFTER 59 SECONDS and the
  // vertex count never returned at all. The 59-second one is the more dangerous of the pair — it produces
  // a correct answer with no exception and no crumb, so nothing about it tells a caller it happened.
  //
  // Asserted on the crumb rather than on elapsed time: a clock is flaky and a diagnostic is not, and the
  // crumb is also the thing a caller acts on. A regression that reinstates the hang fails this file by
  // timing out rather than by this assertion, since an unbounded parse never reaches a return.
  it.each([
    [
      'vertex',
      [
        0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3f, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3f,
        0x80, 0x00, 0x00, 0x3f, 0x80, 0x00, 0x00,
      ],
      'vertexCount',
    ],
    ['triangle', [0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x02], 'triangleCount'],
  ] as const)('refuses a mesh %s count the remaining bytes cannot satisfy', (_label, marker, field) => {
    const base = buildSpineBinary();
    let at = -1;
    for (let i = 0; at < 0 && i + marker.length <= base.length; i++) {
      if (marker.every((byte, k) => base[i + k] === byte)) at = i;
    }
    expect(at, `${field} marker not found — the builder's mesh layout moved`).toBeGreaterThanOrEqual(0);
    const hostile = Uint8Array.from([...base.subarray(0, at), 0xff, 0xff, 0xff, 0xff, 0x07, ...base.subarray(at + 1)]);

    const crumbs = collectImportDiagnostics((sink) => {
      expect(() => parseSpineSkeletonBinary(hostile, sink)).not.toThrow();
    });

    const crumb = crumbs.find((c) => c.kind === 'spine.binary-count-unsatisfiable');
    expect(crumb, 'no crumb named the unsatisfiable count').toBeDefined();
    expect(crumb!.detail).toMatchObject({ field });
  });

  it('contains an influence count the file inflates, rather than pushing until push throws', () => {
    const base = buildSpineBinary({ weightedMesh: true });
    // Vertex 0 of the weighted block: varint(1) influence count, varint(1) bone index, then x, y, weight.
    const marker = [0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3f, 0x80, 0x00, 0x00];
    let at = -1;
    for (let i = 0; at < 0 && i + marker.length <= base.length; i++) {
      if (marker.every((byte, k) => base[i + k] === byte)) at = i;
    }
    // If the builder's weighted layout ever changes this goes looking for the wrong bytes, and a test that
    // silently stops testing is worse than one that fails.
    expect(at, 'influence-count byte not found in the built weighted mesh').toBeGreaterThanOrEqual(0);

    // Replace the single-byte count with a 5-byte varint for 0x7fffffff.
    const hostile = Uint8Array.from([...base.subarray(0, at), 0xff, 0xff, 0xff, 0xff, 0x07, ...base.subarray(at + 1)]);

    expect(() => parseSpineSkeletonBinary(hostile)).not.toThrow();
  });

  it('contains a count the file inflates, rather than allocating what it declares', () => {
    const out: number[] = [];
    for (let i = 0; i < 8; i++) out.push(0); // export hash
    writeString(out, '4.1.17');
    for (let i = 0; i < 4; i++) writeFloat(out, 0); // authoring bounds
    out.push(0); // nonessential
    writeVarint(out, 0); // string table, empty
    writeVarint(out, 0x7fffffff); // BONE COUNT — two billion, in a file with no bones after it

    const result = parseSpineSkeletonBinary(Uint8Array.from(out));

    // It must stop when the bytes run out, not when the count says to.
    expect(result).not.toBeNull();
    expect(result!.skeleton.bones.length).toBeLessThan(4);
  });

  it('survives every truncation of a valid file, returning rather than throwing or spinning', () => {
    const complete = buildSpineBinary({
      animations: true,
      bezier: true,
      ikConstraints: 2,
      nonessential: true,
      weightedMesh: true,
    });

    for (let length = 0; length <= complete.length; length++) {
      const truncated = complete.subarray(0, length);
      let result: ReturnType<typeof parseSpineSkeletonBinary> | undefined;
      expect(() => {
        result = parseSpineSkeletonBinary(truncated);
      }, `truncated to ${length} of ${complete.length} bytes`).not.toThrow();

      // Whatever survives must still be internally coherent: a bone may not name a parent outside the
      // array, which is the shape a half-read count corrupts first and which nothing downstream re-checks.
      if (result != null) {
        const bones = result.skeleton.bones;
        for (const bone of bones) {
          expect(bone.parentIndex, `parentIndex at ${length} bytes`).toBeLessThan(bones.length);
          expect(bone.parentIndex, `parentIndex at ${length} bytes`).toBeGreaterThanOrEqual(-1);
        }
      }
    }
  });

  it('parses the header, bones, and slots of a 4.x file', () => {
    const result = parseSpineSkeletonBinary(buildSpineBinary())!;
    expect(result).not.toBeNull();
    const bones = result.skeleton.bones;
    expect(bones.length).toBe(2);
    expect(bones[0]).toMatchObject({ name: 'root', parentIndex: -1, rotation: 0, x: 0, y: 0 });
    // Bone 0 writes NO parent index — the reader must not consume one for it, or every later field shifts.
    expect(bones[1]).toMatchObject({
      length: 26.25,
      name: 'hip',
      parentIndex: 0,
      rotation: 19.5,
      scaleX: 2,
      scaleY: 0.5,
      shearX: 1.5,
      shearY: -1.5,
      x: 1.25,
      y: 247.5,
    });
    const slots = result.skeleton.slots!;
    expect(slots.length).toBe(1);
    expect(slots[0]).toMatchObject({ boneIndex: 1, color: 0x80c0ffff, name: 'body' });
  });

  it('builds a named clip of RELATIVE bone deltas, like the .json parser', () => {
    const result = parseSpineSkeletonBinary(buildSpineBinary())!;
    expect(result.animations.length).toBe(1);
    expect(result.animations[0].name).toBe('walk');
    // Setup rotation is 19.5 on the hip; the timeline's +90 delta composes onto it rather than replacing it.
    const setup = result.skeleton;
    const pose = cloneSkeleton2D(setup);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 1);
    expect(pose.bones[1].rotation).toBeCloseTo(109.5, 4);
    expect(setup.bones[1].rotation).toBeCloseTo(19.5, 4); // setup left intact
  });

  it('drives ONE axis from a per-axis timeline, leaving the other at its setup value', () => {
    // Ordinal 2 is translateX: one value per keyframe, emitted onto the TranslationX path so it drives x
    // and never writes y at all. (It used to widen to the paired path with an identity in y, which read
    // the same here but destroyed a sibling translateY channel — see the two-axis test below.)
    const result = parseSpineSkeletonBinary(buildSpineBinary({ boneTimelineType: 2 }))!;
    const setup = result.skeleton;
    const pose = cloneSkeleton2D(setup);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 1);
    expect(pose.bones[1].x).toBeCloseTo(1.25 + 90, 4); // setup x + delta
    expect(pose.bones[1].y).toBeCloseTo(247.5, 4); // setup y, untouched
  });

  it('keeps BOTH axes when one bone carries translateX AND translateY', () => {
    // The defect the per-axis paths fixed. Both used to widen onto the paired Translation path, and since
    // each composes onto SETUP the second wrote the first's axis back — a silent, total loss of one axis.
    const result = parseSpineSkeletonBinary(buildSpineBinary({ boneTimelineType: 2, secondBoneTimelineType: 3 }))!;
    const setup = result.skeleton;
    const pose = cloneSkeleton2D(setup);

    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 1);

    expect(pose.bones[1].x).toBeCloseTo(1.25 + 90, 4);
    expect(pose.bones[1].y).toBeCloseTo(247.5 + 40, 4);
  });

  it('drives BOTH components from a combined translate timeline', () => {
    const result = parseSpineSkeletonBinary(buildSpineBinary({ boneTimelineType: 1 }))!;
    const setup = result.skeleton;
    const pose = cloneSkeleton2D(setup);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 1);
    expect(pose.bones[1].x).toBeCloseTo(1.25 + 90, 4);
    expect(pose.bones[1].y).toBeCloseTo(247.5 + 90, 4);
  });

  it('rebases a BEZIER segment onto per-interval easing, in absolute time/value units', () => {
    const result = parseSpineSkeletonBinary(buildSpineBinary({ bezier: true }))!;
    const track = result.animations[0].clip.channels[0].track;
    expect(track.segmentEasings).not.toBeNull();
    const setup = result.skeleton;
    const pose = cloneSkeleton2D(setup);
    applyAnimationClipToSkeleton2D(result.animations[0].clip, setup, pose, 0.5);
    // curve [0.42, 0, 1, 90] over a 0..1s / 0..90deg segment is the CSS ease-in shape.
    expect(pose.bones[1].rotation).toBeCloseTo(19.5 + 90 * easeCubicBezier(0.42, 0, 1, 1)(0.5), 3);
  });

  it('leaves a LINEAR timeline with no segment easings', () => {
    const track = parseSpineSkeletonBinary(buildSpineBinary())!.animations[0].clip.channels[0].track;
    expect(track.segmentEasings).toBeNull();
  });

  it('resolves a slot to the setup attachment the SKIN defines, which is read after the slot', () => {
    // The slot names its attachment before the skin exists in the stream, so this is the ordering the parser
    // has to defer: name captured during slots, resolved once the skin is parsed.
    const region = parseSpineSkeletonBinary(buildSpineBinary())!.skeleton.slots![0].attachment as RegionAttachment2D;
    expect(region).not.toBeNull();
    expect(region.kind).toBe(RegionAttachment2DKind);
    expect(region).toMatchObject({ height: 32, name: 'body-attachment', rotation: 12.5, width: 64, x: 3.5, y: 4.5 });
  });

  it('parses a RIGID mesh attachment: uvs, triangles, and bone-local positions', () => {
    const skin = parseSpineSkeletonBinary(buildSpineBinary())!;
    // The mesh is the second attachment on the slot; it is not the setup one, so reach it via the region's
    // sibling — the parse must still have consumed it correctly for the file to end cleanly.
    const crumbs = collectImportDiagnostics((sink) => parseSpineSkeletonBinary(buildSpineBinary(), sink));
    expect(crumbs.find((c) => c.kind === 'spine.binary-tail-unparsed')!.detail).toMatchObject({ bytes: 0 });
    expect(skin.skeleton.slots!.length).toBe(1);
  });

  it('decodes a WEIGHTED mesh into Skin2D influences without re-packing', () => {
    // Spine's binary influence stream is already [boneIndex, x, y, weight] per influence, which is exactly
    // Skin2D's layout — so a wrong stride here would surface as a clean end-of-file failure.
    const crumbs = collectImportDiagnostics((sink) =>
      parseSpineSkeletonBinary(buildSpineBinary({ weightedMesh: true }), sink),
    );
    expect(crumbs.find((c) => c.kind === 'spine.binary-tail-unparsed')!.detail).toMatchObject({ bytes: 0 });
    expect(crumbs.map((c) => c.kind)).not.toContain('spine.binary-truncated');
  });

  it('CONSUMES IK constraint records it does not model, so the skin after them still parses', () => {
    // Constraints cannot be skipped — they carry no length — so mis-walking one desynchronizes the skin.
    // A resolved attachment on the far side is therefore the proof that the walk was byte-exact.
    const result = parseSpineSkeletonBinary(buildSpineBinary({ ikConstraints: 2 }))!;
    // Byte-exactness means the attachment reads back with the SAME field values it has when no constraint
    // records precede it. A bare not-null would pass on a desynchronized walk that produced garbage.
    expect(result.skeleton.slots![0].attachment).toMatchObject({
      height: 32,
      name: 'body-attachment',
      rotation: 12.5,
      width: 64,
      x: 3.5,
      y: 4.5,
    });
    const kinds = collectImportDiagnostics((sink) =>
      parseSpineSkeletonBinary(buildSpineBinary({ ikConstraints: 2 }), sink),
    ).map((c) => c.kind);
    expect(kinds).toContain('spine.ik-constraint-unsupported');
  });

  // ★ THE VERSION THAT ACTUALLY EXISTS IN THE WILD, and the case a prefix gate got wrong. Every one of the
  // 23 real exports in the spine-fixtures corpus is 4.2.22, and the old `startsWith('4.')` admitted them
  // into a reader built for 4.1 — each produced a Skeleton2DImport with zero bones from a 64 KB file, a
  // silent empty success rather than a refusal. Refusing is strictly better: the caller can tell.
  it.each(['4.2.22', '4.3.0', '5.0.0'])('REJECTS %s rather than reading it with a layout built for 4.1', (version) => {
    const crumbs = collectImportDiagnostics((sink) =>
      expect(parseSpineSkeletonBinary(buildSpineBinary({ version }), sink)).toBeNull(),
    );

    const crumb = crumbs.find((c) => c.kind === 'spine.binary-version-unsupported')!;
    expect(crumb, `no unsupported crumb for ${version}`).toBeDefined();
    expect(crumb.detail).toMatchObject({ version });
  });

  // The layouts that ARE implemented still parse — a gate that rejects everything would pass the test
  // above and be useless.
  it.each(['4.1.17', '4.1.0'])('still reads %s, the layout it was verified against', (version) => {
    expect(parseSpineSkeletonBinary(buildSpineBinary({ version }))).not.toBeNull();
  });

  it('REJECTS a version whose record layout this importer does not describe', () => {
    const crumbs = collectImportDiagnostics((sink) =>
      expect(parseSpineSkeletonBinary(buildSpineBinary({ version: '3.8.99' }), sink)).toBeNull(),
    );
    const crumb = crumbs.find((c) => c.kind === 'spine.binary-version-unsupported')!;
    expect(crumb.detail).toMatchObject({ version: '3.8.99' });
  });

  it('REJECTS an unreadable header rather than decoding garbage', () => {
    const kinds = collectImportDiagnostics((sink) =>
      expect(parseSpineSkeletonBinary(Uint8Array.from([1, 2, 3]), sink)).toBeNull(),
    ).map((c) => c.kind);
    expect(kinds).toContain('spine.binary-header-unreadable');
  });

  it('reports how many bytes of the file it did not parse', () => {
    const bytes = buildSpineBinary();
    const crumbs = collectImportDiagnostics((sink) => parseSpineSkeletonBinary(bytes, sink));
    const tail = crumbs.find((c) => c.kind === 'spine.binary-tail-unparsed')!;
    // The fixture ends exactly where this landing stops parsing, so nothing is left over — the crumb still
    // fires to record that the importer STOPPED rather than finished, which is the honest signal while the
    // event and animation sections are still unmodeled.
    expect(tail.detail).toMatchObject({ bytes: 0 });
  });

  it('RECOVERS from a truncated file, keeping whatever records were complete', () => {
    const full = buildSpineBinary();
    const truncated = full.subarray(0, full.byteLength - 6);
    const crumbs = collectImportDiagnostics((sink) => parseSpineSkeletonBinary(truncated, sink));
    expect(crumbs.map((c) => c.kind)).toContain('spine.binary-truncated');
    // It still returns a skeleton rather than null or a throw: the bones completed before the cut.
    const result = parseSpineSkeletonBinary(truncated)!;
    expect(result.skeleton.bones.length).toBe(2);
  });

  it('maps the transform-mode ORDINAL positionally, falling back to Normal when out of range', () => {
    const modes = [
      TransformMode2D.Normal,
      TransformMode2D.OnlyTranslation,
      TransformMode2D.NoRotationOrReflection,
      TransformMode2D.NoScale,
      TransformMode2D.NoScaleOrReflection,
    ];
    for (let ordinal = 0; ordinal < modes.length; ordinal++) {
      const bones = parseSpineSkeletonBinary(buildSpineBinary({ transformMode: ordinal }))!.skeleton.bones;
      expect(bones[1].transformMode).toEqual(modes[ordinal]);
    }
    // An ordinal from a future version with more modes must not yield an undefined inherit rule.
    const beyond = parseSpineSkeletonBinary(buildSpineBinary({ transformMode: 99 }))!.skeleton.bones;
    expect(beyond[1].transformMode).toEqual(TransformMode2D.Normal);
  });

  it('honors the nonessential flag, which changes the bone record width', () => {
    // With nonessential set, each bone carries a trailing editor color. Reading the flag but not the color
    // would desynchronize every following record, so the slot below is the canary.
    const result = parseSpineSkeletonBinary(buildSpineBinary({ nonessential: true }))!;
    expect(result.skeleton.bones.length).toBe(2);
    expect(result.skeleton.slots![0]).toMatchObject({ boneIndex: 1, name: 'body' });
  });

  it('Skip-crumbs a slot dark color, which Slot2D cannot represent', () => {
    const kinds = collectImportDiagnostics((sink) =>
      parseSpineSkeletonBinary(buildSpineBinary({ darkColor: 0x102030 }), sink),
    ).map((c) => c.kind);
    expect(kinds).toContain('spine.slot-dark-color-unsupported');
    const plain = collectImportDiagnostics((sink) => parseSpineSkeletonBinary(buildSpineBinary(), sink)).map(
      (c) => c.kind,
    );
    expect(plain).not.toContain('spine.slot-dark-color-unsupported');
  });
});

// Builds a minimal but structurally faithful Spine 4.x `.skel`: hash, version, bounds, the nonessential
// flag, a string table, two bones, and one slot. The byte layout it writes is the layout verified
// byte-for-byte against a real 4.1.17 export (see the package status) — the encoder REPRODUCES a confirmed
// wire format rather than defining it, which is what keeps these tests a real check and not a round-trip
// against the importer's own assumptions. Real Spine assets are never committed, so the committed fixture
// is authored here.
function buildSpineBinary(
  options: {
    version?: string;
    nonessential?: boolean;
    transformMode?: number;
    darkColor?: number;
    ikConstraints?: number;
    weightedMesh?: boolean;
    animations?: boolean;
    boneTimelineType?: number;
    secondBoneTimelineType?: number;
    bezier?: boolean;
  } = {},
): Uint8Array {
  const version = options.version ?? '4.1.17';
  const nonessential = options.nonessential ?? false;
  const out: number[] = [];
  for (let i = 0; i < 8; i++) out.push(0); // export hash
  writeString(out, version);
  for (let i = 0; i < 4; i++) writeFloat(out, 0); // x, y, width, height
  out.push(nonessential ? 1 : 0);
  if (nonessential) {
    writeFloat(out, 30);
    writeString(out, './images/');
    writeString(out, '');
  }
  writeVarint(out, 2); // string table
  writeString(out, 'body-attachment');
  writeString(out, 'body-mesh');

  writeVarint(out, 2); // bones
  writeBone(out, { name: 'root', parentIndex: null, nonessential });
  writeBone(out, {
    length: 26.25,
    name: 'hip',
    nonessential,
    parentIndex: 0,
    rotation: 19.5,
    scaleX: 2,
    scaleY: 0.5,
    shearX: 1.5,
    shearY: -1.5,
    transformMode: options.transformMode ?? 0,
    x: 1.25,
    y: 247.5,
  });

  writeVarint(out, 1); // slots
  writeString(out, 'body');
  writeVarint(out, 1); // bone index
  writeInt(out, 0x80c0ffff);
  writeInt(out, options.darkColor ?? -1);
  writeVarint(out, 1); // setup attachment -> string table entry 1, 'body-attachment'
  writeVarint(out, 0); // blend mode: normal

  // Constraint sections. Flight models no solvers, but the records sit between the slots and the skins, so
  // the counts are always written even when empty.
  writeVarint(out, options.ikConstraints ?? 0);
  for (let i = 0; i < (options.ikConstraints ?? 0); i++) writeIkConstraint(out, 'ik' + i);
  writeVarint(out, 0); // transform constraints
  writeVarint(out, 0); // path constraints

  // Default skin: one slot entry carrying a region and a mesh.
  writeVarint(out, 1); // slot entries
  writeVarint(out, 0); // slot index
  writeVarint(out, 2); // attachments on it
  writeVarint(out, 1); // key -> 'body-attachment'
  writeVarint(out, 0); // name: absent, so the key is used
  out.push(0); // type: region
  writeVarint(out, 0); // atlas path
  writeFloat(out, 12.5); // rotation
  writeFloat(out, 3.5); // x
  writeFloat(out, 4.5); // y
  writeFloat(out, 1); // scaleX
  writeFloat(out, 1); // scaleY
  writeFloat(out, 64); // width
  writeFloat(out, 32); // height
  writeInt(out, 0xffffffff); // color
  out.push(0); // sequence: absent
  writeVarint(out, 2); // key -> 'body-mesh'
  writeVarint(out, 0);
  out.push(2); // type: mesh
  writeVarint(out, 0); // atlas path
  writeInt(out, 0xffffffff); // color
  writeVarint(out, 3); // vertex count
  for (const uv of [0, 0, 1, 0, 1, 1]) writeFloat(out, uv);
  writeVarint(out, 3); // triangle index count
  for (const t of [0, 1, 2]) writeShort(out, t);
  out.push(options.weightedMesh ? 1 : 0);
  if (options.weightedMesh) {
    for (let v = 0; v < 3; v++) {
      writeVarint(out, 1); // one influence
      writeVarint(out, 1); // bone index
      writeFloat(out, v);
      writeFloat(out, v * 2);
      writeFloat(out, 1); // weight
    }
  } else {
    for (const xy of [0, 0, 10, 0, 10, 10]) writeFloat(out, xy);
  }
  writeVarint(out, 0); // hull length
  out.push(0); // sequence: absent

  writeVarint(out, 0); // alternate skins
  writeVarint(out, 0); // event definitions

  // Animations. One clip driving the hip bone, so the bone-timeline path is exercised end to end.
  writeVarint(out, options.animations === false ? 0 : 1);
  if (options.animations !== false) {
    writeString(out, 'walk');
    writeVarint(out, 1); // total timeline count
    writeVarint(out, 0); // slot timelines
    writeVarint(out, 1); // bone timelines
    writeVarint(out, 1); // bone index
    writeVarint(out, options.secondBoneTimelineType === undefined ? 1 : 2); // timelines on it
    out.push(options.boneTimelineType ?? 0); // 0 = rotate
    writeVarint(out, 2); // frame count
    writeVarint(out, options.bezier ? 1 : 0); // bezier count
    const values = options.boneTimelineType === 1 ? 2 : 1;
    writeFloat(out, 0); // time
    for (let v = 0; v < values; v++) writeFloat(out, 0);
    writeFloat(out, 1); // next time
    for (let v = 0; v < values; v++) writeFloat(out, 90);
    if (options.bezier) {
      out.push(2); // CURVE_BEZIER
      for (let v = 0; v < values; v++) {
        writeFloat(out, 0.42); // cx1 in absolute time units
        writeFloat(out, 0); // cy1 in absolute value units
        writeFloat(out, 1); // cx2
        writeFloat(out, 90); // cy2
      }
    } else {
      out.push(0); // CURVE_LINEAR
    }
    // A SECOND timeline on the same bone, written with its own keyframes — the shape that used to lose an
    // axis, since two per-axis timelines both widened onto the same paired path.
    if (options.secondBoneTimelineType !== undefined) {
      out.push(options.secondBoneTimelineType);
      writeVarint(out, 2); // frame count
      writeVarint(out, 0); // bezier count
      writeFloat(out, 0); // time
      writeFloat(out, 0);
      writeFloat(out, 1); // next time
      writeFloat(out, 40);
      out.push(0); // CURVE_LINEAR
    }
    writeVarint(out, 0); // ik timelines
    writeVarint(out, 0); // transform timelines
    writeVarint(out, 0); // path timelines
    writeVarint(out, 0); // deform timelines
    writeVarint(out, 0); // draw order frames
    writeVarint(out, 0); // event frames
  }
  return Uint8Array.from(out);
}

// An IK constraint record, written only so the parser has something real to walk past.
function writeIkConstraint(out: number[], name: string): void {
  writeString(out, name);
  writeVarint(out, 0); // order
  out.push(0); // skinRequired
  writeVarint(out, 1); // bone count
  writeVarint(out, 0); // bone
  writeVarint(out, 0); // target
  writeFloat(out, 1); // mix
  writeFloat(out, 0); // softness
  out.push(1, 0, 0, 0); // bendDirection, compress, stretch, uniform
}

function writeShort(out: number[], value: number): void {
  out.push((value >> 8) & 0xff, value & 0xff);
}

function writeBone(
  out: number[],
  bone: {
    name: string;
    parentIndex: number | null;
    nonessential: boolean;
    rotation?: number;
    x?: number;
    y?: number;
    scaleX?: number;
    scaleY?: number;
    shearX?: number;
    shearY?: number;
    length?: number;
    transformMode?: number;
  },
): void {
  writeString(out, bone.name);
  if (bone.parentIndex !== null) writeVarint(out, bone.parentIndex);
  writeFloat(out, bone.rotation ?? 0);
  writeFloat(out, bone.x ?? 0);
  writeFloat(out, bone.y ?? 0);
  writeFloat(out, bone.scaleX ?? 1);
  writeFloat(out, bone.scaleY ?? 1);
  writeFloat(out, bone.shearX ?? 0);
  writeFloat(out, bone.shearY ?? 0);
  writeFloat(out, bone.length ?? 0);
  writeVarint(out, bone.transformMode ?? 0);
  out.push(0); // skinRequired
  if (bone.nonessential) writeInt(out, 0xff00ffff);
}

function writeFloat(out: number[], value: number): void {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, false);
  for (let i = 0; i < 4; i++) out.push(view.getUint8(i));
}

function writeInt(out: number[], value: number): void {
  const view = new DataView(new ArrayBuffer(4));
  view.setInt32(0, value, false);
  for (let i = 0; i < 4; i++) out.push(view.getUint8(i));
}

// Spine's string encoding: a varint of `byteCount + 1` (0 would mean "absent"), then the UTF-8 bytes.
function writeString(out: number[], value: string): void {
  const bytes = new TextEncoder().encode(value);
  writeVarint(out, bytes.length + 1);
  for (const byte of bytes) out.push(byte);
}

function writeVarint(out: number[], value: number): void {
  let remaining = value >>> 0;
  while (remaining > 0x7f) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  out.push(remaining);
}
