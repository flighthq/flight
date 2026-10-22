# Phase 3 source-test audit

Completed read-only review of the 24 Phase 3 crates against pinned TypeScript. This report supersedes the earlier source-blocked provisional draft. It contains **73 silent-weakening finding groups**, **one record/comment conflict**, and **364 case-level numerical comparison rows**. Numerical rows overlap some narrative findings; these are not additive counts of independent defects.

- Rust at completion: `a5dbd98c128c5535bae2e71c322f7c5adffe997c`. The crate and test trees are identical to initial audited snapshot `0e744ae92c7187cb32e5f85cb6b04295c82ab4dc`; the intervening net change is project decision documentation, which was re-read.
- TypeScript: `a62784923f3be814463286c9fb28edfe6ab15789`, checked out cleanly from the user-authorized `https://github.com/flighthq/flight` clone. Source paths below are relative to that checkout.
- Rust paths below are relative to the Rust repository. A line points at the relevant test declaration or assertion; a missing-case finding points to the surviving Rust test/module.
- Runtime check: `cargo test --workspace --locked` could not execute: `cargo: command not found` (exit 127); `rustc` is also absent. A failing/unavailable-check attestation was recorded at final HEAD. This report makes no claim that the tests pass or that a weakened test currently conceals a runtime failure.
- No code or `agents/rust/` documentation was changed. The report is an attachment for Principal to place at `agents/rust/research/phase3-test-audit.md`.

## Scope and method

The inventory covers **3,572 integration-test functions**, **428 named inline tests**, and **54 macro-generated collision sugar tests** (4,054 Rust test cases in the static inventory, including ignored tests). The source inventory contains **3,230 TypeScript test declarations**, including **27 parameter tables**. Table declarations and loop bodies can expand to multiple cases; these totals are not a one-to-one parity metric or a test-run count.

Compared source expectations with Rust assertions, inputs, helpers, panic attributes, ignore markers, and supplementary tests. Name/expectation indexing and diffs were used to locate changes; renamed and split cases, moved tests, helper assertions, and static ownership/type guarantees were reconciled before retaining findings. The private face-query source cases are present in inline Rust tests; they are not reported as missing. Rust-only sugar tests primarily compare delegation and do not replace independent source expectations.

Applied recorded dispositions in `agents/rust/design-decisions.md`, `agents/rust/api-drift.md`, and relevant allow/D-reference comments. Already-recorded divergences are excluded from the findings, except the explicit conflicting restoration claim below. D1 establishes a default numeric representation; it does not itself record approval of every changed test bound. Plain comments explaining current Rust behavior are identified as such where no specific disposition was found. Peer status/unmerged work and replies were checked for overlapping findings; no peer code was applied.

**Classification:** “silent weakening” means an expectation, source case, or meaningful input was weakened/removed/reversed without a matching recorded disposition located in the reviewed snapshot. “record/comment conflict” identifies a concrete disagreement between the record and present tests. These classifications do not assign agent authority or make a policy decision.

**Numerical tables:** each row identifies a case containing at least one looser comparison. TS `toBeCloseTo(expected, d)` accepts an absolute difference below `0.5 × 10^-d` (default `d=2`). Thus a conversion to `<10^-d` is a twofold relaxation, not an equivalent translation. Repeated identical digits/bounds in a case are collapsed for readability. Mixed cases can contain preserved or tighter comparisons as well; their listed bounds are a case-level inventory, not a positional pairing of every assertion. Rust limits are absolute unless marked otherwise. Ignored cone cases are covered by the narrative finding instead of duplicate numerical rows.

| Crate | Integration | Inline + macro | TS declarations | Narrative groups | Numeric cases |
|---|---:|---:|---:|---:|---:|
| flight-adjustments | 150 | 17 | 137 | 4 | 19 |
| flight-animation | 174 | 44 | 144 | 6 | 2 |
| flight-binpack | 36 | 0 | 29 | 1 | 2 |
| flight-bitmap | 381 | 64 | 371 | 9 | 7 |
| flight-collision | 512 | 119 | 503 | 22 | 72 |
| flight-compression | 102 | 0 | 92 | 0 | 0 |
| flight-encoding | 13 | 0 | 8 | 0 | 0 |
| flight-flow | 41 | 11 | 32 | 0 | 0 |
| flight-layout | 97 | 0 | 79 | 1 | 2 |
| flight-log | 118 | 0 | 141 | 3 | 0 |
| flight-math | 330 | 0 | 325 | 4 | 45 |
| flight-meshgeometry | 279 | 72 | 223 | 4 | 14 |
| flight-particles | 124 | 11 | 121 | 3 | 43 |
| flight-path-boolean | 132 | 11 | 102 | 0 | 55 |
| flight-path | 325 | 60 | 277 | 6 | 68 |
| flight-signals | 106 | 0 | 86 | 1 | 0 |
| flight-spatial | 154 | 27 | 148 | 1 | 0 |
| flight-spring | 47 | 0 | 45 | 2 | 8 |
| flight-statechart | 50 | 16 | 40 | 2 | 0 |
| flight-textbidi | 72 | 0 | 57 | 0 | 0 |
| flight-textsegment | 47 | 0 | 40 | 2 | 0 |
| flight-tween | 171 | 30 | 121 | 2 | 27 |
| flight-velocity | 56 | 0 | 58 | 0 | 0 |
| flight-xml | 55 | 0 | 51 | 1 | 0 |

## Findings by crate

### flight-adjustments

**F001 — Cached LUT identity replaced by content and presence checks**

- Severity: **silent weakening**.
- Rust: `crates/flight-adjustments/tests/color_lut_cache_test.rs:15,26,39,66`.
- TS: `packages/adjustments/src/colorLutCache.test.ts:8,19,27,51`.
- TS requires repeated calls and cache.lut to refer to the same LUT, a new identity after changed parameters/size, and identity reuse for an empty run. Rust instead checks sample equality/inequality, is_some, and sample counts. No cache identity disposition located.

**F002 — LUT transform identity reduced to is_some**

- Severity: **silent weakening**.
- Rust: `crates/flight-adjustments/tests/color_lut_adjustment_test.rs:21`.
- TS: `packages/adjustments/src/colorLutAdjustment.test.ts:10`.
- TS checks that getAdjustmentColorTransform(op) returns op.transform itself. Rust only asserts the returned Option is Some; any replacement closure passes.

**F003 — Factory kind assertions removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-adjustments/tests/brightness_contrast_adjustment_test.rs:8`; `crates/flight-adjustments/tests/color_blind_simulation_adjustment_test.rs:8`; `crates/flight-adjustments/tests/color_grade_adjustment_test.rs:8`; `crates/flight-adjustments/tests/color_matrix_adjustment_test.rs:8`; `crates/flight-adjustments/tests/color_scale_bias_adjustment_test.rs:10`; `crates/flight-adjustments/tests/exposure_adjustment_test.rs:8`; `crates/flight-adjustments/tests/grayscale_adjustment_test.rs:8`; `crates/flight-adjustments/tests/hue_saturation_adjustment_test.rs:8`; `crates/flight-adjustments/tests/lift_gamma_gain_adjustment_test.rs:8`; `crates/flight-adjustments/tests/lookup_table_grade_adjustment_test.rs:8`; `crates/flight-adjustments/tests/sepia_adjustment_test.rs:8`; `crates/flight-adjustments/tests/tint_adjustment_test.rs:8`.
- TS: `packages/adjustments/src/brightnessContrastAdjustment.test.ts:8`; `packages/adjustments/src/colorBlindSimulationAdjustment.test.ts:8`; `packages/adjustments/src/colorGradeAdjustment.test.ts:4`; `packages/adjustments/src/colorMatrixAdjustment.test.ts:11`; `packages/adjustments/src/colorScaleBiasAdjustment.test.ts:4`; `packages/adjustments/src/exposureAdjustment.test.ts:5`; `packages/adjustments/src/grayscaleAdjustment.test.ts:5`; `packages/adjustments/src/hueSaturationAdjustment.test.ts:4`; `packages/adjustments/src/liftGammaGainAdjustment.test.ts:4`; `packages/adjustments/src/lookupTableGradeAdjustment.test.ts:8`; `packages/adjustments/src/sepiaAdjustment.test.ts:5`; `packages/adjustments/src/tintAdjustment.test.ts:7`.
- Each TS factory test checks its literal kind string. These Rust factory tests omit that assertion while retaining value checks. AdjustmentFields.kind remains a mutable String, so the kind assertion is representable. Supplemental serialization tests cover a few kinds but not this set as factory behavior.

**F004 — Exact matrix and affine checks changed to approximate**

- Severity: **silent weakening**.
- Rust: `crates/flight-adjustments/tests/color_adjustment_resolution_test.rs:30,64,79`; `crates/flight-adjustments/tests/color_matrix_math_test.rs:58,68`.
- TS: `packages/adjustments/src/colorAdjustmentResolution.test.ts:40,69,79`; `packages/adjustments/src/colorMatrixMath.test.ts:64,71`.
- Complete fused matrix equality becomes element errors<1e-6; exact redBias=.4 and redScale=.25 become<1e-6; applying identity and aliased identity no longer require the matrix unchanged exactly, using assert_close tolerance1e-4 instead.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-adjustments/tests/color_grade_adjustment_test.rs:19` | `packages/adjustments/src/colorGradeAdjustment.test.ts:16` — scales contrast about mid-grey | 2, 4 | 0.01, 0.0001 |
| `crates/flight-adjustments/tests/color_grade_adjustment_test.rs:31` | `packages/adjustments/src/colorGradeAdjustment.test.ts:27` — desaturates toward luma at saturation 0 | 2 | 0.01 |
| `crates/flight-adjustments/tests/color_lut_adjustment_test.rs:6` | `packages/adjustments/src/colorLutAdjustment.test.ts:15` — wraps a matrix-tier adjustment as an rgb→rgb transform at opaque alpha | 5 | 0.0001 |
| `crates/flight-adjustments/tests/color_lut_test.rs:6` | `packages/adjustments/src/colorLut.test.ts:6` — bakes an empty stack into an identity LUT | 5 | 0.0001 |
| `crates/flight-adjustments/tests/color_lut_test.rs:18` | `packages/adjustments/src/colorLut.test.ts:17` — composes transforms left-to-right and clamps to [0, 1] | 5 | 0.0001 |
| `crates/flight-adjustments/tests/color_lut_test.rs:38` | `packages/adjustments/src/colorLut.test.ts:42` — interpolates between cells trilinearly | 5 | 0.0001 |
| `crates/flight-adjustments/tests/color_lut_test.rs:53` | `packages/adjustments/src/colorLut.test.ts:54` — clamps out-of-range inputs to the cube | 5 | 0.0001 |
| `crates/flight-adjustments/tests/color_matrix_math_test.rs:144` | `packages/adjustments/src/colorMatrixMath.test.ts:130` — positive red midtone raises red channel offset | 2, 5 | 1e-05, 0.0001 |
| `crates/flight-adjustments/tests/color_matrix_math_test.rs:324` | `packages/adjustments/src/colorMatrixMath.test.ts:266` — scales alpha channel | 0 | 1 |
| `crates/flight-adjustments/tests/color_matrix_math_test.rs:455` | `packages/adjustments/src/colorMatrixMath.test.ts:367` — fuses a run of three in application order (index 0 first) | 10 | 0.0001 |
| `crates/flight-adjustments/tests/hue_saturation_adjustment_test.rs:7` | `packages/adjustments/src/hueSaturationAdjustment.test.ts:4` — defaults to the identity and carries a fusable transform | 4 | 0.0001 |
| `crates/flight-adjustments/tests/hue_saturation_adjustment_test.rs:17` | `packages/adjustments/src/hueSaturationAdjustment.test.ts:15` — fully desaturates to luma-preserving grey at saturation 0 | 4 | 0.0001 |
| `crates/flight-adjustments/tests/hue_saturation_adjustment_test.rs:28` | `packages/adjustments/src/hueSaturationAdjustment.test.ts:25` — rotates hue by 120° mapping red toward green | 4 | 0.0001 |
| `crates/flight-adjustments/tests/lift_gamma_gain_adjustment_test.rs:7` | `packages/adjustments/src/liftGammaGainAdjustment.test.ts:4` — defaults to approximately neutral | 2 | 0.01 |
| `crates/flight-adjustments/tests/lift_gamma_gain_adjustment_test.rs:19` | `packages/adjustments/src/liftGammaGainAdjustment.test.ts:16` — applies gain as a per-channel multiplier | 2 | 0.01 |
| `crates/flight-adjustments/tests/lift_gamma_gain_adjustment_test.rs:28` | `packages/adjustments/src/liftGammaGainAdjustment.test.ts:24` — lifts shadows toward the lift color | 4 | 0.0001 |
| `crates/flight-adjustments/tests/lookup_table_grade_adjustment_test.rs:7` | `packages/adjustments/src/lookupTableGradeAdjustment.test.ts:8` — is a neutral passthrough with no supplied LUT | 5 | 1e-05 |
| `crates/flight-adjustments/tests/lookup_table_grade_adjustment_test.rs:17` | `packages/adjustments/src/lookupTableGradeAdjustment.test.ts:18` — applies a supplied LUT at full strength | 4 | 0.0001 |
| `crates/flight-adjustments/tests/lookup_table_grade_adjustment_test.rs:27` | `packages/adjustments/src/lookupTableGradeAdjustment.test.ts:35` — mixes toward the graded color by strength | 4 | 0.0001 |

