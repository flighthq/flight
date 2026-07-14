# Quality & Coverage Plan

## 1. New Example Set

The 17 existing examples are OpenFL ports — they prove the Flash API equivalent works but do not exercise Flight's differentiating surface. The originals now live in `flight-reference` for side-by-side comparison. The examples in this repo should be wiped and replaced with a brand-new set designed specifically for Flight.

New examples should:
- Exercise features no current example touches: 3D scenes with PBR materials, particle systems, path boolean operations, collision + spatial indexing, spring animation, flow-state game loops, format loading (Tiled tilemap, spritesheet, glTF), text input, platform APIs.
- Serve as both documentation and smoke tests — each example should illustrate a clear capability and be runnable as a functional verification.
- Use current Flight API conventions (explicit registration, out-parameters, no hidden runtime behavior).

The OpenFL-port examples are not deleted from existence — they remain in `flight-reference` — but they should not occupy this repo's example surface.

## 2. Unit Test Depth Review

Current state: 10,984 tests across 1,041 files, 99% export coverage. Every exported function has _a_ test. But coverage depth varies: some packages have thorough edge-case testing (geometry, effects), while others have minimal happy-path-only tests (application, text, sprite, log, textinput).

A dispatched workflow should review unit tests across all packages for adequate depth. The standard is **bedrock, not blood-from-stone**: every exported function should have meaningful tests that exercise its real behavior (parameter variations, boundary conditions, out-parameter aliasing, sentinel returns), but splitting something already well-tested into finer cases for the sake of count is waste. The review should flag:
- Functions with only a "does it exist" or single-happy-path test.
- Missing edge-case coverage for functions that accept ranges, optional parameters, or produce sentinel values.
- Missing aliasing tests for out-parameter functions (where `out` is also an input).
- Missing error/sentinel path tests for functions that return `null`, `-1`, or `false` on failure.

The output should be a prioritized list per package: which functions need deeper tests, ranked by API importance.

**Status: completed.** Results in [test-depth-review.md](test-depth-review.md). 52 solid / 21 adequate / 1 thin / 0 stub across 78 packages. 10 high-priority gaps identified, concentrated in bezier bounds, bidi Unicode, path containment, asset ref-counting, and snapshot semantics.

## 3. Unit Tests vs Functional Tests

Unit tests are much cheaper to execute and validate — they run in jsdom in seconds, require no browser, and can be parallelized across all packages. They are the primary verification layer and should cover the vast majority of API behavior.

However, some features inherently require visual or browser-environment testing to confirm correctness:
- Rendering output (does the bitmap actually appear, does the blend mode look right, does the effect produce the expected visual).
- Cross-backend parity (does Canvas match WebGL match WebGPU for the same scene).
- Text rendering and layout (glyph positioning, line breaking, font metrics are environment-dependent).
- Input event handling (pointer, keyboard, gamepad interactions in a real DOM).
- Video/audio playback (media API behavior).
- Platform APIs that depend on browser features (clipboard, fullscreen, permissions).

The functional test suite (132 tests with parity/regression/smoke tiers) handles these cases but is currently concentrated on effects and materials. Expanding functional coverage should target the visual and interactive features above, not duplicate what unit tests already verify.

**Rule of thumb:** if a function's correctness can be determined by inspecting its return value or out-parameter, it is a unit test. If correctness requires rendering to a surface and comparing pixels, or observing behavior in a live DOM, it is a functional test.
