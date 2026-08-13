# Testing Conventions

## File and structure rules

- One test file per source file, colocated in `src/`, named `*.test.ts`.
- `describe` blocks are alphabetized and mirror each file's exported function or object names.
- Test fixtures should use constructors and public helpers instead of object literals for SDK entity types unless the test is intentionally about structural compatibility with a `*Like` input.
- Vitest is configured with `globals: true`. `vi`, `describe`, `it`, and `expect` are available in test files without importing.
- Browser-facing packages (`render-canvas`, `render-webgl`, `render-dom`, etc.) use the `jsdom` test environment.

## Running tests

- Run `npm run test --workspace=packages/<name>` for a single package.
- While iterating, prefer the narrowest meaningful Vitest run: a touched test file, a package workspace, or a Vitest project filter. Broaden only after the local change is understood. Broad runs are confidence gates; focused tests are the normal editing loop. Do not use broad test runs as a substitute for reading the nearby source and tests.
- A test selector or name filter that runs nothing is unconfigured, not clean. Targeted `npm run test` invocations fail loudly when no test files match or when matched files execute zero tests; a green zero-work pass is the same inert-gate defect as zero-comparison parity or regression coverage. This is one instance of a general invariant — *a gate must fail when its required evidence is zero, and when its evidence has no referent* — stated with its other instances in [capture verification tiers](../capture-verification-tiers.md).
- **A whole-repo `npm run test` does not cover the `tool-*` family.** `vitest.config.ts` excludes it deliberately — `tool-*` sits outside the SDK barrel — so a green root run says nothing about those packages, however large its test count. Verify a `tool-*` change from inside its own package (`npm run test --workspace=packages/tool-capture`), and do not read a root pass as covering it. A `tool-capture` fixture defect once failed CI while the root run reported every test passing.

## Capability reachability

`npm run reachability:check` has two intentionally different strengths. Its hard, source-derived half fails when a real built-in effect runner has no matching per-kind registrar, when a registrar has no matching runner, or when a wrapper does not front its named runner. These are judgment-free capability invariants: an unmatched runner is stranded implementation, and an unmatched registrar is a false capability claim.

The same source walk also emits the registrar ownership inventory. It records a two-argument or state-plus-pair `register*` call whose kind resolves to a string literal or a unique exported string constant and whose implementation is an identifier. A registrar that receives the key from its caller is retained as a `mechanism` row, split between direct keys and loops over caller-supplied collections; these rows describe how ownership is supplied and are not ownership misses. Every exported registrar with no readable mapping or mechanism is retained as `UNCATALOGUED`. That status is evidence about the narrow recorder, never a claim that the registrar is not derivable. Unreadable rows distinguish unresolved identifier/member kinds, named-factory call results, inline arrow/object implementations, non-bare callees, caller-independent hidden loops/arrays, and registrations with no kind. The last bucket is reported but excluded from the recorder-miss denominator. The inventory is review evidence rather than a capability failure, and its complete rows are available from `npm run reachability:json` as `registrarOwnership`.

Export-lane placement is curated rather than inferred. The same command compares relevant runtime values and backend leaf defaults against `scripts/reachability-baseline.json`, but lane drift is informational and never fails the build. Review each `.`/`./contract` move as a tuning decision; when it is deliberate, run `npm run reachability:baseline` to update the whole-repo baseline. Do not turn current lane placement back into a hard rule.

## WebGL specifics

- `vitest-webgl-canvas-mock` mocks `'webgl'` and `'experimental-webgl'` contexts only, not `'webgl2'`. Tests in `render-webgl` that need a WebGL2 render state must mock `canvas.getContext` to return a fake `WebGL2RenderingContext`.

## Module mocks: which tier a test file runs in

The unit suite runs in **two tiers**, and the mocking rule differs between them because it is a rule
about the module *registry*, not about the `vi.mock` API.

- **Shared tier** (the default, `isolate: false`) — one module registry per worker rather than one
  environment per file. This is where the suite's speed comes from: per-file environment setup, not
  test logic, dominates its cost.
- **Isolated tier** (`isolate: true`) — every file that mocks a module, listed in
  `scripts/mockTiers.ts`. Each file gets its own registry from the platform.