### flight-animation

**F005 — Target identity removed from weighted blend and selected-channel tests**

- Severity: **silent weakening**.
- Rust: `crates/flight-animation/tests/animation_blend_tree_test.rs:325`; `crates/flight-animation/tests/animation_layer_stack_test.rs:135`.
- TS: `packages/animation/src/animationBlendTree.test.ts:106`; `packages/animation/src/animationLayerStack.test.ts:75`.
- Weighted-pose callback no longer collects channel.targetRef; only count and value remain. Selected-channel correspondence checks only channels.len()==1; the source checks that the retained target is b.

**F006 — Scratch contents and allocation reuse replaced by lengths or dropped**

- Severity: **silent weakening**.
- Rust: `crates/flight-animation/tests/animation_blend_test.rs:145`; `crates/flight-animation/tests/animation_blend_tree_test.rs:69`; `crates/flight-animation/tests/animation_layer_stack_test.rs:55`; `crates/flight-animation/tests/animation_state_machine_test.rs:55`; `crates/flight-animation/tests/animation_root_motion_test.rs:76`; `crates/flight-animation/tests/animation_crossfade_test.rs:488`.
- TS: `packages/animation/src/animationBlend.test.ts:109`; `packages/animation/src/animationBlendTree.test.ts:35`; `packages/animation/src/animationLayerStack.test.ts:37`; `packages/animation/src/animationStateMachine.test.ts:37`; `packages/animation/src/animationRootMotion.test.ts:37`; `packages/animation/src/animationCrossfade.test.ts:204`.
- TS verifies scratch array identity across reset/advance/sample, and actual player/tree/machine membership/order. Rust drops pointer comparisons; multiple tests check only Vec lengths. Owned Vec storage can still be replaced or filled with the wrong Ref values, so neither contract is guaranteed by its type.

**F007 — Rejected root-motion range may mutate output without failing test**

- Severity: **silent weakening**.
- Rust: `crates/flight-animation/tests/animation_root_motion_test.rs:196`.
- TS: `packages/animation/src/animationRootMotion.test.ts:97`.
- Both error paths are exercised, but the TS final assertion that out remains [1,2,3,4] is absent from Rust.

**F008 — Target fields removed from visitor output records**

- Severity: **silent weakening**.
- Rust: `crates/flight-animation/tests/animation_blend_tree_test.rs:341`; `crates/flight-animation/tests/animation_clip_test.rs:295`.
- TS: `packages/animation/src/animationBlendTree.test.ts:120`; `packages/animation/src/animationClip.test.ts:121`.
- Source compares ordered callback records including target fields: the clip fixture distinguishes target ids a/b. Rust records sample values and, for the clip, indices, but ignores the callback channel. Wrong or missing target contents can therefore pass. The source uses deep equality here; this finding does not claim that its visitor tests enforce pointer identity.

**F009 — Quaternion loop result check becomes one-sided**

- Severity: **silent weakening**.
- Rust: `crates/flight-animation/tests/animation_root_motion_test.rs:149`.
- TS: `packages/animation/src/animationRootMotion.test.ts:61`.
- TS requires abs(out[2]) close to1 after a two-loop rotation. Rust checks abs(out[2])-1<1e-5 without an outer abs, accepting zero and every magnitude below1; out[3] near0 does not exclude an all-zero quaternion.

**F010 — Specific exception-message checks reduced to any panic**

- Severity: **silent weakening**.
- Rust: `crates/flight-animation/tests/animation_blend_tree_test.rs:101`; `crates/flight-animation/tests/animation_layer_stack_test.rs:85,151`; `crates/flight-animation/tests/animation_root_motion_test.rs:40,196`; `crates/flight-animation/tests/animation_state_machine_test.rs:122`.
- TS: `packages/animation/src/animationBlendTree.test.ts:64`; `packages/animation/src/animationLayerStack.test.ts:60,85`; `packages/animation/src/animationRootMotion.test.ts:23,97`; `packages/animation/src/animationStateMachine.test.ts:71`.
- TS asserts specific error-message patterns for each invalid authored input. These Rust tests only check catch_unwind(...).is_err(); a panic from an unrelated indexing/locking defect also satisfies them. Other animation tests using should_panic(expected=...) preserve the message and are not included.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-animation/tests/animation_track_test.rs:124` | `packages/animation/src/animationTrack.test.ts:81` — locates the correct segment on a multi-key track (binary search parity) | 6 | 0.001 |
| `crates/flight-animation/tests/animation_track_test.rs:198` | `packages/animation/src/animationTrack.test.ts:115` — slerps a quaternion track to the half-angle | 5 | 0.0001 |

### flight-binpack

**F011 — Occupancy precision lowered**

- Severity: **silent weakening**.
- Rust: `crates/flight-binpack/tests/pack_rectangles_test.rs:58,627`.
- TS: `packages/binpack/src/packRectangles.test.ts:25,283`.
- Reported-area occupancy checks use abs error <1e-6 instead of TS 10 digits, and the 40-seed/both-heuristics invariant uses <1e-5 instead of TS 12 digits. No item-specific tolerance disposition located.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-binpack/tests/pack_rectangles_test.rs:58` | `packages/binpack/src/packRectangles.test.ts:25` — reports covered fraction of the REPORTED extent, so rounding waste is visible | 10 | 1e-06 |
| `crates/flight-binpack/tests/pack_rectangles_test.rs:627` | `packages/binpack/src/packRectangles.test.ts:283` — holds its invariants across 40 seeded inputs and both heuristics | 12 | 1e-05 |

### flight-bitmap

**F012 — Bevel and gradient-bevel channel assertions removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-bitmap/tests/bitmap_bevel_test.rs:15`; `crates/flight-bitmap/tests/bitmap_gradient_test.rs:36`.
- TS: `packages/bitmap/src/bitmapBevel.test.ts:16`; `packages/bitmap/src/bitmapGradient.test.ts:25`.
- Bevel drops exact highlight alpha=170. Gradient bevel drops the opposite edge red=0 and alpha=255 checks; merely seeing a highlight can pass.

**F013 — Channel-split assertions removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-bitmap/tests/bitmap_channel_test.rs:110`.
- TS: `packages/bitmap/src/bitmapChannel.test.ts:59`.
- Rust omits blue/opaque-alpha checks on the red grayscale output and omits alpha=0x44 on the alpha bitmap; retained checks cover only selected RGB bytes.

**F014 — Inner-glow alpha exact value replaced by positive check**

- Severity: **silent weakening**.
- Rust: `crates/flight-bitmap/tests/bitmap_shadow_test.rs:179,221`.
- TS: `packages/bitmap/src/bitmapShadow.test.ts:99,125`.
- Both source cases require centre alpha=170. Rust requires only alpha>0, accepting arbitrary blur/intensity output.

**F015 — Fill version increment weakened to any increase**

- Severity: **silent weakening**.
- Rust: `crates/flight-bitmap/tests/bitmap_fill_test.rs:20`.
- TS: `packages/bitmap/src/bitmapFill.test.ts:17`.
- TS requires version == before+1; Rust checks only version>before.

**F016 — Malformed fingerprint hex case removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-bitmap/tests/bitmap_fingerprint_test.rs:123`.
- TS: `packages/bitmap/src/bitmapFingerprint.test.ts:104`.
- Source checks rejection of 1:0a0b0z (non-hex final digit) as well as four other malformed strings. Rust drops that input.

**F017 — Levels exact white endpoint weakened**

- Severity: **silent weakening**.
- Rust: `crates/flight-bitmap/tests/bitmap_tone_test.rs:88`.
- TS: `packages/bitmap/src/bitmapTone.test.ts:66`.
- Source requires 255 after white-point clipping; Rust accepts any red byte >=250.

**F018 — Pixel-buffer allocation reuse no longer asserted**

- Severity: **silent weakening**.
- Rust: `crates/flight-bitmap/tests/bitmap_test.rs:164`.
- TS: `packages/bitmap/src/bitmap.test.ts:81`.
- invalidateBitmap source retains bitmap.data identity. Rust tests only the version, so replacing pixel storage passes.

**F019 — Gradient ramp byte-for-byte assertions removed or relaxed**

- Severity: **silent weakening**.
- Rust: `crates/flight-bitmap/tests/bitmap_gradient_test.rs:13`.
- TS: `packages/bitmap/src/bitmapGradient.test.ts:9`.
- Source checks all RGBA bytes at both endpoints and midpoint [127,0,128,128]. Rust keeps selected R/G/B endpoints and only midpoint red within±1, omitting alpha endpoints and midpoint G/B/A exact values.

**F020 — Gradient-fill color discrimination and exact clamp checks removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-bitmap/tests/bitmap_gradient_fill_test.rs:23,44,77,100`.
- TS: `packages/bitmap/src/bitmapGradientFill.test.ts:27,37,57,83,94`.
- TS uses a red-to-blue ramp and checks both independent R/B endpoint channels; Rust substitutes a grayscale ramp and checks only red. A channel-copy/swap bug can now pass. The pad test also replaces equality with the boundary pixel by endpoint bounds <=2/>=253; a radial pad check drops the blue-channel probe. Source negative precision (-1) already allows 5 byte units, so the tighter grayscale endpoint bounds alone are not a tolerance regression; the issue is removed color/channel and equality coverage.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-bitmap/tests/bitmap_blur_test.rs:189` | `packages/bitmap/src/bitmapBlur.test.ts:167` — is symmetric | 10 | 1e-10 |
| `crates/flight-bitmap/tests/bitmap_blur_test.rs:206` | `packages/bitmap/src/bitmapBlur.test.ts:182` — radius-0 kernel produces a single weight of 1 | 10 | 1e-10 |
| `crates/flight-bitmap/tests/bitmap_color_matrix_test.rs:85` | `packages/bitmap/src/bitmapColorMatrix.test.ts:80` — is identity at 360 degrees | 0 | 1.5 |
| `crates/flight-bitmap/tests/bitmap_format_test.rs:68` | `packages/bitmap/src/bitmapFormat.test.ts:59` — scales RGB by alpha/255 | 0 | 1 |
| `crates/flight-bitmap/tests/bitmap_format_test.rs:101` | `packages/bitmap/src/bitmapFormat.test.ts:89` — is safe in-place | 0 | 1 |
| `crates/flight-bitmap/tests/bitmap_format_test.rs:135` | `packages/bitmap/src/bitmapFormat.test.ts:118` — is safe in-place | 0 | 1 |
| `crates/flight-bitmap/tests/bitmap_transform_test.rs:196` | `packages/bitmap/src/bitmapTransform.test.ts:104` — with multiplier 0.5 blends evenly | 0 | 1 |

### flight-collision

**F021 — GJK2D differential oracle bypasses overlap, depth, and signed-normal failures**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/gjk2d_test.rs:110`.
- TS: `packages/collision/src/gjk2D.test.ts:16`.
- TS compares overlap on every trial, depth to 5 digits, and signed normal-vector distance <4e-3. Rust allows up to 10% overlap mismatches, skips zero/infinite/disagreeing depths, and accepts either normal sign via dot.abs(). Builder4 confirms no pending fix or ruling.

**F022 — Convex validation changes three-vertex acceptance into rejection**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/collision_shape_validation3d_test.rs:8,20,99,165`.
- TS: `packages/collision/src/collisionShapeValidation3D.test.ts:10,17,36,79`.
- TS accepts the triangle and three collinear vertices; Rust substitutes four-vertex fixtures and adds an assertion rejecting the TS triangle. Comments expressly cite the Rust minimum rather than a ruling. Built-in-kind acceptance also substitutes a tetrahedron.

**F023 — 2D validation expectations and degeneracy inputs removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/collision_shape_validation2d_test.rs:8,108,141`.
- TS: `packages/collision/src/collisionShapeValidation2D.test.ts:9,48,59`.
- TS collinear polygon [0,0,1,0,2,0] is absent, the degenerate zero-length Segment is removed from the degenerate-shape batch, and valid Point/Segment results change from unsupported-shape-kind to None.

**F024 — Collinear-triangle and malformed-heightfield validation cases dropped**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/triangle_mesh3d_test.rs:218,248,267`.
- TS: `packages/collision/src/triangleMesh3D.test.ts:131,154`.
- Triangle-mesh test expressly omits collinear-triangle rejection because Rust lacks that check. Heightfield batch retains only the two size failures and drops NaN sample, zero spacing, and invalid-pose rejection; the first two dropped cases remain representable even under the convention excluding direct field mutation.

**F025 — Terrain/mesh sweep fraction changed to one-sided upper bound**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/triangle_mesh3d_test.rs:404,434`.
- TS: `packages/collision/src/triangleMesh3D.test.ts:214,225`.
- TS expects fraction 0.475 to 5 digits; Rust accepts any fraction <=0.476, including an arbitrarily early/negative hit. Terrain normalY>0.99 assertion is also absent.

**F026 — Three cone raycast cases ignored**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/cylinder_cone3d_test.rs:266,310,401`.
- TS: `packages/collision/src/cylinderCone3D.test.ts:148,167,174`.
- TS executes cone side normal, base-cap hit, and cone/cylinder seeded scan. Rust marks the corresponding cone cases ignored because cone raycasting is unimplemented. The runnable cylinder split also lowers scan hits/misses >20 to >10 (tests/cylinder_cone3d_test.rs:396). No recorded ruling located; Builder4 confirms none.

**F027 — Contact manifold output assertions replaced by weaker checks**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/collide_contact_manifold3d_test.rs:129,310`.
- TS: `packages/collision/src/collideContactManifold3D.test.ts:58,163`.
- Sphere/floor test drops witness x/y/z (including expected y=-0.05), replacing them with overlapping/positive depth. Rotated-box/floor test replaces exactly four contacts with >=1 and signed +Y normal with abs(normalY) near 1, allowing the opposite normal.

**F028 — Capsule zero-direction support expected centre reduced to finiteness**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/collision_support3d_test.rs:469`.
- TS: `packages/collision/src/collisionSupport3D.test.ts:302`.
- TS requires [4,5,6]; Rust merely requires all three coordinates finite, so any finite point passes.

**F029 — GJK2D shallow-axis test accepts opposite normal**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/gjk2d_test.rs:262`.
- TS: `packages/collision/src/gjk2D.test.ts:117`.
- TS requires normalY=-1 to 6 digits. Rust checks abs(normalY) near 1 and also widens the 6-digit component/depth tolerances to 1e-6.

**F030 — Touching AABB/box expected overlap inverted**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/shape_collision3d_test.rs:369,488`.
- TS: `packages/collision/src/shapeCollision3D.test.ts:223,278`.
- TS requires true, zero depth, normal (-1,0,0), overlapping=true for shared-face AABBs/touching boxes. Rust instead asserts false and drops manifold expectations.

**F031 — Convex raycast successes changed to misses**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:640,663,738`.
- TS: `packages/collision/src/raycastCollisionShape3D.test.ts:291,302,325`.
- TS requires a convex-hull hit, a hull/AABB equivalent fraction/normal, and inside-hull hit at zero. Rust asserts hull raycasts return false and removes their fraction/normal checks. No convex-raycast disposition located.

**F032 — 3D sweep assertions removed or loosened**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/sweep_collision_shape3d_test.rs:263,312,353,419`.
- TS: `packages/collision/src/sweepCollisionShape3D.test.ts:95,129,143,164`.
- Normal test substitutes normalX<-0.9 for 5-digit -1 and unit-vector check. Crossing-capsule test widens fraction 4 digits to 1e-2 and drops witness (0,0,4.5). Impact lifecycle drops the at-impact non-overlap check. Z sweep widens fraction 5 digits to 1e-3 and drops normalZ=-1.

**F033 — Circle/polygon rounded-corner sweep half of source case absent**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/sweep_collision_shape2d_test.rs:104`.
- TS: `packages/collision/src/sweepCollisionShape2D.test.ts:95`.
- Rust keeps the face sweep only; source also sweeps diagonally into a rounded corner and checks its exact fraction and both negative sqrt(1/2) normal components.

**F034 — Collinear capsule normal no longer checked perpendicular to axis**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/shape_collision3d_test.rs:649`.
- TS: `packages/collision/src/shapeCollision3D.test.ts:354`.
- TS checks normalX≈0 and unit length. Rust checks only length, so a unit vector along the shared axis passes.

**F035 — GJK2D directed-circle oracle accepts either normal and any shallow depth**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/gjk2d_test.rs:151`.
- TS: `packages/collision/src/gjk2D.test.ts:59`.
- TS requires normalX=-1 at4digits and depth=.5 at9digits. Rust accepts abs(normalX)≈1 and depth<.500001, including zero or negative depth; explanatory comments cite Rust EPA behavior without a ruling.

**F036 — 3D bullet TOI widened to a broad interval**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/sweep_collision_shape3d_test.rs:116`.
- TS: `packages/collision/src/sweepCollisionShape3D.test.ts:59`.
- TS checks fraction .4985 to4digits. Rust accepts any fraction in(.45,.55), so a substantial timing error passes.

**F037 — 3D analytic-versus-GJK oracle accepts reversed normals**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/shape_collision3d_test.rs:53`.
- TS: `packages/collision/src/shapeCollision3D.test.ts:52`.
- Shared source helper rejects dot<.96; Rust rejects only abs(dot)<.96. All three seeded sphere agreement families therefore accept normals pointing the wrong way.

**F038 — Inside-sphere raycast expected hit reversed**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:197`.
- TS: `packages/collision/src/raycastCollisionShape3D.test.ts:82`.
- The source requires an inside origin to hit at fraction0, zero normal and x=5. Rust explicitly asserts false because its near-intersection is negative, dropping all output assertions. Comment cites current implementation rather than a ruling.

**F039 — Near-hull-corner rejection replaced by far-outside input**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/point_containment3d_test.rs:178`.
- TS: `packages/collision/src/pointContainment3D.test.ts:122`.
- TS rejects tetrahedron point(.9,.9,.9), which lies inside its AABB but outside the hull. Rust changes the rejected point to(5,5,5), with a comment admitting vertex-direction containment misses near-surface outside points. A bounding-box-only implementation now passes.

**F040 — 3D ordered-key collision test reduced to presence**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/collision_support3d_test.rs:81`.
- TS: `packages/collision/src/collisionSupport3D.test.ts:87`.
- Source requires two concatenation-colliding kind-pairs to retrieve their respective distinct callbacks. Rust registers true/false callbacks but asserts only that both lookups are Some; a key collision mapping both pairs to the same callback passes.

**F041 — 3D sweep contact location probes collapsed to loose witness test**

- Severity: **silent weakening**.
- Rust: `crates/flight-collision/tests/sweep_collision_shape3d_test.rs:287`.
- TS: `packages/collision/src/sweepCollisionShape3D.test.ts:102,109,120`.
- Two source impact-witness tests require x=9/y=0 to4digits and reject stale x=1 or5; Rust has a single witness test allowing absolute .5 errors. The source B-only-moving x=1 impact witness case is absent; the general both-moving case tests fraction only.

**F042 — Recorded restoration claim conflicts with remaining source-test rewrites**

- Severity: **record/comment conflict**.
- Rust: `crates/flight-collision/tests/gjk2d_test.rs:110`; `crates/flight-collision/tests/shape_collision3d_test.rs:369`; `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:640`.
- TS: `packages/collision/src/gjk2D.test.ts:16`; `packages/collision/src/shapeCollision3D.test.ts:223`; `packages/collision/src/raycastCollisionShape3D.test.ts:291`.
- agents/rust/api-drift.md:765 says collision expectations were restored to pinned TS behavior. The concrete overlap bypass, touching=false, and convex-hit=false cases above remain at audited HEAD. This is a conflict with that restoration claim, not a request to reopen an approved divergence.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-collision/src/collision_face3d_internal_tests.rs:48` | `packages/collision/src/collisionFace3D.test.ts:49` — returns the four corners of the face the direction selects | 9 | 1e-09 |
| `crates/flight-collision/src/collision_face3d_internal_tests.rs:66` | `packages/collision/src/collisionFace3D.test.ts:56` — selects by dominant axis, so a slightly tilted direction still names a face | 9 | 1e-09 |
| `crates/flight-collision/src/collision_face3d_internal_tests.rs:78` | `packages/collision/src/collisionFace3D.test.ts:61` — spans the whole face extent on the other two axes | 9 | 1e-09 |
| `crates/flight-collision/src/collision_face3d_internal_tests.rs:97` | `packages/collision/src/collisionFace3D.test.ts:71` — matches the aabb query when the rotation is identity | 9 | 1e-09 |
| `crates/flight-collision/src/collision_face3d_internal_tests.rs:117` | `packages/collision/src/collisionFace3D.test.ts:89` — returns the spun face for a rotated box | 9, 6 | 1e-09, 1e-06 |
| `crates/flight-collision/src/collision_face3d_internal_tests.rs:172` | `packages/collision/src/collisionFace3D.test.ts:114` — returns the two offset endpoints when the direction crosses the axis | 9 | 1e-09 |
| `crates/flight-collision/src/collision_face3d_internal_tests.rs:198` | `packages/collision/src/collisionFace3D.test.ts:143` — recovers a face from the vertex list alone, with no topology | 9 | 1e-09 |
| `crates/flight-collision/src/collision_face3d_internal_tests.rs:243` | `packages/collision/src/collisionFace3D.test.ts:148` — winds the recovered face so consecutive vertices are adjacent, not diagonal | 6 | 1e-06 |
| `crates/flight-collision/tests/capsule_contact2d_test.rs:28` | `packages/collision/src/capsuleContact2D.test.ts:63` — gives a horizontal capsule resting on a floor two points, one under each end of its body | 12 | 1e-06 |
| `crates/flight-collision/tests/capsule_contact2d_test.rs:79` | `packages/collision/src/capsuleContact2D.test.ts:83` — gives an END-ON capsule a single point, not a fabricated span | 12 | 1e-06 |
| `crates/flight-collision/tests/capsule_contact2d_test.rs:138` | `packages/collision/src/capsuleContact2D.test.ts:119` — gives two parallel capsules lying side by side a two-point span | 9 | 1e-06 |
| `crates/flight-collision/tests/capsule_contact2d_test.rs:208` | `packages/collision/src/capsuleContact2D.test.ts:151` — places a single contact point on A surface even when the normal is not perpendicular to its axis | 12 | 1e-06 |
| `crates/flight-collision/tests/capsule_contact2d_test.rs:264` | `packages/collision/src/capsuleContact2D.test.ts:175` — rests a capsule flat on a rotated box face with two points | 9 | 1e-06 |
| `crates/flight-collision/tests/capsule_contact2d_test.rs:336` | `packages/collision/src/capsuleContact2D.test.ts:204` — rests a capsule on a polygon face with two points, whatever the winding | 9 | 1e-06 |
| `crates/flight-collision/tests/capsule_contact2d_test.rs:395` | `packages/collision/src/capsuleContact2D.test.ts:230` — reduces to circle-versus-circle at the capsule closest axis point | 12 | 1e-06 |
| `crates/flight-collision/tests/capsule_contact2d_test.rs:434` | `packages/collision/src/capsuleContact2D.test.ts:246` — pushes a circle centred on the capsule axis out sideways rather than nowhere | 12 | 1e-06 |
| `crates/flight-collision/tests/collide_contact_manifold3d_test.rs:33` | `packages/collision/src/collideContactManifold3D.test.ts:19` — gives a box resting squarely on a floor FOUR points, one per corner | 6, 2 | 1e-06, 0.005 |
| `crates/flight-collision/tests/collide_contact_manifold3d_test.rs:84` | `packages/collision/src/collideContactManifold3D.test.ts:41` — reports the overlap depth on each resting point | 5 | 1e-05 |
| `crates/flight-collision/tests/collide_contact_manifold3d_test.rs:309` | `packages/collision/src/collideContactManifold3D.test.ts:163` — handles a rotated box resting on a floor | 4 | 0.0001 |
| `crates/flight-collision/tests/collision_support2d_test.rs:166` | `packages/collision/src/collisionSupport2D.test.ts:110` — pushes the centre one radius along the direction, whatever its length | 12 | 1e-12 |
| `crates/flight-collision/tests/collision_support2d_test.rs:209` | `packages/collision/src/collisionSupport2D.test.ts:134` — picks the furthest rotated corner | 9 | 1e-09 |
| `crates/flight-collision/tests/collision_support3d_test.rs:256` | `packages/collision/src/collisionSupport3D.test.ts:171` — reaches the spun corner for a box rotated 45 degrees about z | 10 | 1e-10 |
| `crates/flight-collision/tests/collision_support3d_test.rs:354` | `packages/collision/src/collisionSupport3D.test.ts:234` — returns the apex when the direction favours it and a rim point otherwise | 10 | 1e-10 |
| `crates/flight-collision/tests/collision_support3d_test.rs:421` | `packages/collision/src/collisionSupport3D.test.ts:273` — returns a flat cap rim rather than a rounded offset | 10 | 1e-10 |
| `crates/flight-collision/tests/convex_hull3d_test.rs:61` | `packages/collision/src/convexHull3D.test.ts:56` — triangulates a cube into a closed surface of the right volume | 9 | 1e-09 |
| `crates/flight-collision/tests/convex_hull3d_test.rs:71` | `packages/collision/src/convexHull3D.test.ts:64` — triangulates a tetrahedron | 12 | 1e-12 |
| `crates/flight-collision/tests/convex_hull3d_test.rs:97` | `packages/collision/src/convexHull3D.test.ts:85` — produces the same hull however the points were ordered | 9 | 1e-09 |
| `crates/flight-collision/tests/cylinder_cone3d_test.rs:206` | `packages/collision/src/cylinderCone3D.test.ts:127` — hits a cylinder side and reports a radial normal | 10 | 1e-10 |
| `crates/flight-collision/tests/cylinder_cone3d_test.rs:227` | `packages/collision/src/cylinderCone3D.test.ts:134` — hits a cylinder cap and reports the axial normal | 10 | 1e-10 |
| `crates/flight-collision/tests/gjk2d_test.rs:150` | `packages/collision/src/gjk2D.test.ts:59` — orients the normal to push A out of B | 4, 9 | 0.0001 |
| `crates/flight-collision/tests/gjk2d_test.rs:179` | `packages/collision/src/gjk2D.test.ts:73` — reverses the normal when the arguments are reversed | 9 | 1e-09 |
| `crates/flight-collision/tests/gjk2d_test.rs:261` | `packages/collision/src/gjk2D.test.ts:117` — takes the shallow axis out of a pair that overlaps on both | 6 | 1e-06 |
| `crates/flight-collision/tests/gjk3d_test.rs:165` | `packages/collision/src/gjk3D.test.ts:86` — reports the depth and axis for two overlapping spheres, to curved-surface accuracy | 4, 2 | 5e-05, 0.05 |
| `crates/flight-collision/tests/gjk3d_test.rs:308` | `packages/collision/src/gjk3D.test.ts:156` — handles a box rotated about z, using its oriented corners | 3 | 0.001 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:99` | `packages/collision/src/raycastCollisionShape3D.test.ts:55` — hits a sphere at its near surface with an outward normal | 9 | 1e-09 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:150` | `packages/collision/src/raycastCollisionShape3D.test.ts:70` — keeps the fraction in the caller parameterization for an unnormalized direction | 9 | 1e-09 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:214` | `packages/collision/src/raycastCollisionShape3D.test.ts:91` — hits an aabb face with the axis normal it crossed | 9 | 1e-09 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:296` | `packages/collision/src/raycastCollisionShape3D.test.ts:115` — hits an oriented box on the face its rotation turned toward the ray | 6 | 1e-06 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:330` | `packages/collision/src/raycastCollisionShape3D.test.ts:137` — agrees with the aabb answer for an identity-rotated box | 9 | 1e-09 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:360` | `packages/collision/src/raycastCollisionShape3D.test.ts:156` — returns a UNIT normal from a rotated box, not one the rotation rescaled | 9 | 1e-09 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:393` | `packages/collision/src/raycastCollisionShape3D.test.ts:175` — hits the SIDE of a capsule with a normal perpendicular to its axis | 9 | 1e-09 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:422` | `packages/collision/src/raycastCollisionShape3D.test.ts:193` — hits a capsule CAP along the axis, where the side cannot be reached | 9 | 1e-09 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:451` | `packages/collision/src/raycastCollisionShape3D.test.ts:211` — hits the cap rather than the side just beyond the segment end | 9 | 1e-06 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:518` | `packages/collision/src/raycastCollisionShape3D.test.ts:245` — treats a zero-length capsule as a sphere | 9 | 1e-09 |
| `crates/flight-collision/tests/raycast_collision_shape3d_test.rs:544` | `packages/collision/src/raycastCollisionShape3D.test.ts:260` — returns a unit normal from every capsule surface | 9 | 1e-09 |
| `crates/flight-collision/tests/register_built_in_collision_pair_tests3d_test.rs:49` | `packages/collision/src/registerBuiltInCollisionPairTests3D.test.ts:36` — routes a reversed pair through the dispatcher with the normal negated | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision2d_test.rs:669` | `packages/collision/src/shapeCollision2D.test.ts:277` — keeps a directional normal for proportionally tiny circles | 20 | 1e-20 |
| `crates/flight-collision/tests/shape_collision2d_test.rs:861` | `packages/collision/src/shapeCollision2D.test.ts:366` — overlaps an axis-aligned box with a 45-degree diamond and separates along X | 2, 3 | 1e-05, 0.001 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:173` | `packages/collision/src/shapeCollision3D.test.ts:92` — agrees with GJK/EPA on sphere-sphere over seeded configurations | 12 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:224` | `packages/collision/src/shapeCollision3D.test.ts:129` — agrees with GJK/EPA on sphere-capsule over seeded configurations | 12 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:276` | `packages/collision/src/shapeCollision3D.test.ts:168` — agrees with GJK/EPA on sphere-aabb over seeded configurations | 12 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:340` | `packages/collision/src/shapeCollision3D.test.ts:209` — reports the shallowest axis as the minimum translation | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:466` | `packages/collision/src/shapeCollision3D.test.ts:266` — measures a rotated face in world space | 12 | 1e-05 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:590` | `packages/collision/src/shapeCollision3D.test.ts:327` — finds the crossing point of two perpendicular capsules | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:620` | `packages/collision/src/shapeCollision3D.test.ts:341` — handles parallel capsules by anchoring deterministically | 10 | 1e-06 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:648` | `packages/collision/src/shapeCollision3D.test.ts:354` — pushes collinear capsules apart perpendicular to their shared axis | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:679` | `packages/collision/src/shapeCollision3D.test.ts:370` — reduces to a sphere test when both segments are zero length | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:711` | `packages/collision/src/shapeCollision3D.test.ts:385` — measures from the closest point on the face | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:737` | `packages/collision/src/shapeCollision3D.test.ts:398` — escapes through the nearest face when the centre is inside | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:818` | `packages/collision/src/shapeCollision3D.test.ts:454` — matches the axis-aligned result when the rotation is identity | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:864` | `packages/collision/src/shapeCollision3D.test.ts:470` — measures to the closest point on the segment, not to an endpoint | 10 | 1e-06 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:889` | `packages/collision/src/shapeCollision3D.test.ts:483` — clamps past the end of the segment to the cap | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:918` | `packages/collision/src/shapeCollision3D.test.ts:498` — reports depth and an exact normal along the centre line | 10 | 1e-10 |
| `crates/flight-collision/tests/shape_collision3d_test.rs:962` | `packages/collision/src/shapeCollision3D.test.ts:522` — picks a direction for concentric spheres rather than dividing by zero | 10 | 1e-10 |
| `crates/flight-collision/tests/sweep_collision_shape3d_test.rs:93` | `packages/collision/src/sweepCollisionShape3D.test.ts:52` — finds the exact impact fraction for two approaching spheres | 5 | 0.001 |
| `crates/flight-collision/tests/sweep_collision_shape3d_test.rs:191` | `packages/collision/src/sweepCollisionShape3D.test.ts:84` — accounts for BOTH shapes moving | 5 | 0.001 |
| `crates/flight-collision/tests/sweep_collision_shape3d_test.rs:311` | `packages/collision/src/sweepCollisionShape3D.test.ts:129` — finds the mid-segment contact of two crossing capsules | 4, 3 | 0.01 |
| `crates/flight-collision/tests/sweep_collision_shape3d_test.rs:396` | `packages/collision/src/sweepCollisionShape3D.test.ts:156` — sweeps a box against a box | 4 | 0.001 |
| `crates/flight-collision/tests/sweep_collision_shape3d_test.rs:418` | `packages/collision/src/sweepCollisionShape3D.test.ts:164` — sweeps along Z as readily as along X | 5 | 0.001 |
| `crates/flight-collision/tests/triangle_mesh3d_test.rs:335` | `packages/collision/src/triangleMesh3D.test.ts:191` — reports the nearest terrain surface with a ray-facing normal | 12 | 1e-06 |
| `crates/flight-collision/tests/triangle_mesh3d_test.rs:359` | `packages/collision/src/triangleMesh3D.test.ts:201` — returns the closest triangle through the local BVH | 12 | 1e-06 |
| `crates/flight-collision/tests/triangle_mesh3d_test.rs:467` | `packages/collision/src/triangleMesh3D.test.ts:248` — transforms local acceleration bounds into world space | 12 | 1e-06 |