**A top-level `vi.mock` is hoisted above the file's imports and registers against whichever registry
the file is running in.** That single fact produces both halves of the rule:

- **Forbidden in the shared tier.** The registration lands on the worker's shared registry, so it
  applies to every *later* file in that worker that imports the same module. The leak is silent and
  inverted: the mocking file passes, and some unrelated file fails — or worse, silently exercises a
  mock it never asked for.
- **Correct in the isolated tier.** The registry is per-file, so there is nothing to leak into. This
  is the sanctioned form there, and the reference pattern: `glEffectBoxBlur.test.ts`,
  `wgpuEffectTintShader.test.ts`, `canvasDropShadowEffect.test.ts` and their siblings.

Do not hand-roll isolation to get a mock into the shared tier. Calling `vi.resetModules()` and then
dynamically re-importing the subject inside `beforeAll` does work, but it rebuilds that subject's whole
transitive module graph on every run — unbounded work inside a fixed hook deadline, which is wrong on
any machine slow enough or any cache cold enough. That pattern produced a flake four agents chased
across two days, presenting as a setup failure with zero test failures on a different subset of files
each run. If a file needs a module mock, it belongs in the isolated tier.

**The tier boundary is machine-checked, not remembered.** `npm run mocks:check` (part of
`npm run check`) reads the same `scripts/mockTiers.ts` the config does and enforces it in both
directions: a file that mocks but is not tiered, a tiered file that no longer mocks, and a
`vi.doUnmock` naming a specifier the file never mocked. Add a file to the tier list when you add a mock
to it; the check will tell you if you forget, and will tell you when a file can be demoted.

**Prefer extracting the pure kernel over mocking at all.** A test that reaches for a module mock to capture a callback is usually telling you the unit bundles a pure function it has not exported. That was the actual defect in `canvasColorMatrixPass.ts`: the per-pixel matrix math was a closure inside the pass, and the mock existed only to get at it. Exporting `applyColorMatrixToImageDataBytes` made the math directly testable, and the pass itself is now verified with plain stub objects for the two canvas contexts — no module substitution, no order dependence, faster, and it gained multi-pixel coverage that the mock shape made awkward.

Mocking remains the right tool for genuine **interaction** assertions — which collaborator a dispatch routed to, and with what arguments — where there is no pure kernel to extract. When you do, put the file in the isolated tier and use a top-level `vi.mock`, per the tier rule above.

**`logOnce` keys are process-scoped, not test-scoped.** A `@flighthq/log`-based guard that warns once per reason suppresses that key for the rest of the process once it has fired — a second test asserting the same key's message will pass or fail purely on file/test order, not on its own behavior. Assert a given `logOnce` key's message in exactly one test: the one that first trips it. Hit twice already (a snapshot guard, then a glyph-atlas guard) — expect it again as more `enable*Guards` modules land.

## Out-parameter testing

- When changing an `out`-parameter function, test both a distinct output object and the aliased case where `out` is also an input.

## Verifying a fix by reverting or mutating it