### flight-compression

No additional unruled assertion weakening, source-case omission, or unexplained expected-value change identified in this crate after the recorded exclusions.

### flight-encoding

No additional unruled assertion weakening, source-case omission, or unexplained expected-value change identified in this crate after the recorded exclusions.

### flight-flow

No additional unruled assertion weakening, source-case omission, or unexplained expected-value change identified in this crate after the recorded exclusions.

### flight-layout

**F043 — Exact anchor alignment record replaced by tolerance**

- Severity: **silent weakening**.
- Rust: `crates/flight-layout/tests/anchor_layout_test.rs:35`.
- TS: `packages/layout/src/anchorLayout.test.ts:21`.
- The source parameter table requires the complete rectangle [x,y,37,19] exactly for each alignment. Rust uses absolute1e-3 bounds for positions and dimensions.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-layout/tests/flex_layout_test.rs:56` | `packages/layout/src/flexLayout.test.ts:25` — uses intrinsic sizes for basis-auto and distributes growth | 2 | 0.01 |
| `crates/flight-layout/tests/flex_layout_test.rs:438` | `packages/layout/src/flexLayout.test.ts:135` — applies %s main-axis justification | 2 | 0.01 |

### flight-log

**F044 — Removed sink may still receive events without failing test**

- Severity: **silent weakening**.
- Rust: `crates/flight-log/tests/log_test.rs:1710`.
- TS: `packages/log/src/log.test.ts:1409`.
- TS checks removal returns true and captured entries remain empty after a log call. Rust keeps true and the call but omits the empty-entry assertion; explanatory comment promises verification that never happens.

**F045 — Suppressed-provider test no longer checks that no entries are emitted**

- Severity: **silent weakening**.
- Rust: `crates/flight-log/tests/log_test.rs:2021`.
- TS: `packages/log/src/log.test.ts:1563`.
- Rust checks only the provider-called flag per suppressed severity. Source also checks the sink captured zero entries; emissions of placeholder data pass Rust.

**F046 — Exact indented output replaced by substring checks**

- Severity: **silent weakening**.
- Rust: `crates/flight-log/tests/log_test.rs:913`.
- TS: `packages/log/src/log.test.ts:746`.
- TS requires the whole string [flight] followed by exactly four spaces and inside. Rust checks only that some two spaces occur and that the result ends with inside, accepting wrong prefix/indent width/additional content.

### flight-math

**F047 — normalizeAngle boundary test accepts the opposite endpoint**

- Severity: **silent weakening**.
- Rust: `crates/flight-math/tests/angle_test.rs:90`.
- TS: `packages/math/src/angle.test.ts:51`.
- Source requires -PI in the documented [-PI,PI) range. Rust accepts either +PI or -PI within1e-4; explanation cites rounding but has no D-reference or disposition.

**F048 — Exact constant equality changed to approximate**

- Severity: **silent weakening**.
- Rust: `crates/flight-math/tests/constants_test.rs:16`.
- TS: `packages/math/src/constants.test.ts:15`.
- Source explicitly requires exact CIRCLE_KAPPA ==4*(sqrt(2)-1)/3, independently of the geometric approximation test. Rust uses helper tolerance1e-4. A wrong decimal can now pass, the precise failure the source comment distinguishes.

**F049 — Smoother-step derivative probe changed and relaxed**

- Severity: **silent weakening**.
- Rust: `crates/flight-math/tests/interpolation_advanced_test.rs:190`.
- TS: `packages/math/src/interpolationAdvanced.test.ts:125`.
- TS uses h=.001 and1digit proximity to zero. Rust changes h to.01 and accepts |derivative|<.15; numerical rationale comment has no allow/D-reference or recorded ruling.

**F050 — Exact half-turn delta check changed to approximate**

- Severity: **silent weakening**.
- Rust: `crates/flight-math/tests/angle_test.rs:65`.
- TS: `packages/math/src/angle.test.ts:35`.
- TS requires deltaAngle(0,PI) === PI. Rust permits absolute error<1e-4 through assert_approx.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-math/tests/angle_test.rs:20` | `packages/math/src/angle.test.ts:7` — converts 180 degrees to π | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:25` | `packages/math/src/angle.test.ts:10` — converts 360 degrees to 2π | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:30` | `packages/math/src/angle.test.ts:13` — converts 90 degrees to π/2 | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:35` | `packages/math/src/angle.test.ts:16` — converts negative degrees | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:44` | `packages/math/src/angle.test.ts:22` — returns 0 for identical angles | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:49` | `packages/math/src/angle.test.ts:25` — returns the shortest arc when crossing 0 | 5 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:54` | `packages/math/src/angle.test.ts:29` — returns a positive delta when the target is ahead | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:59` | `packages/math/src/angle.test.ts:32` — returns a negative delta when the target is behind | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:84` | `packages/math/src/angle.test.ts:48` — normalizes 0 to 0 | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:100` | `packages/math/src/angle.test.ts:55` — wraps 2π to 0 | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:105` | `packages/math/src/angle.test.ts:58` — wraps values above π to the negative side | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:110` | `packages/math/src/angle.test.ts:61` — wraps negative values into [-π, π) | 5 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:135` | `packages/math/src/angle.test.ts:77` — converts π to 180 degrees | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:140` | `packages/math/src/angle.test.ts:80` — converts 2π to 360 degrees | 10 | 0.0001 |
| `crates/flight-math/tests/angle_test.rs:145` | `packages/math/src/angle.test.ts:83` — is the inverse of degToRad | 10 | 0.0001 |
| `crates/flight-math/tests/constants_test.rs:44` | `packages/math/src/constants.test.ts:36` — converts 180 degrees to π | 10 | 0.0001 |
| `crates/flight-math/tests/constants_test.rs:49` | `packages/math/src/constants.test.ts:39` — converts 360 degrees to 2π | 10 | 0.0001 |
| `crates/flight-math/tests/constants_test.rs:72` | `packages/math/src/constants.test.ts:52` — equals π / 2 | 10 | 0.0001 |
| `crates/flight-math/tests/constants_test.rs:81` | `packages/math/src/constants.test.ts:57` — converts π radians to 180 degrees | 10 | 0.0001 |
| `crates/flight-math/tests/constants_test.rs:86` | `packages/math/src/constants.test.ts:60` — is the reciprocal of DEG_TO_RAD | 10 | 0.0001 |
| `crates/flight-math/tests/constants_test.rs:95` | `packages/math/src/constants.test.ts:65` — equals 2π | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:39` | `packages/math/src/interpolationAdvanced.test.ts:20` — is frame-rate independent: two half-steps equal one full step | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:51` | `packages/math/src/interpolationAdvanced.test.ts:29` — interpolates between two close angles | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:57` | `packages/math/src/interpolationAdvanced.test.ts:33` — takes the shortest arc across 0/2π | 5 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:65` | `packages/math/src/interpolationAdvanced.test.ts:41` — takes the shortest arc clockwise across 0/2π | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:71` | `packages/math/src/interpolationAdvanced.test.ts:45` — returns a at t = 0 | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:76` | `packages/math/src/interpolationAdvanced.test.ts:48` — returns b at t = 1 | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:119` | `packages/math/src/interpolationAdvanced.test.ts:75` — bounces back at t = 1.5 * length | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:129` | `packages/math/src/interpolationAdvanced.test.ts:84` — works with larger lengths | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:138` | `packages/math/src/interpolationAdvanced.test.ts:90` — wraps t over [0, length) | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:143` | `packages/math/src/interpolationAdvanced.test.ts:93` — returns 0 for exact multiple | 10 | 0.0001 |
| `crates/flight-math/tests/interpolation_advanced_test.rs:189` | `packages/math/src/interpolationAdvanced.test.ts:125` — has zero first and second derivatives at the edges | 1 | 0.15 |
| `crates/flight-math/tests/number_theory_test.rs:95` | `packages/math/src/numberTheory.test.ts:57` — matches Math.hypot squared | 10 | 0.0001 |
| `crates/flight-math/tests/random_distributions_test.rs:359` | `packages/math/src/randomDistributions.test.ts:222` — produces points on the unit circle | 8 | 0.0001 |
| `crates/flight-math/tests/random_distributions_test.rs:408` | `packages/math/src/randomDistributions.test.ts:258` — produces points on the unit sphere | 8 | 0.0001 |
| `crates/flight-math/tests/rounding_test.rs:92` | `packages/math/src/rounding.test.ts:50` — returns the fractional part of a positive number | 10 | 0.0001 |
| `crates/flight-math/tests/rounding_test.rs:102` | `packages/math/src/rounding.test.ts:56` — preserves sign for negative numbers | 10 | 0.0001 |
| `crates/flight-math/tests/rounding_test.rs:145` | `packages/math/src/rounding.test.ts:80` — works with floating-point steps | 10 | 0.0001 |
| `crates/flight-math/tests/scalar_test.rs:45` | `packages/math/src/scalar.test.ts:25` — quantizes to the nearest step | 10 | 0.0001 |
| `crates/flight-math/tests/scalar_test.rs:50` | `packages/math/src/scalar.test.ts:28` — returns min at the lower bound | 10 | 0.0001 |
| `crates/flight-math/tests/scalar_test.rs:55` | `packages/math/src/scalar.test.ts:31` — returns max at the upper bound | 10 | 0.0001 |
| `crates/flight-math/tests/scalar_test.rs:70` | `packages/math/src/scalar.test.ts:40` — clamps values outside the range | 10 | 0.0001 |
| `crates/flight-math/tests/statistics_test.rs:112` | `packages/math/src/statistics.test.ts:65` — computes the population standard deviation | 5 | 1e-05 |
| `crates/flight-math/tests/statistics_test.rs:145` | `packages/math/src/statistics.test.ts:84` — computes the population variance | 5 | 1e-05 |
| `crates/flight-math/tests/statistics_test.rs:173` | `packages/math/src/statistics.test.ts:100` — returns the weighted average | 10 | 1e-05 |

### flight-meshgeometry

**F051 — Mesh accessor and conversion output checks removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-meshgeometry/tests/mesh_geometry_attributes_test.rs:150`; `crates/flight-meshgeometry/tests/mesh_geometry_compute_test.rs:451`; `crates/flight-meshgeometry/tests/mesh_geometry_layout_test.rs:291`.
- TS: `packages/mesh/src/meshGeometryAttributes.test.ts:149`; `packages/mesh/src/meshGeometryCompute.test.ts:270`; `packages/mesh/src/meshGeometryLayout.test.ts:181`.
- Float32x3 colour test drops setter success and the resulting RGB array; adjacent-float position grouping keeps only groups[3]==3 instead of [0,1,2,3,1,5]; layout conversion keeps length 9 but drops vertex values at offsets0/3/6.

**F052 — Indexing and welding metadata assertions removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-meshgeometry/tests/mesh_geometry_index_test.rs:255,319,390`.
- TS: `packages/mesh/src/meshGeometryIndex.test.ts:176,205,240`.
- indexMeshGeometryVertices retains index contents but drops subset equality; weld sequential stream drops source indices/vertex-count unchanged checks; indexed weld drops subset equality. Owned types make some non-alias checks static, but do not guarantee correct metadata or preservation of mutable source content.

**F053 — Exact cached-bound values changed to approximate**

- Severity: **silent weakening**.
- Rust: `crates/flight-meshgeometry/tests/mesh_geometry_compute_test.rs:791,834`.
- TS: `packages/mesh/src/meshGeometryCompute.test.ts:440,501`.
- Source exact max.x values1 and4 are checked only within1e-6 in Rust. The separately recorded ensureMeshGeometryBounds identity drift is not re-reported; this finding concerns the distinct numeric assertions.

**F054 — Empty bounding-sphere sentinel weakened**

- Severity: **silent weakening**.
- Rust: `crates/flight-meshgeometry/tests/mesh_geometry_compute_test.rs:152`.
- TS: `packages/mesh/src/meshGeometryCompute.test.ts:111`.
- TS requires the empty sphere radius to be exactly -1. Rust accepts any negative radius. All three zero-centre assertions remain, so this concerns only the sentinel value.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-meshgeometry/tests/mesh_geometry_builders_test.rs:130` | `packages/mesh/src/meshGeometryBuilders.test.ts:122` — builds a filled disc with segments triangles | 2 | 0.05 |
| `crates/flight-meshgeometry/tests/mesh_geometry_builders_test.rs:210` | `packages/mesh/src/meshGeometryBuilders.test.ts:142` — builds a capped cylinder bounded by its radius and height | 2 | 0.001, 0.05 |
| `crates/flight-meshgeometry/tests/mesh_geometry_builders_test.rs:304` | `packages/mesh/src/meshGeometryBuilders.test.ts:178` — builds a sphere with evenly distributed vertices | 3 | 0.01 |
| `crates/flight-meshgeometry/tests/mesh_geometry_builders_test.rs:391` | `packages/mesh/src/meshGeometryBuilders.test.ts:224` — projects the supplied vertices onto the radius sphere | 6 | 1e-05 |
| `crates/flight-meshgeometry/tests/mesh_geometry_builders_test.rs:459` | `packages/mesh/src/meshGeometryBuilders.test.ts:275` — keeps every subdivided vertex on the sphere | 5 | 0.0001 |
| `crates/flight-meshgeometry/tests/mesh_geometry_builders_test.rs:501` | `packages/mesh/src/meshGeometryBuilders.test.ts:300` — builds a ring bounded by outerRadius | 2 | 0.05 |
| `crates/flight-meshgeometry/tests/mesh_geometry_builders_test.rs:523` | `packages/mesh/src/meshGeometryBuilders.test.ts:309` — builds a sphere whose vertices lie on the radius | 4 | 0.001 |
| `crates/flight-meshgeometry/tests/mesh_geometry_builders_test.rs:613` | `packages/mesh/src/meshGeometryBuilders.test.ts:340` — builds a torus bounded by radius + tube | 2 | 0.05 |
| `crates/flight-meshgeometry/tests/mesh_geometry_compute_test.rs:907` | `packages/mesh/src/meshGeometryCompute.test.ts:571` — computeMeshGeometryTangents reads a strip as two triangles, not one | 5 | 1e-05 |
| `crates/flight-meshgeometry/tests/mesh_geometry_compute_test.rs:935` | `packages/mesh/src/meshGeometryCompute.test.ts:588` — leaves no vertex of a strip without a normal | 5 | 1e-05 |
| `crates/flight-meshgeometry/tests/mesh_geometry_operations_test.rs:81` | `packages/mesh/src/meshGeometryOperations.test.ts:29` — builds a triangle from positions only, computing normals | 3 | 0.01 |
| `crates/flight-meshgeometry/tests/mesh_geometry_operations_test.rs:94` | `packages/mesh/src/meshGeometryOperations.test.ts:38` — uses supplied normals without recomputing | 3 | 0.01 |
| `crates/flight-meshgeometry/tests/mesh_geometry_transforms_test.rs:151` | `packages/mesh/src/meshGeometryTransforms.test.ts:104` — keeps the tangent on the surface under scaleMeshGeometry too | 5 | 1e-05 |
| `crates/flight-meshgeometry/tests/mesh_geometry_transforms_test.rs:310` | `packages/mesh/src/meshGeometryTransforms.test.ts:92` — keeps the tangent on the surface under a non-uniform scale | 5 | 1e-05 |

### flight-particles

**F055 — Nonzero spawn/death payload case replaced by origin-only fixture**

- Severity: **silent weakening**.
- Rust: `crates/flight-particles/tests/update_particle_objects_test.rs:1882`.
- TS: `packages/particles/src/updateParticleObjects.test.ts:286`.
- Source uses random()=>0, line width20 and requires both callbacks contain [-10,0,0]. Rust changes to Point emitter and expects [0,0,0]. A callback that always reports the origin now passes.

**F056 — Inclusive spawn boundary/source RNG fixtures replaced**

- Severity: **silent weakening**.
- Rust: `crates/flight-particles/tests/particle_spawn_offset_test.rs:9,157,229`.
- TS: `packages/particles/src/particleSpawnOffset.test.ts:5,26,32`.
- TS exercises controlled samples [0.25,0,0,0.75], exact rectangle[-10,2.5], inclusive left line endpoint[-10,0] for random0, and quarter-turn ring. Rust replaces them with interior seeded samples and formula-derived expectations, losing the named inclusive-boundary source case; exact rectangle equality also becomes tolerance1e-5.

**F057 — Line-emitter boundary position reduced to range membership**