- A revert-and-check or mutation-testing result is only trustworthy after confirming the mutation actually changed the file. The formatter runs between edits in this repo, so a scripted find-and-replace can silently become a no-op once prettier has reflowed the target expression across lines — the probe then reruns against unchanged code and a real fix reads as "not caught." Print or otherwise check a replacement count (or diff the file) before drawing any conclusion from the result.
- The negative-space twin of the rule above: a probe that reports **no defect** is only trustworthy after confirming it actually exercised the code. An argument-shape mistake (wrong position, wrong count) can silently turn a real probe into a no-op that returns early or does nothing observable — this looks identical to "no defect found." Prefer confirming by construction: assert the function did something observable, not merely that it did not throw. The practical trigger for suspicion: when one member of a structurally identical family of functions behaves differently from its siblings, suspect the harness before believing the result.
- A green test run is not a compile guarantee. `npm run test` does not typecheck, so a package can pass its full suite while failing to build (a missing type import, for example). Attestation requires `npm run check` — not `npm run test` alone.
- **An attestation names a command, so when the command is nondeterministic the attestation is a sample, not a result.** A selector that failed three of eight runs was reported green each time it passed — roughly a two-in-three result presented as a certainty, with every individual run honestly observed. That is what makes it dangerous: nobody lied and the artifact still overstates. Before treating a green as suspect, **ask which direction the nondeterminism can move the result.** A timeout can manufacture a spurious *failure* and cannot manufacture a spurious *pass*, so under a timeout the greens are sound observations and the reds are the artifacts — re-attesting `fail` there replaces a true claim with a false one. The instance was a worker-pool test under Vitest's default 5,000 ms; the fix is the explicit `WORKER_POOL_TEST_TIMEOUT_MS` in `conformance/swf/swf-import-conformance-worker-pool.test.ts`, not re-running until it agrees.
- **Read a zero only from a command whose other output proves it ran.** An instrument that reports only when it has something to say makes *measured, none* and *never executed* the same observation — silence — and a bare exit status cannot separate them. A command that also prints unrelated output can, because the surrounding output witnesses the run. Generalized: when building any instrument, ask whether it can fail to apply, and give it three outcomes from the start rather than two plus a later discovery.
- Trust a gate's own exit code and its own verdict, never a grep for one expected failure signature. `npm run check 2>&1 | grep -c "error TS"` only reads the typecheck stage; `check` also runs lint, format, order, exports, type-home, portable, api, and support, and a hand-written filter silently discards a real failure in any of those (`exports:check` failing plainly, thrown away by a pattern that was never looking for it). This is the same shape as the other rules on this list: a check written to answer the question you already expect the answer to.

## Review lenses

Named failure shapes worth checking for directly, distinct from each other:

- **Comment-vs-code**: a comment stating a behavioral contract is a claim to verify, not context to trust. Check it against the code it describes rather than assuming it still holds.
- **Stranded capability**: a capability implemented at one layer but unreachable from the layer above it — each layer alone reads complete, so isolated review misses the gap. Distinct from comment-vs-code (a wrong claim) and the probe-arity rule above (a wrong verification): this one is true code and honest comments with a missing path between them. Thread each capability end-to-end from the public surface down; don't audit layers in isolation.
- **A grep result is a lead, not a verdict, when contracts delegate across package boundaries.** A comment or symbol that looks wrong in the file you're reading may be correct one package away — `glMeshProgram.ts` claiming "throws on a compile or link failure" with no `throw` anywhere in the file looked like a false claim, and was actually correct: it delegates to `createGlProgram` in `render-gl`, which throws via `compileGlShader`/`linkGlProgram`. Follow the call chain before calling anything a defect; pattern-matching alone cannot close this out.
- **Set framing** — a correct entry can still mislead. When a gap, limitation, or TODO is filed into a list, readers take the list's status as the entry's status. A genuine gap filed among declared-not-roadmap items reads as a settled decision; a settled decision filed among open gaps reads as unfinished work. Check what the surrounding set claims, not only whether the row itself is accurate. When an entry's status differs from its neighbours', give it its own row, say why it is unlike them, and name the actual undecided call rather than leaving it implied. Confirmed instance: a DOM `BitmapText` ruling was made against exactly this misleading framing — the item was lumped in with declared-not-roadmap batch-renderer gaps, read as a decision because the set read as one, and was fixed by splitting it into its own row with its own stated reason.

## Assertions that cannot fail

Five shapes where the test and the code are each fine but the test still proves nothing. All are
invisible on a green run, and one of them — a fixture built from the same understanding as the code — is
invisible under mutation too. Each is named by its opening sentence; refer to them by name, never by
position, since an inserted shape silently rewrites what "the last one" means.

**A once-per-process observation is single-use — order the assertions inside ONE test.** `logOnce`
suppresses a key for the lifetime of the process, not the test. So the *second* test to touch a key
observes nothing regardless of what the code does: a "warns about X" test consumes the key, and a
separate "stays silent when X does not apply" test then passes even if the guard has stopped checking
anything at all. It is not enough to avoid duplicating the key across tests — assert both directions in
a single test, **silence first, while the key is still unconsumed**, then the warning. Anything that
reports once per process (deprecation notices, warmup warnings) has the same property.