- Severity: **silent weakening**.
- Rust: `crates/flight-particles/tests/update_particle_objects_test.rs:1361`.
- TS: `packages/particles/src/updateParticleObjects.test.ts:190`.
- TS fixed random0 expects x=-40,y=0. Rust seeded fixture accepts any |x|<=40.0001 and y=0. An interior spawn passes the test named boundary.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:38` | `packages/particles/src/applyParticleCollisions.test.ts:40` — exclude mode keeps a particle outside the disc | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:58` | `packages/particles/src/applyParticleCollisions.test.ts:50` — contain mode keeps a particle inside the boundary | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:88` | `packages/particles/src/applyParticleCollisions.test.ts:67` — pushes a penetrating particle back to the surface and stops it (restitution 0) | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:107` | `packages/particles/src/applyParticleCollisions.test.ts:75` — bounces with restitution | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:125` | `packages/particles/src/applyParticleCollisions.test.ts:83` — applies friction to the tangential component | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:166` | `packages/particles/src/applyParticleCollisions.test.ts:100` — plane with nz pushes a penetrating particle back along the 3D normal | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:191` | `packages/particles/src/applyParticleCollisions.test.ts:112` — exclude mode keeps a particle outside the sphere | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:216` | `packages/particles/src/applyParticleCollisions.test.ts:125` — contain mode keeps a particle inside the sphere | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:241` | `packages/particles/src/applyParticleCollisions.test.ts:138` — sphere contain with 3D offset | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:266` | `packages/particles/src/applyParticleCollisions.test.ts:150` — contain mode clamps particles to the bounds and reflects velocity | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:286` | `packages/particles/src/applyParticleCollisions.test.ts:160` — exclude mode pushes a particle out of a solid box along the shallowest axis | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:342` | `packages/particles/src/applyParticleCollisions.test.ts:201` — pushes a live object back onto a floor plane and kills its normal velocity | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_collisions_test.rs:361` | `packages/particles/src/applyParticleCollisions.test.ts:208` — bounces a live object with restitution | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:31` | `packages/particles/src/applyParticleForces.test.ts:38` — attractor pulls velocity toward the point | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:53` | `packages/particles/src/applyParticleForces.test.ts:132` — attractor with z pulls velocity toward the 3D point | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:74` | `packages/particles/src/applyParticleForces.test.ts:102` — composes multiple forces additively | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:97` | `packages/particles/src/applyParticleForces.test.ts:168` — drag damps z velocity | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:110` | `packages/particles/src/applyParticleForces.test.ts:73` — drag reduces existing velocity | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:234` | `packages/particles/src/applyParticleForces.test.ts:64` — vortex applies tangential velocity | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:259` | `packages/particles/src/applyParticleForces.test.ts:141` — vortex with custom axis rotates around that axis | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:286` | `packages/particles/src/applyParticleForces.test.ts:81` — wind adds constant acceleration | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:303` | `packages/particles/src/applyParticleForces.test.ts:124` — wind z component adds acceleration on the Z axis | 2 | 0.01 |
| `crates/flight-particles/tests/apply_particle_forces_test.rs:325` | `packages/particles/src/applyParticleForces.test.ts:191` — applies forces only to live objects | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:18` | `packages/particles/src/curve.test.ts:24` — bakes a scalar function into a LUT sampled at the endpoints | 1 | 0.1 |
| `crates/flight-particles/tests/curve_test.rs:31` | `packages/particles/src/curve.test.ts:34` — interpolates from red to green through yellow at t=0.5 | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:40` | `packages/particles/src/curve.test.ts:44` — takes the short arc when interpolating hues | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:48` | `packages/particles/src/curve.test.ts:53` — writes at the given offset | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:61` | `packages/particles/src/curve.test.ts:63` — interpolates RGB values stored in birth/death arrays via HSV at the given offset | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:72` | `packages/particles/src/curve.test.ts:74` — returns birth color at t=0 and death color at t=1 | 3 | 0.001 |
| `crates/flight-particles/tests/curve_test.rs:88` | `packages/particles/src/curve.test.ts:89` — reads and writes at the specified offset | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:181` | `packages/particles/src/curve.test.ts:147` — interpolates a 3-stop scalar timeline through its middle stop | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:196` | `packages/particles/src/curve.test.ts:158` — sorts unsorted keyframes by time | 1 | 0.1 |
| `crates/flight-particles/tests/curve_test.rs:209` | `packages/particles/src/curve.test.ts:167` — handles non-normalized key times by clamping at the ends | 1 | 0.1 |
| `crates/flight-particles/tests/curve_test.rs:223` | `packages/particles/src/curve.test.ts:177` — a single keyframe yields a constant curve | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:256` | `packages/particles/src/curve.test.ts:200` — round-trips a baked scalar curve back to keyframes | 5 | 1e-05 |
| `crates/flight-particles/tests/curve_test.rs:291` | `packages/particles/src/curve.test.ts:222` — interpolates interleaved RGB channels | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:301` | `packages/particles/src/curve.test.ts:231` — writes at the given offset | 2 | 0.01 |
| `crates/flight-particles/tests/curve_test.rs:322` | `packages/particles/src/curve.test.ts:248` — linearly interpolates between samples | 2 | 0.01 |
| `crates/flight-particles/tests/update_particle_objects_test.rs:327` | `packages/particles/src/updateParticleObjects.test.ts:398` — applies alpha and scale curves over lifetime | 2 | 0.02 |
| `crates/flight-particles/tests/update_particle_objects_test.rs:481` | `packages/particles/src/updateParticleObjects.test.ts:87` — fades alpha from alphaStart to alphaEnd over lifetime | 1 | 0.1 |
| `crates/flight-particles/tests/update_particle_objects_test.rs:1136` | `packages/particles/src/updateParticleObjects.test.ts:150` — rotates objects at their per-particle rotation speed | 3 | 0.01 |
| `crates/flight-particles/tests/update_particle_objects_test.rs:1433` | `packages/particles/src/updateParticleObjects.test.ts:207` — spawns objects on the ring emitter boundary | 4 | 0.01 |
| `crates/flight-particles/tests/update_particle_objects_test.rs:1585` | `packages/particles/src/updateParticleObjects.test.ts:132` — animates scale over lifetime when scaleEnd differs from 1 | 1 | 0.1 |

### flight-path-boolean

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-path-boolean/tests/boolean_paths_test.rs:50` | `packages/path-boolean/src/booleanPaths.test.ts:49` — dispatches to the operation named in the argument | 4 | 0.1 |
| `crates/flight-path-boolean/tests/boolean_paths_test.rs:75` | `packages/path-boolean/src/booleanPaths.test.ts:64` — writes into the provided out path and returns it | 4 | 0.1 |
| `crates/flight-path-boolean/tests/boolean_paths_test.rs:103` | `packages/path-boolean/src/booleanPaths.test.ts:87` — honors the even-odd fill rule option on self-overlapping input | 4 | 0.1 |
| `crates/flight-path-boolean/tests/boolean_paths_test.rs:119` | `packages/path-boolean/src/booleanPaths.test.ts:102` — accepts a coarser tolerance option without error | 4 | 0.1 |
| `crates/flight-path-boolean/tests/boolean_paths_test.rs:158` | `packages/path-boolean/src/booleanPaths.test.ts:110` — cuts a contained hole | 4 | 0.1 |
| `crates/flight-path-boolean/tests/boolean_paths_test.rs:206` | `packages/path-boolean/src/booleanPaths.test.ts:125` — keeps the overlap | 4 | 0.1 |
| `crates/flight-path-boolean/tests/boolean_paths_test.rs:273` | `packages/path-boolean/src/booleanPaths.test.ts:137` — merges overlapping rectangles | 4 | 0.1 |
| `crates/flight-path-boolean/tests/boolean_paths_test.rs:281` | `packages/path-boolean/src/booleanPaths.test.ts:142` — commutes | 4 | 0.1 |
| `crates/flight-path-boolean/tests/boolean_paths_test.rs:321` | `packages/path-boolean/src/booleanPaths.test.ts:165` — keeps the symmetric difference | 4 | 0.1 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:100` | `packages/path-boolean/src/martinezKernel.test.ts:90` — unions two squares sharing a full edge into one rectangle | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:118` | `packages/path-boolean/src/martinezKernel.test.ts:102` — handles a partially overlapping shared edge (offset abutment) | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:125` | `packages/path-boolean/src/martinezKernel.test.ts:109` — collapses two identical squares under union to a single square | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:131` | `packages/path-boolean/src/martinezKernel.test.ts:114` — collapses two identical squares under intersection to the same square | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:149` | `packages/path-boolean/src/martinezKernel.test.ts:131` — cuts a hole when the clip is fully contained | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:158` | `packages/path-boolean/src/martinezKernel.test.ts:139` — subtracts a partial overlap | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:172` | `packages/path-boolean/src/martinezKernel.test.ts:153` — unions disjoint squares into two rings | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:185` | `packages/path-boolean/src/martinezKernel.test.ts:164` — xors disjoint squares to both squares | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:197` | `packages/path-boolean/src/martinezKernel.test.ts:175` — passes the subject through union with an empty clip | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:209` | `packages/path-boolean/src/martinezKernel.test.ts:184` — ignores a zero-area (collinear) contour | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:216` | `packages/path-boolean/src/martinezKernel.test.ts:190` — ignores a single-point contour | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:222` | `packages/path-boolean/src/martinezKernel.test.ts:195` — ignores a contour with too few points | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:249` | `packages/path-boolean/src/martinezKernel.test.ts:228` — fills the overlap of two same-wound squares under non-zero (winding 2) | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:257` | `packages/path-boolean/src/martinezKernel.test.ts:235` — holes out the overlap of two same-wound squares under even-odd | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:274` | `packages/path-boolean/src/martinezKernel.test.ts:254` — keeps a counter-clockwise (positively-wound) region under positive fill, drops it under negative | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:281` | `packages/path-boolean/src/martinezKernel.test.ts:260` — mirrors that for a clockwise (negatively-wound) region | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:288` | `packages/path-boolean/src/martinezKernel.test.ts:266` — dissolves a same-wound self-overlap under positive fill (winding 2 stays filled) | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:296` | `packages/path-boolean/src/martinezKernel.test.ts:277` — resolves the same topology and scale-relative area across a 1e9 span of coordinate scales | 6, 4 | 1e-06, 0.1 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:311` | `packages/path-boolean/src/martinezKernel.test.ts:295` — unions two corner-touching squares to their combined area | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:325` | `packages/path-boolean/src/martinezKernel.test.ts:309` — unions commute | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:334` | `packages/path-boolean/src/martinezKernel.test.ts:315` — intersections commute | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:343` | `packages/path-boolean/src/martinezKernel.test.ts:321` — xor is symmetric | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:352` | `packages/path-boolean/src/martinezKernel.test.ts:329` — unions to the outer square | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:358` | `packages/path-boolean/src/martinezKernel.test.ts:334` — intersects to the inner square | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:364` | `packages/path-boolean/src/martinezKernel.test.ts:339` — xors to the outer-with-hole frame | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:372` | `packages/path-boolean/src/martinezKernel.test.ts:348` — unions two triangles sharing a diagonal into a square | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/martinez_kernel_test.rs:389` | `packages/path-boolean/src/martinezKernel.test.ts:362` — intersects a diamond overlapping a square (real crossing points) | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:104` | `packages/path-boolean/src/offsetPath.test.ts:69` — inflates a closed square by delta on every side with a miter join | 6, 4 | 1e-06, 0.1 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:117` | `packages/path-boolean/src/offsetPath.test.ts:79` — deflates a closed square on a negative delta | 6, 4 | 1e-06, 0.1 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:139` | `packages/path-boolean/src/offsetPath.test.ts:95` — chamfers corners with a bevel join | 6, 4 | 1e-06, 0.1 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:183` | `packages/path-boolean/src/offsetPath.test.ts:131` — squares corners with a square join | 6, 4 | 1e-06, 0.1 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:199` | `packages/path-boolean/src/offsetPath.test.ts:142` — cleans a concave corner into a single valid outline | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:215` | `packages/path-boolean/src/offsetPath.test.ts:154` — closes a concave slot narrower than 2·delta into a valid self-intersection-free outline | 6, 4 | 1e-06, 0.0001 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:234` | `packages/path-boolean/src/offsetPath.test.ts:180` — strokes an open path into a butt-capped rectangle | 6, 4 | 1e-06, 0.1 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:248` | `packages/path-boolean/src/offsetPath.test.ts:190` — extends an open path past its ends with a square cap | 6, 4 | 1e-06, 0.1 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:260` | `packages/path-boolean/src/offsetPath.test.ts:198` — caps an open path with half-circles on a round end | 2 | 0.01, 0.05 |
| `crates/flight-path-boolean/tests/offset_path_test.rs:272` | `packages/path-boolean/src/offsetPath.test.ts:206` — offsets the same vertices differently as an open vs a closed contour | 4 | 0.1 |
| `crates/flight-path-boolean/tests/resolve_path_regions_test.rs:36` | `packages/path-boolean/src/resolvePathRegions.test.ts:36` — self-unions overlapping rings into one outline under nonZero | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/resolve_path_regions_test.rs:47` | `packages/path-boolean/src/resolvePathRegions.test.ts:42` — applies the fill rule to self-overlap under evenOdd | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/simplify_path_test.rs:80` | `packages/path-boolean/src/simplifyPath.test.ts:73` — resolves a self-intersecting bowtie into two triangles | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/simplify_path_test.rs:89` | `packages/path-boolean/src/simplifyPath.test.ts:79` — fills a self-overlapping region solid under nonZero | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/simplify_path_test.rs:110` | `packages/path-boolean/src/simplifyPath.test.ts:96` — punches an even-odd hole through a self-overlapping region | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/simplify_path_test.rs:131` | `packages/path-boolean/src/simplifyPath.test.ts:113` — fills a self-overlapping star solid under nonZero but hollow under evenOdd | 2 | 1 |
| `crates/flight-path-boolean/tests/simplify_path_test.rs:147` | `packages/path-boolean/src/simplifyPath.test.ts:123` — passes an already-simple convex path through unchanged | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/union_all_paths_test.rs:55` | `packages/path-boolean/src/unionAllPaths.test.ts:42` — simplifies a single self-overlapping path | 6 | 1e-06 |
| `crates/flight-path-boolean/tests/union_all_paths_test.rs:88` | `packages/path-boolean/src/unionAllPaths.test.ts:66` — keeps disjoint squares as separate rings summing their areas | 6 | 1e-06 |

### flight-path

**F058 — Spike-cleanup exact command/data expectations reduced to presence and maximum size**

- Severity: **silent weakening**.
- Rust: `crates/flight-path/tests/clean_path_test.rs:117`.
- TS: `packages/path/src/cleanPath.test.ts:32`.
- TS requires exact MOVE/LINE/LINE/LINE/CLOSE and [0,0,10,0,10,10,0,10]. Rust requires a Close somewhere and data.len()<=8. Wrong topology, coordinates, or an empty close-only path can pass.

**F059 — Path command-stream assertions removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-path/tests/reverse_path_test.rs:7`; `crates/flight-path/tests/path_morph_test.rs:180`; `crates/flight-path/tests/path_test.rs:101`.
- TS: `packages/path/src/reversePath.test.ts:7`; `packages/path/src/pathMorph.test.ts:44`; `packages/path/src/path.test.ts:98`.
- Reverse polyline drops exact commands; morph subdivision drops exact commands; appendClose checks only final command/data length rather than complete command and coordinate contents.

**F060 — Nearest-point empty sentinel weakened**

- Severity: **silent weakening**.
- Rust: `crates/flight-path/tests/get_path_nearest_point_test.rs:8`.
- TS: `packages/path/src/getPathNearestPoint.test.ts:5`.
- TS requires exactly -1; Rust accepts any negative distance.

**F061 — Stroke tessellation area precision substantially widened**

- Severity: **silent weakening**.
- Rust: `crates/flight-path/tests/tessellate_stroke_path_test.rs:33,46`.
- TS: `packages/path/src/tessellateStrokePath.test.ts:7,17`.
- TS tests area1000 and3000 to6digits. Rust accepts absolute errors below1 and50 respectively.

**F062 — Output collection reuse source cases absent**

- Severity: **silent weakening**.
- Rust: `crates/flight-path/tests/tessellate_path_test.rs:97`; `crates/flight-path/tests/path_morph_test.rs:243`.
- TS: `packages/path/src/tessellatePath.test.ts:82`; `packages/path/src/pathMorph.test.ts:253`.
- The source cases checking vertices/indices reuse by tessellatePathInto and commands/data reuse across morph samples have no Rust counterpart. Current tests compare generated contents but do not probe retained buffer storage; no specific recorded omission was located.

**F063 — Cross-path tessellation state-isolation probe replaced by single-path repetition**

- Severity: **silent weakening**.
- Rust: `crates/flight-path/tests/tessellate_stroke_path_test.rs:138`.
- TS: `packages/path/src/tessellateStrokePath.test.ts:82`.
- TS alternates open and closed paths with different tolerances for50 iterations and compares both baselines. Rust repeats one path10times, losing cross-path contamination coverage and reducing the corpus.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-path/tests/fit_path_curves_test.rs:6` | `packages/path/src/fitPathCurves.test.ts:7` — keeps a straight line as a line | 2 | 0.5 |
| `crates/flight-path/tests/get_path_bounds_test.rs:34` | `packages/path/src/getPathBounds.test.ts:20` — returns the exact bounds of a rectangle | 2 | 0.5 |
| `crates/flight-path/tests/get_path_bounds_test.rs:47` | `packages/path/src/getPathBounds.test.ts:32` — includes the start point of a single MOVE_TO | 2 | 0.5 |
| `crates/flight-path/tests/get_path_bounds_test.rs:59` | `packages/path/src/getPathBounds.test.ts:43` — expands past control points for a quadratic curve | 2 | 0.5, 1 |
| `crates/flight-path/tests/get_path_bounds_test.rs:72` | `packages/path/src/getPathBounds.test.ts:58` — expands past control points for a cubic curve | 2 | 0.5 |
| `crates/flight-path/tests/get_path_bounds_test.rs:85` | `packages/path/src/getPathBounds.test.ts:73` — handles a MOVE_TO + LINE_TO spanning multiple quadrants | 2 | 0.5 |
| `crates/flight-path/tests/get_path_contour_lengths_test.rs:13` | `packages/path/src/getPathContourLengths.test.ts:10` — returns a single length matching getPathLength for a single contour | 2 | 0.5 |
| `crates/flight-path/tests/get_path_contour_lengths_test.rs:25` | `packages/path/src/getPathContourLengths.test.ts:20` — returns per-contour lengths for a multi-contour path | 2 | 0.5 |
| `crates/flight-path/tests/get_path_contour_lengths_test.rs:38` | `packages/path/src/getPathContourLengths.test.ts:32` — accounts for closed contours | 2 | 1 |
| `crates/flight-path/tests/get_path_contour_lengths_test.rs:47` | `packages/path/src/getPathContourLengths.test.ts:40` — sums per-contour lengths to match total getPathLength | 2 | 0.5 |
| `crates/flight-path/tests/get_path_curvature_at_distance_test.rs:41` | `packages/path/src/getPathCurvatureAtDistance.test.ts:40` — clamps at the end of the path for distances beyond length | 12 | 0.001 |
| `crates/flight-path/tests/get_path_length_test.rs:13` | `packages/path/src/getPathLength.test.ts:9` — returns the correct length of a straight line | 2 | 0.5 |
| `crates/flight-path/tests/get_path_length_test.rs:30` | `packages/path/src/getPathLength.test.ts:25` — sums lengths across multiple subpaths | 2 | 0.5 |
| `crates/flight-path/tests/get_path_nearest_point_test.rs:15` | `packages/path/src/getPathNearestPoint.test.ts:10` — returns 0 for a point on the path | 2 | 0.5 |
| `crates/flight-path/tests/get_path_nearest_point_test.rs:27` | `packages/path/src/getPathNearestPoint.test.ts:21` — returns the perpendicular distance for a point off the path | 2 | 0.5 |
| `crates/flight-path/tests/get_path_nearest_point_test.rs:39` | `packages/path/src/getPathNearestPoint.test.ts:32` — picks the closest contour in a multi-contour path | 2 | 0.5 |
| `crates/flight-path/tests/get_path_nearest_point_test.rs:52` | `packages/path/src/getPathNearestPoint.test.ts:44` — clamps to an endpoint when the projection falls outside the segment | 2 | 0.5 |
| `crates/flight-path/tests/get_path_nearest_point_test.rs:64` | `packages/path/src/getPathNearestPoint.test.ts:55` — works with curved paths | 0 | 1 |
| `crates/flight-path/tests/get_path_point_at_distance_test.rs:15` | `packages/path/src/getPathPointAtDistance.test.ts:14` — returns the start point at distance 0 | 2 | 0.5 |
| `crates/flight-path/tests/get_path_point_at_distance_test.rs:26` | `packages/path/src/getPathPointAtDistance.test.ts:24` — interpolates to the midpoint of a segment | 2 | 0.5 |
| `crates/flight-path/tests/get_path_point_at_distance_test.rs:37` | `packages/path/src/getPathPointAtDistance.test.ts:34` — clamps to the end when distance exceeds total length | 2 | 0.5 |
| `crates/flight-path/tests/get_path_point_at_distance_test.rs:48` | `packages/path/src/getPathPointAtDistance.test.ts:44` — clamps to start when distance is negative | 2 | 0.5 |
| `crates/flight-path/tests/get_path_point_at_distance_test.rs:63` | `packages/path/src/getPathPointAtDistance.test.ts:56` — returns both point and tangent simultaneously | 2 | 0.5, 0.01 |
| `crates/flight-path/tests/get_path_point_at_distance_test.rs:82` | `packages/path/src/getPathPointAtDistance.test.ts:72` — returns (1,0) as default tangent for empty path | 2 | 0.01 |
| `crates/flight-path/tests/get_path_point_at_distance_test.rs:91` | `packages/path/src/getPathPointAtDistance.test.ts:79` — returns a unit tangent along a horizontal line | 2 | 0.01 |
| `crates/flight-path/tests/get_path_point_at_distance_test.rs:103` | `packages/path/src/getPathPointAtDistance.test.ts:89` — returns a unit tangent along a vertical line | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:19` | `packages/path/src/getPathSegmentAtParameter.test.ts:30` — returns a known curvature for a circular-arc approximation | 1 | 0.1 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:29` | `packages/path/src/getPathSegmentAtParameter.test.ts:39` — returns the start point at t=0 | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:37` | `packages/path/src/getPathSegmentAtParameter.test.ts:46` — returns the end point at t=1 | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:45` | `packages/path/src/getPathSegmentAtParameter.test.ts:53` — interpolates a straight cubic at midpoint | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:57` | `packages/path/src/getPathSegmentAtParameter.test.ts:63` — returns the forward tangent at t=0 (C1 - P0) | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:65` | `packages/path/src/getPathSegmentAtParameter.test.ts:71` — returns the backward tangent at t=1 (P1 - C2) | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:129` | `packages/path/src/getPathSegmentAtParameter.test.ts:119` — evaluates midpoint of a line segment | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:141` | `packages/path/src/getPathSegmentAtParameter.test.ts:129` — evaluates start and end of a line segment | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:156` | `packages/path/src/getPathSegmentAtParameter.test.ts:143` — selects the correct segment by index in a multi-segment path | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:169` | `packages/path/src/getPathSegmentAtParameter.test.ts:155` — evaluates midpoint of a quadratic bezier | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:181` | `packages/path/src/getPathSegmentAtParameter.test.ts:166` — evaluates midpoint of a cubic bezier | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:205` | `packages/path/src/getPathSegmentAtParameter.test.ts:187` — returns the tangent direction for a horizontal line | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:217` | `packages/path/src/getPathSegmentAtParameter.test.ts:198` — returns a non-zero tangent at t=0 for a cubic bezier | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:255` | `packages/path/src/getPathSegmentAtParameter.test.ts:228` — returns midpoint at t=0.5 for a known quadratic curve | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:263` | `packages/path/src/getPathSegmentAtParameter.test.ts:237` — returns start at t=0 | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:271` | `packages/path/src/getPathSegmentAtParameter.test.ts:244` — returns end at t=1 | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:283` | `packages/path/src/getPathSegmentAtParameter.test.ts:253` — returns the end tangent direction at t=1 | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:291` | `packages/path/src/getPathSegmentAtParameter.test.ts:262` — returns the midpoint tangent at t=0.5 | 2 | 0.01 |
| `crates/flight-path/tests/get_path_segment_at_parameter_test.rs:299` | `packages/path/src/getPathSegmentAtParameter.test.ts:272` — returns the start tangent direction at t=0 | 2 | 0.01 |
| `crates/flight-path/tests/get_path_signed_area_test.rs:41` | `packages/path/src/getPathSignedArea.test.ts:32` — returns the correct area magnitude for a rectangle | 2 | 1 |
| `crates/flight-path/tests/path_morph_test.rs:119` | `packages/path/src/pathMorph.test.ts:169` — normalizes a consistently reversed closed endpoint | 2 | 0.01 |
| `crates/flight-path/tests/path_morph_test.rs:135` | `packages/path/src/pathMorph.test.ts:186` — normalizes opposing contours independently under even-odd winding | 2 | 0.01 |
| `crates/flight-path/tests/path_morph_test.rs:179` | `packages/path/src/pathMorph.test.ts:44` — subdivides the lower segment count without changing its endpoint geometry | 2 | 0.01 |
| `crates/flight-path/tests/path_test.rs:21` | `packages/path/src/path.test.ts:32` — starts at the correct point on the circle (angle=0 → rightmost) | 2 | 0.01 |
| `crates/flight-path/tests/path_test.rs:36` | `packages/path/src/path.test.ts:40` — ends at the correct point for a quarter circle | 1 | 0.1 |
| `crates/flight-path/tests/path_test.rs:88` | `packages/path/src/path.test.ts:88` — starts at the rightmost point of the circle | 2 | 0.01 |
| `crates/flight-path/tests/path_test.rs:137` | `packages/path/src/path.test.ts:125` — starts at (cx+radiusX, cy) | 2 | 0.01 |
| `crates/flight-path/tests/path_test.rs:164` | `packages/path/src/path.test.ts:148` — appends a LINE_TO when radiusX is 0 | 2 | 0.01 |
| `crates/flight-path/tests/path_test.rs:191` | `packages/path/src/path.test.ts:173` — ends at the specified endpoint (non-rotated, unit circle) | 1 | 0.1 |
| `crates/flight-path/tests/path_test.rs:321` | `packages/path/src/path.test.ts:279` — produces a rectangle (no arcs) when radius is 0 | 2 | 0.01 |
| `crates/flight-path/tests/path_test.rs:386` | `packages/path/src/path.test.ts:336` — selects the short quarter-turn sweep for a clockwise right-angle corner | 6 | 1e-06 |
| `crates/flight-path/tests/path_test.rs:396` | `packages/path/src/path.test.ts:345` — selects the short quarter-turn sweep for a counterclockwise right-angle corner | 6 | 1e-06 |
| `crates/flight-path/tests/path_test.rs:564` | `packages/path/src/path.test.ts:447` — returns the endpoint after appendPathArc | 1 | 0.1 |
| `crates/flight-path/tests/path_test.rs:573` | `packages/path/src/path.test.ts:455` — returns the endpoint after appendPathCircle | 2 | 0.01 |
| `crates/flight-path/tests/stroke_path_test.rs:14` | `packages/path/src/strokePath.test.ts:12` — returns a closed outline for a horizontal line (butt caps) | 2 | 0.5 |
| `crates/flight-path/tests/stroke_path_test.rs:35` | `packages/path/src/strokePath.test.ts:29` — extends endpoints for square caps | 2 | 0.5 |
| `crates/flight-path/tests/tessellate_path_test.rs:36` | `packages/path/src/tessellatePath.test.ts:33` — triangulates a triangle into one triangle | 2 | 0.5 |
| `crates/flight-path/tests/tessellate_path_test.rs:44` | `packages/path/src/tessellatePath.test.ts:39` — triangulates a square into two triangles covering its area | 2 | 0.5 |
| `crates/flight-path/tests/tessellate_path_test.rs:52` | `packages/path/src/tessellatePath.test.ts:45` — triangulates a concave L-shape conserving area (n-2 triangles) | 2 | 0.5 |
| `crates/flight-path/tests/tessellate_path_test.rs:60` | `packages/path/src/tessellatePath.test.ts:51` — drops a trailing point that closes the contour explicitly | 2 | 0.5 |
| `crates/flight-path/tests/tessellate_stroke_path_test.rs:32` | `packages/path/src/tessellateStrokePath.test.ts:7` — tessellates an open butt-capped line without overlapping triangles | 6 | 1 |
| `crates/flight-path/tests/tessellate_stroke_path_test.rs:45` | `packages/path/src/tessellateStrokePath.test.ts:17` — tessellates a closed rectangle as a hollow ring | 6 | 50 |