**Verifying a guard's logic — or a policy default's condition — is not verifying that anything calls
it.** A guard installed through a seam, and a policy default like `isVerifiedCaptureTool(subject)`, have
the same shape: a check, and the call site(s) that are supposed to invoke it rather than reimplement it
inline. A test that reaches in and calls the guard or predicate directly — `runtime.someGuard!(state,
value)`, or `isVerifiedCaptureTool('examples') === true` — exercises the check thoroughly and says
nothing about the seam. Delete the call site, or let one of several call sites reimplement the same
condition inline instead of calling the predicate, and every such test still passes; the feature is dead,
or silently bypassed at exactly the call site that mattered, and fully covered regardless. This is not
hypothetical: `captureSuite.ts` once hardcoded its own verify-on condition instead of calling
`isVerifiedCaptureTool`, and the test asserting the predicate's return value stayed green while the leg
it was supposed to gate verified nothing. Drive at least one test through the real entry point instead,
in the state that should trigger it, so the wiring is asserted and not assumed. The tell is that a test
never calls the public function the guard or default exists to protect — or that more than one call site
is free to reimplement the same condition inline. A default that call sites can bypass is not a default.

**In a variable-length encoding, a fixture VALUE can absorb the error the test exists to catch.** The
others here are about the shape of a fixture or an assertion; this one is about a number.
In a fixed-width format a desync propagates and any downstream assertion catches it. In a varint or
LEB128-style encoding, a value whose bytes all set the continuation bit is **self-synchronising**: injected
bytes are swallowed by the next length-prefixed read and the stream recovers on its own. That is worse than
a symmetric fixture — a diagonal matrix at least looks degenerate, whereas nothing about `0xffffffff` looks
suspicious, and it is the obvious value to reach for as padding or a placeholder colour.

Measured: a Spine `.skel` test wrote an editor colour of `0xffffffff` in five unmodeled attachment records
and asserted a known attachment on the far side, so a wrong skip width would show as garbage. Deleting one
record's four-byte skip **left the test green** — the reader, now four bytes behind, read the next varint,
whose continuation bits consumed all four stray `0xff` bytes before terminating on the byte after them. The
stream resynchronised by luck; every attachment still parsed. Changing the constant to `0x01020304` — bytes
below `0x80`, so a varint terminates immediately — made the same deletion fail, along with two sibling
skips that had also been passing.

So: **binary fixtures use values whose encoding terminates promptly**, and the reason is recorded beside the
constant, because the next person to touch it will otherwise read it as arbitrary. `0x01020304` over
`0xffffffff`, `0x7f`-and-below over `0xff` fills.

**And that fix is necessary, not sufficient.** The reason is one level up from the value: with only a known
attachment asserted on the far side, **a per-record claim was resting on a whole-stream oracle**, and such an
oracle sees a record's desync only when the error propagates all the way to the end — which is a property of
the bytes that happen to follow, not of the code under test. Fixing the value made the luck better; it could
not make it unnecessary. Measured per line against the per-record isolation test that replaced it: of the
**18 reader-advancing statements** in the unmodeled-attachment block, deleting any one is **killed in 17
cases**. The 18th — the `linkedmesh` unconditional colour skip — is **UNRESOLVED**: four payloads
(`0x01020304`, `0xffffffff`, `0x80808080`, `0x01000000` — all-low, all-high, all-continuation, and
low-then-zero) show no observable difference, no structural reason for that independence has been found, and
**equivalence is neither established nor refuted.** Failing to find the structure that would *prove*
equivalence is not the same as finding an input that *disproves* it, and disproving it needs exactly one
input where behaviour differs, which nobody has.

**Do not re-run a per-type sweep to check this number** — and the reason matters more than the instruction.
The earlier *"3 of 5 record types"* figure was **superseded, not erroneous**: every one of its five mutations
applied, each verdict was what the whole-stream oracle then gave, and re-measured after the isolation test
landed exactly one flipped (`point`, which the old oracle missed and the new one kills). **What was wrong was
the denominator — a record type is not a mutation.** A record holds several reader-advancing statements with
different verdicts: on the pre-isolation tree, deleting `point`'s 12-byte rotation/x/y skip was killed while
deleting `point`'s colour skip was not. So *"one skip per type"* names no definite mutant, and two per-type
sweeps that happen to pick different lines disagree without either being wrong. **Per line, the question has
one answer; per type, it has no determinate one.**

**When two explanations of one behaviour are refuted inside an hour, stop explaining and start recording.**
Both accounts offered for the 18th site failed — the second by its own prediction, which said `0x01000000`
would discriminate and it did not. Reaching for a third guess is how a document acquires a tidy mechanism
that has to be corrected again; **this paragraph has already been wrong twice, each time by overclaiming in
the opposite direction.** An admitted unknown invites the measurement that settles it; a wrong mechanism ends
the search.

⇒ **A per-item claim needs a per-item oracle.** Where a fixture walks N records and the comment says each
one stays in step, assert the reader offset after each record rather than checking a single value at the
end. Reach for prompt-terminating values *and* a per-record assertion: the first stops the fixture from
absorbing the error, the second stops the oracle from absorbing it.

**A fixture built from the same understanding as the code cannot falsify that understanding.** The others
here are defects in a test. This one is a defect in the *input*, and it is the only one mutation
cannot find: mutation asks whether the test notices the code changing, and here the test and the code agree
with each other while both disagree with reality. Exhaustiveness does not help either — more inputs derived
from the same belief are more of the same belief.

Measured, and the tell was a comment rather than a failure: `parseSpineSkeletonBinary` reported
`spine.binary-tail-unparsed` on *every* successful parse, with `bytes: 0`. Three tests asserted that as
correct. The cause is that `buildSpineBinary()` ends exactly where the parser stops reading, so a fixture
authored alongside the parser could only ever report a remainder of zero — `bytes: 0` was an artifact of the
fixture being built to the parser's reach, not evidence of a complete parse. No amount of hand-built input
could have shown otherwise, because every such input inherits the same stopping point.

So: **for any format, protocol, or wire contract, at least one input must come from a foreign producer** — a
real file, another implementation's output, a published vector. Ask *who authored this input, and did they
get their understanding from the same place the code did?* The two directions are complementary and neither
substitutes for the other: a corpus tells you what real files actually contain, and hand-built input reaches
the branches no artist happened to author. A corpus is authority on whether real files parse, never on
whether the format is handled — a branch it never reaches is not thereby fine.

**A captured or golden fixture keeps every field verbatim — except one whose meaning is POSITIONAL.** A
numeric enum ordinal, an array index into a reorderable list, a bitfield position: name those, and keep
the rest of the captured shape as observed. Capturing real emitted data is right, so the two rules are in
tension; the resolution is **keep the captured shape, name the semantic value**. A serialized ordinal
means whatever the enum said at capture time, and nothing marks it when the enum grows.
`captureRegistryMiss.test.ts` hardcoded `registry: 2` for `RenderRegistry.NodeRenderer`; members are kept
alphabetized, so inserting `BlendRealization`, `MaterialTextureLister` and `ModifierSnippet` above it moved
`NodeRenderer` to 5 and made 2 mean `MaterialRenderer` — turning "a node-renderer miss is ignored" into
"a material-renderer miss is ignored", the opposite of what the gate exists to assert, with nobody editing
the file. The rule already existed on the enum itself, aimed at emitters; a fixture is a call site too.

## What belongs in a unit test vs. elsewhere

- Put unit behavior in a colocated `*.test.ts` in the package that owns it, where `exports:check` binds it to an exported function and a developer changing that code will see it. A compiler-enforced property (e.g. the `Node<Traits>` invariance law) belongs in a colocated test too, asserted with `// @ts-expect-error` — `tsc -b` typechecks `src/*.test.ts`, so the failing-compile case is the assertion.
- There are no standing "API" or "integration" test categories. Cross-package wiring, the SDK barrel, and public import paths are already exercised far more thoroughly by the functional/example/reference visual suites — every scene builds and renders through `@flighthq/sdk` — and by `npm run packages:check` / `npm run api`, which police export shape directly. A barrel smoke test is a strictly weaker version of work CI already does on every PR.
- Reserve a root-level integration test only for a headless, logic-only flow that spans packages and produces no visual output (loader orchestration, resource lifecycle, serialization round-trips) — something the visual suites genuinely cannot reach. Do not recreate a generic api/integration bucket; if a test only proves "the surface compiles" or restates a single package's unit behavior, delete it.