### flight-signals

**F064 — Paused flag check dropped from safe-emission case**

- Severity: **silent weakening**.
- Rust: `crates/flight-signals/tests/connection_test.rs:260`.
- TS: `packages/signals/src/connection.test.ts:134`.
- TS verifies count0, connected=true, paused=true, and slot still registered. Rust safe-emission test checks count and connected only; D4 connection shape explains the slot lookup adaptation but not losing the observable paused-state assertion.

### flight-spatial

**F065 — Complete indexing notice values reduced to partial checks**

- Severity: **silent weakening**.
- Rust: `crates/flight-spatial/tests/spatial_indexing_guard_test.rs:116,138`; `crates/flight-spatial/tests/format_spatial_indexing_notice_test.rs:143`; `crates/flight-spatial/tests/explain_spatial_indexing_3d_test.rs:41`.
- TS: `packages/spatial/src/spatialIndexingGuard.test.ts:93,115`; `packages/spatial/src/formatSpatialIndexingNotice.test.ts:115`; `packages/spatial/src/explainSpatialIndexing3D.test.ts:39`.
- Invalid-cell-size notice test drops cellSize, operation and bucket span; inverted notice keeps only reason/count instead of complete notice; formatted live notices retain two substrings instead of complete formatted equality; ordinary3D explanation omits returned id=1. Wrong notice metadata can pass.

### flight-spring

**F066 — Energy and timestep equivalence oracles widened by orders of magnitude**

- Severity: **silent weakening**.
- Rust: `crates/flight-spring/tests/spring_test.rs:162,346`.
- TS: `packages/spring/src/spring.test.ts:100,216`.
- Energy conservation changes from toBeCloseTo(initialEnergy,8) to relative error<1e-2. Analytic semigroup value/velocity checks change from6digits to absolute1e-2 and1e-1. No spring precision/tolerance ruling found.

**F067 — Monotonicity, critical-band, stiff and angle tolerances widened**

- Severity: **silent weakening**.
- Rust: `crates/flight-spring/tests/spring_test.rs:186,227,281,313,418,437`; `crates/flight-spring/tests/spring_config_test.rs:47,59`.
- TS: `packages/spring/src/spring.test.ts:114,138,163,189,269,286`; `packages/spring/src/springConfig.test.ts:21,27`.
- Critical-band value comparisons use1e-3 vs3digits; velocities5e-2 vs2digits. Monotonic/overshoot guard slack grows1e-9→1e-6. Stiff result6digits→1e-3. Degree/radian seam checks12digits→1e-3. Physical config frequency9digits and damping12digits→1e-3.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-spring/tests/spring_config_test.rs:58` | `packages/spring/src/springConfig.test.ts:27` — accounts for mass in both frequency and damping ratio | 9, 12 | 0.001 |
| `crates/flight-spring/tests/spring_test.rs:161` | `packages/spring/src/spring.test.ts:100` — preserves oscillation energy when dampingRatio is exactly zero | 8 | 0.01 relative error (TS is absolute) |
| `crates/flight-spring/tests/spring_test.rs:185` | `packages/spring/src/spring.test.ts:114` — uses the critical solution exactly at and inside CRITICAL_BAND without a boundary discontinuity | 3, 2 | 0.05, 0.001 |
| `crates/flight-spring/tests/spring_test.rs:226` | `packages/spring/src/spring.test.ts:138` — converges monotonically to the target with no overshoot when critically damped | 3 | 0.001 |
| `crates/flight-spring/tests/spring_test.rs:312` | `packages/spring/src/spring.test.ts:189` — stays finite and bounded for a stiff spring stepped at a huge deltaTime | 6 | 0.001 |
| `crates/flight-spring/tests/spring_test.rs:345` | `packages/spring/src/spring.test.ts:216` — is frame-rate independent for a constant target (analytic semigroup) | 6 | 0.01, 0.1 |
| `crates/flight-spring/tests/spring_test.rs:417` | `packages/spring/src/spring.test.ts:269` — takes the shortest path across a degree seam in both directions | 12 | 0.001 |
| `crates/flight-spring/tests/spring_test.rs:436` | `packages/spring/src/spring.test.ts:286` — uses caller-selected units and resolves exact half-turn ties positively | 12 | 0.001 |

### flight-statechart

**F068 — Shared authored chart identity replaced by value equality**

- Severity: **silent weakening**.
- Rust: `crates/flight-statechart/tests/statechart_test.rs:400`.
- TS: `packages/statechart/src/statechart.test.ts:144`.
- TS requires both actor instances to retain the same chart reference. Rust helper clones the chart into separate Refs and asserts deep equality, so two distinct charts pass this source-derived test. A separate sugar delegation pointer check does not restore the source test checking supplied authored-chart identity.

**F069 — Malformed-index case no longer checks RangeError type**

- Severity: **silent weakening**.
- Rust: `crates/flight-statechart/tests/statechart_test.rs:465`.
- TS: `packages/statechart/src/statechart.test.ts:183`.
- TS requires RangeError; the corresponding Rust case uses bare #[should_panic], so any panic passes. Other setter tests use expect_throw_kind and preserve their typed-error assertions.

### flight-textbidi

No additional unruled assertion weakening, source-case omission, or unexplained expected-value change identified in this crate after the recorded exclusions.

### flight-textsegment

**F070 — No-materialization assertion removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-textsegment/tests/text_segment_boundary_test.rs:108`.
- TS: `packages/textsegment/src/textSegmentBoundary.test.ts:49`.
- TS spies on the backend segment function and asserts it was never called. Rust retains only the returned boundary value; the comment expressly substitutes result correctness for the allocation/dispatch assertion without an allow or design reference.

**F071 — Runtime-unavailable backend case absent**

- Severity: **silent weakening**.
- Rust: `crates/flight-textsegment/tests/text_segmenter_backend_test.rs:27`.
- TS: `packages/textsegment/src/textSegmenterBackend.test.ts:44`.
- TS disables Intl.Segmenter and expects available=false/intlSegmenterAvailable=false. Rust tests only an always-available bundled capability and has no matching absence case. Source comments explain the compiled fallback, but no allow/D-reference or matching drift disposition was located. This is a source-case omission, not a claim that Rust can disable a compiled dependency.

### flight-tween

**F072 — Independent timer target assertion removed**

- Severity: **silent weakening**.
- Rust: `crates/flight-tween/tests/timer_test.rs:76`.
- TS: `packages/tween/src/timer.test.ts:37`.
- TS asserts t1.target and t2.target are distinct as well as manager size 2. Rust discards both timer handles and checks active count only. D22 typed targets does not record removal of independence checks.

**F073 — Stagger target identity replaced by sample-value checks**

- Severity: **silent weakening**.
- Rust: `crates/flight-tween/tests/tween_stagger_test.rs:49`.
- TS: `packages/tween/src/tweenStagger.test.ts:19`.
- Source asserts each returned tween.target is the corresponding input Ref. Rust samples halfway and checks original targets x≈55/60 instead; it no longer directly verifies which target Ref each returned tween retains. D22 typed targets changes representation, but no target-identity-test exception was found.

**Numerical comparisons — silent weakening**

| Rust test | TypeScript test | TS digits | Rust limit(s) |
|---|---|---|---|
| `crates/flight-tween/tests/color_tween_test.rs:93` | `packages/tween/src/colorTween.test.ts:31` — interpolates components independently at the midpoint | 0 | 1 |
| `crates/flight-tween/tests/tween_manager_test.rs:38` | `packages/tween/src/tweenManager.test.ts:21` — defaults to easeOutExponential when no option provided | 2 | 0.01 |
| `crates/flight-tween/tests/tween_manager_test.rs:46` | `packages/tween/src/tweenManager.test.ts:28` — uses provided defaultEase for tweens that omit ease option | 2 | 0.01 |
| `crates/flight-tween/tests/tween_progress_test.rs:64` | `packages/tween/src/tweenProgress.test.ts:20` — returns 0.5 at the halfway point | 2 | 0.01 |
| `crates/flight-tween/tests/tween_progress_test.rs:267` | `packages/tween/src/tweenProgress.test.ts:84` — immediately applies property values at the given time | 2 | 0.01 |
| `crates/flight-tween/tests/tween_progress_test.rs:352` | `packages/tween/src/tweenProgress.test.ts:106` — accounts for delay in the elapsed time | 2 | 0.01 |
| `crates/flight-tween/tests/tween_progress_test.rs:519` | `packages/tween/src/tweenProgress.test.ts:156` — applies the progress fraction to target values | 2 | 0.01 |
| `crates/flight-tween/tests/tween_progress_test.rs:642` | `packages/tween/src/tweenProgress.test.ts:188` — is alias-safe: multiple sequential calls produce consistent results | 2 | 0.01 |
| `crates/flight-tween/tests/tween_stagger_test.rs:82` | `packages/tween/src/tweenStagger.test.ts:27` — staggers start delays by each interval (from: start default) | 2 | 0.01 |
| `crates/flight-tween/tests/tween_stagger_test.rs:111` | `packages/tween/src/tweenStagger.test.ts:38` — from: end reverses the stagger order | 2 | 0.01 |
| `crates/flight-tween/tests/tween_stagger_test.rs:139` | `packages/tween/src/tweenStagger.test.ts:47` — from: center staggers outward from the middle | 2 | 0.01 |
| `crates/flight-tween/tests/tween_stagger_test.rs:170` | `packages/tween/src/tweenStagger.test.ts:58` — from: numeric index staggers outward from that index | 2 | 0.01 |
| `crates/flight-tween/tests/tween_stagger_test.rs:199` | `packages/tween/src/tweenStagger.test.ts:68` — adds baseDelay from options to all stagger delays | 2 | 0.01 |
| `crates/flight-tween/tests/tween_stagger_test.rs:235` | `packages/tween/src/tweenStagger.test.ts:77` — actually animates targets with staggered timing | 2 | 0.01 |
| `crates/flight-tween/tests/tween_test.rs:941` | `packages/tween/src/tween.test.ts:285` — leaves the target value at its current position, does not jump to end | 2 | 0.01 |
| `crates/flight-tween/tests/tween_test.rs:1103` | `packages/tween/src/tween.test.ts:346` — leaves the target value at its current position, does not jump to end | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:176` | `packages/tween/src/updateTweens.test.ts:57` — takes the short path for a large positive delta | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:204` | `packages/tween/src/updateTweens.test.ts:66` — takes the short path for a large negative delta | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:232` | `packages/tween/src/updateTweens.test.ts:75` — finds the short path when starting from a non-zero angle | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:262` | `packages/tween/src/updateTweens.test.ts:87` — leaves small deltas unchanged | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:294` | `packages/tween/src/updateTweens.test.ts:97` — interpolates property toward target value | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:482` | `packages/tween/src/updateTweens.test.ts:160` — respects delay before starting | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:552` | `packages/tween/src/updateTweens.test.ts:183` — reverse: true animates from end value back to start | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:582` | `packages/tween/src/updateTweens.test.ts:194` — reflect reverses direction on each repeat, arriving back at start | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:827` | `packages/tween/src/updateTweens.test.ts:270` — resumes after pause | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:858` | `packages/tween/src/updateTweens.test.ts:281` — elapsed does not accumulate while paused | 2 | 0.01 |
| `crates/flight-tween/tests/update_tweens_test.rs:890` | `packages/tween/src/updateTweens.test.ts:293` — handles negative deltaTime without advancing | 2 | 0.01 |

### flight-velocity

No additional unruled assertion weakening, source-case omission, or unexplained expected-value change identified in this crate after the recorded exclusions.

### flight-xml

**F074 — Exact attribute maps reduced to selected key lookups**

- Severity: **silent weakening**.
- Rust: `crates/flight-xml/tests/xml_parse_test.rs:53,77,87`.
- TS: `packages/xml/src/xmlParse.test.ts:42,61,66`.
- TS compares the complete maps for out-of-range numeric references and two document-attribute cases. Rust checks the expected two/four/two keys but not map length/full equality; additional erroneous attributes pass.

## Verification limits

This is a static source-test audit of the stated snapshots. Findings establish weakened or changed oracles and missing probes; they are not runtime reproductions of every potential implementation defect. The unavailable Rust toolchain prevents confirming current failures or running proposed restorations. No implementations or tests were altered, and no host-side merge, push, or PR action was taken.
