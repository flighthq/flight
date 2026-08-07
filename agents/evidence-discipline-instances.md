# Evidence discipline — the worked instances

Companion to [evidence discipline](evidence-discipline.md), which carries the laws and one elevated
instance each. **This file holds the instances the parent's 12,000-character budget could not.** It
has no budget of its own: instances accumulate, laws do not.

**Organised by the law each instance serves**, because an instance filed under no law is an anecdote.
Each is marked:

- **filed** — it demonstrates the law it sits under.
- **orphan-and-flagged** — real, reproducible, and **not** an instance of any law here. Kept
  deliberately: **an orphan is where the next law comes from, and discarding it to keep the taxonomy
  tidy is how a rule set stops learning.**
- **never forced** — nothing below was reassigned to a law it did not fit in order to file it. Where
  an instance nearly fits, the near-miss is stated rather than smoothed over.

*All instances are arc-local, from the SWF-import/conformance arc of 2026-08-07, and untested on any
other work.*


## Claim markers — what kind of claim, not how much the author liked it

**Emphasis is a claim, and a uniform emphasis is a misaddressed one.** These mark the KIND, so a
reader can tell strength apart without trusting the author's formatting:

- **[MEASURED]** — the author ran it and read the output. Name what was run.
- **[INFERENCE]** — reasoned from what the author holds. **Not falsifiable by anything scheduled.**
- **[PREDICTION, falsifier: X]** — falsifiable by something **scheduled**, named up front. ⇒ **Distinct
  from inference, and the distinction is what makes a later result mean anything**: a prediction
  stated after the fact is unfalsifiable in practice, because the repair and the explanation arrive
  together.
- **[RELAYED-VERIFIED]** — carried from another author **and checked by the relayer**, who says how.
- **[RELAYED-UNCHECKED]** — carried faithfully and **not** independently checked. ★ **This is the
  normal, correct state for most relays, which is exactly why it needs a name rather than a silence** —
  unnamed, it reads as verified, and two failures came of that: a stale figure propagated through a
  relay, and a finding that detached from its author and read as the relayer's.
- **[UNVERIFIED]** — the author's own claim that nothing has yet checked.

**A relay is not weaker for being unchecked; it is weaker for not saying so.**

## Serving: evidence is about whatever produced it

- **filed — A cast ASSERTS a shape; only a check ESTABLISHES one — and the value came from a file.** A
  stamp reader validated a tag, a variant, and that a field was an array, **and never the array's
  contents.** ⇒ **A stamp written by an older build parses cleanly and returns typed, with a required
  field UNDEFINED at runtime while the declared type promises a number.** ★ **The population is every
  previously-extracted tree on every developer and CI machine — unbounded, and unreachable by any grep
  of this repository.** Found by asking *what would not match and still count*, after a grep of data
  files and fixtures came back clean. **The remedy reused the sentinel the function already had: a
  stamp the reader cannot vouch for is treated as NO stamp, so a caller re-fetches rather than
  planning on a silent gap.**

- **filed — The repo you can reach is not the repo the claim is about.** Say it in those words; **the
  sophisticated version saved nobody.** Five readers stated true, exact, checkable numbers about trees
  that were not the one under discussion, **several while actively hunting that exact failure.**

- **filed — Evidence that X exists is not evidence that only X exists.** A parcel format was assumed
  squash-only because a `squashed.diff` was visible; it also carried ten per-commit patches with full
  SHAs, and a whole remedy was nearly abandoned on the strength of the thing that *was* seen. **Seeing
  one member of a set tells you nothing about its other members.**
- **filed — Announcing a change is not shipping it, and the announcement travels faster.** A note
  saying "I am landing this in the doc" went out in a parcel whose commits did not contain it; the
  wording was present-tense, the work was real, and it landed two commits later — so every reader held
  a true-sounding claim about a file none of them had. **It surfaced only because a reader opened the
  file and grepped for the words.** The author was the person who wrote this rule.
- **filed — An importer that returns a document reports success by being non-null.**
  `createScene2DFromSwf` returned a document while having silently dropped content. This is why
  `importdiagnostics` exists: it is the independent reader for the importer, not a feature beside it.
- **filed — A generator that diffs against itself has no independent reader.** Regenerating in memory
  and comparing to the committed file verifies that the file matches what the generator would produce,
  and nothing about whether what it produces is true. **Six proof records naming tests that never
  exercised the capability they were cited for passed this gate.**
- **filed — A proof identifier certifies that the producer asserted something, not that the assertion
  was right.** Checking that a proof name resolves is checking resolvability; checking that the named
  test exercises the named capability is checking validity.
- **filed — A count of your own verification work is a self-report.** Three separate counts were
  audited and all three were smaller than claimed.
- **filed — An audit certifies a population at a moment, and anything added afterwards — including the
  fix the audit produced — is outside it.** A count and its audit drift apart by default, and the
  drift hides because **both numbers are still true of something, just not of each other.**

## Serving: the wrong answer is a true answer to the question you did not ask

- **filed — Emphasis is a claim, and a uniform emphasis is a misaddressed one.** Reports marked
  measured results, untested hypotheses and restatements of other people's work **with the same
  emphasis throughout.** ⇒ **The marking answers "did the author think this mattered" while being read
  as "how strong is this"** — and a reader has nothing in the report to separate them. **The check is
  one question, asked of the artifact rather than of its contents: do the strong and the weak results
  in this report LOOK different?** If they do not, the formatting is flattening exactly the
  distinction the content depends on.

- **filed — Attribution error is asymmetric by construction, so it runs one way every time.** **The
  under-credited party notices; the over-credited one does not.** ⇒ **Errors drift toward whoever
  holds the pen, and only one direction ever generates a complaint** — which means the absence of
  complaints is not evidence that credit is being kept straight. ★ **Remedy, and it is the arc's own
  attach-do-not-describe rule pointed at credit: a finding travels with its author as a COMMIT and
  detaches from its author as PROSE.** Relaying a finding in your own words is the mechanism, not the
  accident.

- **filed — Equal confidence across unequal epistemic status is ITSELF a misaddressed answer.** Three
  sweeps were reported in one voice: one vocabulary was **grammar-derived** and could state a ceiling;
  two were **semantic**, their author having chosen which shapes counted. ⇒ **A uniform confidence
  answers "did each sweep run cleanly" while being read as "is each result equally strong"** — and the
  reader has nothing in the report to tell them apart. **Reporting style is a claim**, and a flat one
  over an uneven set is a true answer to the narrower question.

Seven, all from one day, all real, **all correct work.** Each names the question the answer was true
of, and the question that was actually asked.

- **filed — the compiler, and the cheapest demonstration of the law.** `tsc` offered *"Did you mean
  `file`?"* for a missing `files`. **True answer to:** which declared name is nearest? **Wrong answer
  to:** which field holds the corpus count? — that is `verifiedFixtureFiles`; `file` is the archive
  name, a string. **The tool answered its own question perfectly.**
- **filed — the net-zero diff.** An agent installed a peer's exact bytes, verified, then removed them:
  net zero **in their tree.** **True answer to:** what did I add to my base? **Wrong answer to:** what
  will this do to a tree that already holds that peer's work? — applied, it deleted 389 lines and 12
  exported symbols from the schema owner. **Their description of their own parcel was accurate.**
- **filed, relayed rather than verified here — two clean clones.** Two workspaces were sampled and the
  sync fault called localised. **True answer to:** are these two clones clean? **Wrong answer to:** is
  the fleet affected? — **and those two were the least able to exhibit a fault that needs a working
  tree held across a sync.** Another agent had it twice.
- **filed — the stamped figure.** *240/13/5* against *415/19/7* for one helper, both true, of
  different commits. **True answer to:** what does this file say at the tree I hold? **Wrong answer
  to:** what does it say? — **a question with no answer until a tree is named.**
- **filed — `seed..base`.** A net-deletion detector treated any file created after the seed as the
  sender's own iteration. **True when written; wrong once two agents write one post-seed file** —
  which is exactly how the net-zero diff walked past it.
- **filed — already up to date.** A rebase named a ref a clone could not reach, and the tool answered
  *already up to date*. **True answer to:** is there anything here to rebase onto? **Wrong answer
  to:** is this work rebased onto the landed tip?
- **filed — the ledger gate baseline, and the one that is still live.** The append-only check compares
  against `origin/develop`. **True answer to:** has anything *unlanded* mutated a guarded line?
  **Wrong answer to:** has a guarded line been mutated? — **because once the mutation lands, the
  baseline absorbs it and the gate goes permanently quiet.** A charter `Decisions` line is in that
  state in the delivered base right now: removed rather than superseded, **and the gate will never
  report it again.**

- **filed — an eighth, found after the law was written, which is the first evidence it generalises.**
  A detector's resolution signal was "does `reportImportDiagnostic` appear", carried to a codebase
  that **consumes** diagnostics rather than emitting them and whose idiom is `problems.push`. It
  printed **5 of 5 sentinels report nothing.** **True answer to:** does the emitting call appear here?
  **Wrong answer to:** are these resolved? ⇒ **Carrying a detector to new material changes what its
  signals MEAN, not only what it can see** — a distinct axis from reach, and the author refused to
  report the number as a finding rather than hand a peer an alarming figure that meant nothing.

- **filed — a ninth, and the author applied the law to their OWN figure within the hour.** A reach
  ratio read *158 of 393 nullish constructs, 40%* against *38 of 77, 49%*, concluding the detector's
  reach transferred. **Restated: the question asked was what fraction of potential silent-drop sites
  the sweep reaches; the question the ratio answered was matches over nullish tokens.** ⇒ **The
  numerator drew from outside the denominator** — two of nine forms match constructs containing no
  nullish token at all, a swallowed `catch` among them. **Every digit was true, and it verified as
  true every time it was looked at.**
  ★ **And the obvious repair was also wrong, which is the part worth keeping:** adding every logical-or
  to the denominator gives 29% and 15% and **inverts the conclusion**, but most logical-ors are
  boolean conditions rather than defaults, so that denominator errs the other way. ⇒ **There was no
  well-defined denominator for "potential silent-drop site", and saying so was the honest end of the
  measurement rather than picking whichever fraction read better.**
  ★★ **THE REPLACEMENT WAS DENOMINATOR-FREE: per form, does it fire on the new corpus at all — seven
  of nine do, and the two that do not fire on NEITHER corpus, so those constructs are absent from both
  rather than the detector being blind on one.** ⇒ **When you cannot define a denominator, replace the
  ratio with a measure that does not need one — not with a better-looking fraction.** **The conclusion
  survived and its reason did not**, which is the outcome to prefer over a rescued number.

- **filed — Two instruments by one author can disagree on the same heuristic, invisibly.** A
  swallowed-catch form reported seven candidates; four were `catch` blocks that **record via
  assignment** — `catch { threw = true }` — which is the outcome being captured. **One of the
  author's sweeps already treated assignment as recording and the other did not.** Fixed the detector
  rather than reporting the raw count: **seven became three, a 57% false-positive rate on that form.**
  ⇒ **A suite of instruments has cross-instrument consistency as a property nobody checks**, and it
  surfaces only when one of them is carried somewhere new.

- **filed — Do not move a sweep's default scope to point it somewhere new.** An override plus a copy
  outside the repo kept every previously reported figure reproducible; **a sweep whose default scope
  moves silently makes every number it has ever reported unverifiable**, and the old numbers do not
  announce that they have become unreproducible.

## Serving: preservation ordering

- **filed — Inspect before `drop_caches`; capture before restore.** The mechanical form of the rule,
  kept because it is the case where the ordering is obvious and therefore the one to reason from.

- **filed — Report an instrument's weakness before you fix it.** A fix is a state change and a finding
  is a fact about the prior state, so **the fix destroys what the finding is about.** A repo where
  every instrument was silently improved on discovery would look, from its history, **like a repo
  whose instruments were always sound.**

- **filed — A priority set on a wrong diagnosis is harder to undo than a claim, because work has
  already started against it.** A wrong statement is retracted in a sentence; **a wrong statement that
  became someone's task has consumed their effort before the retraction arrives**, and the retraction
  then competes with sunk work rather than replacing an idea. One flake was called urgent on a wrong
  failure-direction and had to be reversed after the assignment went out. ⇒ **Dispatching is the
  destructive operation in the ordering, so verify a diagnosis before it becomes a priority, not
  before it becomes a sentence.**

- **filed — An unread red is not necessarily an UNREADABLE one, and "gone" is a different state from
  "unread."** A rate argument was doing work that two lines of surviving output could settle
  outright. ⇒ **Where the artifact survives or the run is cheaply reproducible, close the gap by
  READING rather than by inferring** — a probability argument makes a conclusion plausible where a
  message makes it certain, and reaching for the argument first is a choice nobody usually notices
  making. **Measured after applying it: sixteen runs, three failures, every one read, all three
  timeouts.**

- **filed — Independence beats volume: two trees agreeing is worth more than twice the runs in one.**
  A second agent re-sampled in **a different clone at a different commit** rather than adding runs to
  the first, **because a tree-local cause would have to be present in both to survive.** ⇒ **More
  samples under one condition reduce noise; samples under a second condition remove a class of
  explanation** — and only the second kind changes what the evidence can rule out. Combined across the
  two trees: **24 runs, 5 failures, every failure message read, all 5 timeouts, 0 assertion failures.**
  **Two reds from an earlier unread batch are excluded rather than counted, because "gone" is not
  "unread" and neither is it a data point.**

- **filed — State a prediction BEFORE the fix lands, or it is unfalsifiable in practice.** When the
  repair and the explanation arrive together, **nobody can tell which produced the green.** Putting
  *expected failures = 0 in N runs* on the record first **converts someone's repair into a test of
  your hypothesis**, and makes any survivor immediately interesting instead of merely confusing.

## Serving: structure over convention

- **filed — SPLIT rather than MARK: commit only the half that can run.** An instrument was to be
  committed without its corpus and **marked `untested-until-the-pack-arrives`**, because it could not
  execute. The author instead **committed only the pure comparison logic — which runs today, with
  tests and both mutation rungs — and did not commit the corpus-walking half at all.** ⇒ **The
  wire-nobody-has-seen-fire case is ELIMINATED rather than labelled: there is no unrun code to
  mislabel, and nothing to mistake for coverage.** ★ **A caution avoided by construction beats a
  caution recorded** — which is this section's own law turned back on a caution written under it.

- **filed — SKIPPED is not AGREED, and CONTAINED is not EQUAL.** Two comparison oracles refused to
  fold weaker outcomes into their pass count: composites are reported **skipped** rather than agreeing,
  **because folding them in would inflate the figure with glyphs nothing checked**; and a bounds check
  reports **contained** separately as a weak pass, **because containment cannot separate a loose
  declared box from a glyph the reader failed to draw.** ⇒ **An instrument that collapses its outcome
  vocabulary inflates its own result, and the collapse is invisible in the number it prints.**

- **filed — Keep the semantic decision out of the measurement; let the consumer group.** A scratch
  tool reported a curated eleven tag codes; the promoted version prints **every** code. ⇒ **Choosing
  which members to report puts a judgement inside an instrument, where it is invisible to everyone
  reading its output** — and the grouping the curator had in mind is a view the reader can build
  afterwards, while the members they dropped are gone.
  ★★ **REFINEMENT, and it is the harder half: "the reader can group afterwards" presupposes the
  MEASUREMENT SURVIVED.** A bounds oracle returned *contained / exact / exceeds* — **a total
  partition, so nothing was curated — and threw away the magnitudes.** ⇒ **Grouping afterwards cannot
  reconstruct a number that was never returned**, so a classifier can be lossy without being
  selective. **A 1-unit overshoot and a 900-unit overshoot classify identically, and only the
  measurement separates a rounding slip from a decode fault.** Split into a function that returns
  signed per-edge deltas and one that classifies deltas somebody else measured. ⇒ **Return the
  measurement; let the verdict be a function of it.**

- **filed — Promote the MEASUREMENT half, never the checker with its expectations baked in.** The
  scratch file nearest the documentation **held the doc's own figures as a typed comparison table.**
  ⇒ **Committing it would have installed the exact stale-number defect the cell had spent the night
  removing: a checker whose expectations are constants nothing recomputes.** **A scratch instrument is
  usually a measurement fused to an assertion, and only the measurement half should survive
  promotion.**

- **filed — A repair can create the obligation it appears to discharge.** Replacing a route that named
  an uncommitted tool with an inline procedure closed the false claim — **and the new text ended by
  naming a command that did not yet exist.** ⇒ **Fixing a false claim by writing a second one is a net
  loss**, so the tool had to land before the document could be called true. **The small-fix-first
  ordering still paid: the original claim was dead even if everything after it had failed.**

- **filed — A self-criticism that stays a confession is the transient-corrected/durable-stale shape
  again.** Two sweeps were reported as having weaker epistemic status than a third — **said in a
  message, while the scripts kept printing confident ceilings.** ⇒ **Acting on a self-criticism means
  changing the artifact, not repeating the criticism**, so the limitation went into the script headers
  where a reader of the output meets it, **rather than in a thread they will never see.** The sweep
  whose ceiling genuinely held was left unchanged — **grading is not blanket apology.**

- **filed — A ruling that lands only in a thread is a conditional forever.** A count was recorded as
  *four IF a CI gate counts as an artifact*, correctly deferring a call that was not the author's.
  When the call was made, **they settled the conditional in the durable file and carried the REASONING
  rather than only the answer** — because an answer alone does not survive being questioned again.

- **filed — A set you cannot enumerate can still be BOUNDED, if each member declares itself.** Four
  history-dependent sites needed four different remedies, so no per-artifact fix generalised and no
  list could ever be complete — **yet a declaration of *what this site does when history changes* came
  out differing in content and IDENTICAL IN FORM at all four.** ⇒ **You cannot list the dependants,
  and you do not need to: the question becomes "which declarations does this strategy violate",
  answerable from data rather than from recall.** ★ **That is the third rung** — met at the moment of
  the decision instead of relying on someone remembering a constraint.
  **Residue, named rather than smoothed:** one site's unstable step is **a human reading stdout**, and
  **a human cannot declare in code.** ⇒ **This bounds the code-visible dependants and leaves the human
  ones open — an improvement, not a closure.**

- **filed — A constraint on how a human operates a tool is encountered nowhere near the decision it
  governs.** A hazard was first framed as a choice — *this merge strategy invalidates the record, that
  one does not.* ⇒ **But choosing the safe one today does not bind the next merge; it installs a
  permanent remember-this**, which is the third axis exactly: durable, reachable, and met at the wrong
  moment. ⇒ **So the question is not which option to choose, but whether to keep depending on the
  choice at all** — and reframing it that way turned a standing warning into a removable dependency.
  **The near-term fact survived the reframing; only the framing was withdrawn.**

- **filed — A historical check pinned to CONTENT survives history rewriting; pinned to a COMMIT it
  does not.** An audit identity stored `auditedAt` and a `subjectHash`, both derived by searching git
  history — **and history is precisely the baseline that landing rewrites.** It survived two rebases
  across 161 peer commits **byte-identical**, because the hash is a git **tree OID**: content-addressed,
  so rewriting commits does not move it. **Pinning a commit SHA would have restamped every audit on
  every rebase.** ⇒ The author chose the tree OID to stop unrelated source edits restamping things and
  **says plainly that its surviving history rewriting is luck rather than foresight** — which is worth
  more than a claim the design anticipated it.
  ★ **The untested case, stated as a prediction before the fact: a SQUASH MERGE.** The history search
  would resolve to the squashed commit, whose tree is the **final** state rather than the state at the
  audit, **so every identity would silently take post-merge values and collapse to one timestamp and
  one tree OID.** Untestable from inside the clone, so it is **predicted, not diagnosed.**
  ★★ **And the tell was recorded in the GENERATOR rather than in a message** — *a reader who finds
  every identity sharing one timestamp and one tree OID is looking at this failure, not at fourteen
  audits that happened at once.* ⇒ **A caution in a parcel dies with the parcel; the generator is what
  a successor opens.** Not registered as a landed defect: **nothing is wrong yet, and the condition
  that would break it has not occurred** — it is a stated limit on an instrument, not a defect.

- **filed — Attach the audit to the member, not to the count.** With each capability carrying which
  audits reached it, **the totals are derived and can never outrun their audit** — a bare `17/17/17`
  stops being discouraged and becomes **unrepresentable.** ⇒ **The general move: find the
  representation in which the false claim cannot be written down.** And note what it is structurally:
  **an aggregate that discarded which-members, repaired by carrying the members** — the same shape as
  replacing a contested ratio with a per-member measure.

- **filed — Choose a channel without the hazard instead of remembering to avoid it.** Prose through
  `-m`, anything carrying an identifier through `--file`: shell substitution then cannot occur, rather
  than being something each author must remember not to trigger.
- **filed — Name the tree in the assignment, not in the report.** An order that will produce a
  coverage claim should already say which version it covers. **An exhaustive read of a file under
  active edit is stale before it lands, which is a property of the schedule and not of the reader** —
  three readers lost a day's claims to this, and the countermeasure cannot be more care.
- **filed — Put a coverage caveat in a table, not a sentence.** A sentence can be skimmed past; a
  table of which files were read in full, partially, and not at all cannot.
- **filed, and a LAW-CANDIDATE — a safe default and a measured negative are the same value, so the
  third state must be encoded rather than interpreted.** A mechanism that speaks only when something
  is wrong makes *nothing is wrong* and *the mechanism did not run* produce an identical observation.
  On the floor question this is exact: `agent.sh` prints a behindness footer only when behind, **so
  "0 commits behind" and "the command never executed" are both a silent footer.** The reading is
  rescued by taking it from a command that also produced other output — `wake` prints a whole packet,
  **so the silence becomes a measurement rather than a hole.** ⇒ **Read a zero from a command whose
  other output proves it ran; a bare exit status will not do it.**
  **Promotion note:** this recurred across capability rows, silent drops, the numbers gate, and the
  floor — **four distinct surfaces, which is what a law looks like.** It sits here rather than in the
  parent only because the parent has no headroom, and it is recorded as owed a place in the next pass
  rather than left to be rediscovered. **The parent is where it belongs.**

- **filed — The three axes worked, each with its instance. LIFETIME:** a structure must outlive the
  hazard it guards — a transport role and a one-writer tripwire lived in a workspace file that dies
  with the session, and **a probe script in a scratchpad is a caution with extra steps.**
  **REACH:** it must be reachable by the agent it was written for — **a doc linked only from an index
  is met at the moment of curiosity, not at the moment of the decision.**
  **ENCOUNTER:** it must be met *before* the mistake — **a budget living in the file it governs is
  read by everyone already writing into it and by nobody deciding whether to**, which is why that
  budget sat 1.85× over while declared, durable and read. ⇒ **Only a gate fires at the moment of the
  action.** A fourth observation, from the gate that resulted: **the author of a rule is not exempt
  from its encounter problem** — the same budget gate fired on its own author three times, who
  responded by trimming words each time although the message named the structural remedy.

- **filed — A register is a caution, not a structure.** A process lapse was recorded, dated, and read,
  and **recurred about an hour later** — because recording a lapse prevents none. The remedy was a
  rule that made the shape unrepresentable: a message with more than one recipient may not contain
  second-person instruction. **A register names; only a structure prevents.**
- **filed — An order states its own preconditions, so the recipient can falsify it in one line.** A
  task reached the wrong builder, who rejected it by checking four preconditions: the gate did not
  exist in their tree, the sweep was not theirs, the praised comment was in no file they authored, the
  named cell was not theirs. **The sender cannot see that an instruction is false about its recipient,
  so only the recipient can** — which recovers exactly the errors the sender is blind to by
  construction. **Its time-axis twin: an order sent to a busy agent must state preempt-or-queue**,
  because the sender knows the priority and the recipient knows the state, and leaving it unstated
  does not defer to the recipient's judgement, it blocks them.

## Serving: honest limit

- **filed — An observation of someone else's corpus, standing in as test data, is a stale figure with
  no route back.** A test carried three magnitudes measured off one real font. **Not licensed bytes,
  and not reproducible either** — they would be wrong the moment the corpus changed, and nothing in
  the repository could recompute them. ⇒ **Replaced with obviously synthetic values demonstrating the
  same relationship**, which is the only form that survives an unvendorable corpus.

- **filed — A route is only a route if someone can walk it.** Figures were stamped historical on the
  explicit justification that **a stale figure is safe only when the reader has a route back to a
  current one** — and the routes themselves were never executed. One was walkable, because its
  procedure was recorded inline as runnable snippets. **One was not: it pointed at a census tool that
  lived in a gitignored directory and dies with the clone**, so four stamped figures referenced a
  route nobody could take. ⇒ **A recompute route IS a falsifier, and the standing rule that a
  falsifier table nobody executed is a caution with extra steps applies to it** — the author had run
  all eight falsifiers in one file and **not one of the routes they wrote an hour earlier, in the same
  session, for the same reason.**

- **filed — Where a corpus cannot be committed, the INSTRUMENT is the only reproducible half.** The
  licence rule forbids vendoring a corpus; **it says nothing about the tool that measures one.** Those
  two collapsed into *probes are inherently throwaway*, **so the census tool was never considered for
  committing and there was no decision to review** — the over-compliance shape, found by asking what
  the rule permits rather than whether it was obeyed. ⇒ **The usual instinct is inverted here: it is
  precisely because the corpus is unvendorable that its measuring tool carries all of the
  reproducibility, and discarding the tool discards the only durable half.**

- **filed — State what an instrument cannot see, beside what it checks.** A hand-maintained audit list
  makes *forgetting* to record an audit visible and cannot make a *false* audit claim visible.
- **filed — A judgement recorded as a judgement can be overturned; a judgement made silently becomes a
  fact.** Marginal calls cost one sentence to record and are otherwise unrevisitable.
- **filed — Say what would change the claim.** "Three data points, two producers" is a live caution
  because it names its own upgrade: a fourth from a third producer would move it, a fourth from the
  same producer would not.
- **filed — The register must also cover skips inside the backed set.** A gate that runs green while
  skipping files every run is backed for what it ran and silent about what it did not — and the
  boundary that re-ran every gate could not run suites needing a browser, a GPU, or the network. **The
  subsumption is near-total, and the exceptions are predictably the expensive ones.**
- **filed, and a LAW-CANDIDATE — an attestation names a command, so if the command is
  nondeterministic the attestation is a SAMPLE, not a result.** A whole-repo selector was attested
  `pass` repeatedly across one session; post-rebase it showed **three failures in eight runs**, from a
  worker-pool test timing out at the default 5,000 ms while spawning real processes. **Every green
  reported through that selector was therefore roughly a two-in-three result reported as a
  certainty** — and each individual run was honestly observed, which is what makes it dangerous:
  **no one lied, and the artifact still overstates.** ⇒ **Re-run before attesting anything whose cost
  allows it, and when a command is known intermittent, say so in the attestation instead of reporting
  the run that happened to be green.**

  ★ **CORRECTED, AND THE CORRECTION IS THE MORE USEFUL HALF: ASK WHICH DIRECTION THE
  NONDETERMINISM CAN MOVE THE RESULT BEFORE TREATING A GREEN AS SUSPECT.** Measured on this case —
  six runs, **two failures, both `Test timed out in 5000ms`, zero assertion failures**. ⇒ **A timeout
  can manufacture a spurious FAILURE and cannot manufacture a spurious PASS.** So the greens were
  sound observations of a correct tree, the reds were artifacts, **and the `fail` re-attestation made
  in good faith was correcting a true claim with a false one.** The generalisation: **a noise source
  has a reachable set of outcomes, and what it cannot produce is as informative as what it can** —
  the same invariance reasoning that says an aggregate is blind to what it discards. **A flake that
  only fails one way does not weaken the other way.**
  **Honest limit on this measurement:** two failures in six runs, one tree, one commit — **six runs is
  weak evidence about a rare assertion failure**, so this rules out nothing at a low rate; it
  establishes only that every failure observed was a timeout.
  **Promotion note:** law-level and owed a place in the parent; it sits here only for headroom.

- **filed — Verify a rebase by content, never by SHA — and beware the conflict where your own work is
  already upstream.** An add-add conflict with nine blocks looked like *mine versus theirs*; diffing
  upstream against the author's own last commit showed it **byte identical**, because their work had
  already merged. ⇒ **Taking "their" side would have replayed an older copy over their own later work,
  under a commit message announcing that it added it** — a revert wearing a feature's name, which no
  downstream check would flag. **A changed hash is not evidence of loss and an unchanged file list is
  not evidence of safety**, so diff the files themselves.

- **filed — A clean result is a result, not an absence of one.** A file with no unreported loss path
  settles a chunk of the denominator; recording it as a positive finding is the only way it counts.
- **filed — Permitted-and-unbuilt is a third state beside permitted-and-built and forbidden.** A
  capability the rules allow, that nobody built, **and that nobody declined to build.** Erring toward
  a safety rule produces an absence, and **an absence looks like discipline.** The trigger: audit the
  rules that stopped being checked and started being assumed. **The tell is that you cannot remember
  deciding.**

## Serving: a surface property that correlates with care

- **filed — Vividness.** A CFF reader's stated reason for refusing CID-keyed fonts was that they fail
  *silently, for every glyph*; measured, they fail loudly. The true reason — the outcome is
  unpredictable per font — was the stronger argument for the same refusal. **A rationale more vivid
  than its conclusion needs is doing rhetorical work.**
- **filed — Deliberation.** A guard shows someone anticipated a failure, a comment that they
  considered it, a three-of-four convention that a rule exists — **and none gives a caller anything to
  enumerate.** A comment above a silent decline answers *was this considered* while leaving *is this
  reported* untouched, so it suppresses the search while looking like diligence.
- **filed — Mechanicalness.** A rule a script can evaluate looks settled: **a stated rule shows
  someone decided, not that the rule decides.**
- **Expect a fifth surface** — grepping `explain*` functions, TODOs, or tests would be the next one.

## Serving: search instructions

- **filed — For a SEMANTIC sweep the productive question is never "what else matches", it is "WHAT
  WOULD NOT MATCH AND STILL COUNT".** The first question extends a vocabulary from inside itself and
  can only find more of what it already knows; **the second is the only one that reaches the
  population the vocabulary excludes**, and it is answered by thinking rather than by running.

- **filed — Some dependants are not enumerable, and that is the argument for removing the dependence
  rather than fixing them one by one.** A survey of history-dependent sites answered **one by scan, at
  least three by reading, and UNBOUNDED through human links** — because a status file, a parcel, a
  register and every report to a user all reach a committed artifact through a person. ⇒ **You cannot
  enumerate the dependants, so you cannot fix them individually.** ★ **A per-artifact campaign against
  an unbounded set is the indefinite hold in its most defensible costume.**

- **filed — A detector's vocabulary is CLOSED only when it is derived from a grammar. For a semantic
  question it is OPEN, and what it excludes is found by asking, not by running.** A survey of
  history-dependent artifacts used the vocabulary *calls git*. ⇒ **An entire population gets history
  WITHOUT calling git**: a CI workflow consuming `GITHUB_SHA` / `GITHUB_REF_NAME` / `GITHUB_REF_TYPE`,
  history facts supplied by the environment — **a squash changes the SHA and a tag-gated release
  depends on the tag existing.** The author found it **only by deliberately asking what their pattern
  excluded**, and declined to claim the vocabulary was closed. ⇒ **A grammar-derived sweep can report
  a ceiling; a semantics-derived one can only report what it thought to look for.**

- **filed — A path that reaches a committed artifact THROUGH A HUMAN STEP is invisible to every
  pattern.** A script derives commit counts and subjects from history and **prints them for an agent
  to compress by hand into a committed status file.** ⇒ **The value lands in the repository, and no
  scan of any vocabulary can see the link, because the link is a person.** Found by reading the file,
  not by matching it.

- **filed — separate the signal axis from the fidelity axis.** Signal: is the failure reported,
  misreported, or absent? Fidelity: is the content missing, diminished, or substituted? Orthogonal,
  and **the worst cells are the ones no cheap check reaches** — searching them on purpose found a
  morph losing one path pair, a sprite whose bounds omit an unresolvable child, rich text keeping its
  size and box while losing its font family, and a duplicate font id leaving the wrong font in place.
  **The fidelity values order by which check they defeat — existence, then count, then content
  comparison — which makes the axis an oracle specification rather than a severity scale.** Demand
  that property of the next axis rather than treating it as a happy accident of this one.
- **filed — building the report for a suspected defect is the strongest test of whether it is one.**
  Deferring that is not caution: **an unexercised finding is a claim nothing has contradicted yet.**

- **filed — A search finds syntax, not the thing you were looking for.** A sweep for
  `if (x !== null) push(x)` produced eleven candidates; one could not be made to fire at all, because
  the streams it guards are built in lockstep. **It survived three readings because at no point did
  anyone try to make it happen.** The cut runs both ways — the same sweep would miss a loss whose
  syntax it does not match. **Corollary: absence from a grep is only as good as the name** — search
  for the constructor that must exist, rather than for the label.
- **filed — A hedge written for a negative result silently expires when the result comes back
  positive.** A search command carried a note — *empty above means not wired in my clone* — the search
  returned data, and the caveat evaporated with no decision. **A positive result removes the trigger
  to re-read your own qualifier.**
- **filed — Do not renumber a denominator because investigation shrank it.** When effort both grows
  the numerator and shrinks the denominator, the ratio improves from effort alone regardless of what
  the effort found — **and it arrives dressed as rigour.** Report counts instead.

## Serving: denominators

- **filed — Two true counts for one question is a BOUNDARY difference, not a contradiction, and the
  hazard is the reconciliation.** A survey answered *derives into a committed artifact* — **one** —
  while the request had asked *derives into an artifact* — **three**, admitting a published package
  and a hand-carried status entry. **Same files, same classification, different boundary.** ⇒ **The
  requester relayed the narrower number against their own broader definition**, which is the
  misaddressed-answer law arriving as a **coordination** hazard rather than an authoring one. **The
  author's fix was to put all three boundaries in the durable artifact rather than only in messages,
  because crossed messages race and a committed file does not.**

- **filed — History is not an ambient fact; it is an OUTPUT of a decision made later and elsewhere.**
  Three history-dependent sites failed differently and **no per-artifact fix generalised**: one could
  be materialised because the value had a natural home; one **could not**, because a version derived
  from a commit count is *meant* to move with history and freezing it breaks its purpose; one could
  not be fixed in code at all, **because the unstable step was a person reading stdout.** ⇒ **The
  common factor was never the artifact — each treated history as a stable substrate.** A general
  answer names history as a **boundary-crossing input** each site declares its behaviour against.

- **filed — Stamp every claim about a mutable artifact, including the ones you attach.** Attaching
  removes the need to describe; it does not remove the need to say *when*. **An unstamped attachment
  is worse than an unstamped description, because it carries the artifact's authority without its
  currency.** And **a stamp pins *when*, not *what*: a correctly stamped file can still be described
  as containing fields it never had** — so put the description in a form the artifact can cheaply
  contradict. **A dependency is relational — confirming something landed tells you nothing about
  whether it arrived** — so read the consumer's side, or hand them the artifact.
- **filed — Marking a number historical does not stop it being quoted as current.** A figure was
  stamped with an explicit warning that it would go stale on the next edit; **the next edit was two
  commits later, and the reader who then quoted it as live was the one who had ruled on the stamp.**
  Only recomputation removes the hazard, which is why the third state in a numbers gate is
  *recomputable / stamped-historical / neither* and **stamped-historical is a concession, not a
  safe state.**
- **filed — The three costumes of "a count you produced is a denominator over whatever produced it",
  all found in one day.** Capabilities counted over our own importer rather than over the format;
  loss families counted over the searcher's vocabulary of failures rather than over the losses that
  exist; and a hash oracle comparing output against our own earlier output, **which detects change and
  never wrongness — so a defect present at first capture stays green forever.** ⇒ **Each measures
  consistency and reads as truth.**

- **filed — A true measurement can support a false inference, and only naming which half failed keeps
  the measurement usable.** Seven real CID fonts all resolving to one subroutine pool was correct and
  reproducible; the conclusion — *so we must source real multi-pool material* — was wrong, because the
  property was an authoring choice and already constructed in-repo. **The author separated the two
  explicitly rather than withdrawing both**, which is what let the measurement keep its value.

- **filed — Two independent implementations beat a derivation.** A deflated-WOFF fixture was proved by
  compressing with node's `deflateSync` and inflating with Flight's own registered decompressor. ⇒
  **The compressor and the decompressor share nothing, so a mistake in ours cannot be mirrored by
  theirs** — which satisfies *the constructor must not derive from the reader* more strongly than
  building from the specification would, since a spec-derived encoder is still one author's reading.

- **filed — Proving two things are different is not proving the difference reaches the output.** A CID
  test asserted that two subroutine pools were distinct **objects**, and none asserted they produced
  different **outlines** — so the test would pass on an implementation that selected the pool and then
  ignored it.

- **filed — When two populations have been quoted as one number, say which is unmeasured.** What our
  importer handles and what the format has are different totals.
- **filed — A ceiling on a count is also a release from waiting for it.** If a population can never be
  known complete, it cannot be a precondition for anything downstream, and work gated on it waits
  forever **while the wait looks like diligence the whole time.** Read half of that ruling alone and
  you get an indefinite hold justified by rigour. State both directions together.
- **filed — A denominator can be arbitrary rather than wrong, and that is worse.** A missing member is
  an error you can close; **an undeclared convention is a denominator that moves whenever someone else
  applies it**, and nothing flags the shift.
- **filed — Two units in one count.** "12 candidates / 11 wired" was relayed for an entire arc; the
  true figure was **13 loss paths, 12 wired, 1 demonstrated not-a-loss, across 12 numbered families.**
  Loss paths and families are different units, and the count silently mixed them.

## Orphans — real, and not instances of any law here

- **orphan-and-flagged — the transient channel gets corrected and the durable one does not.** A figure
  was corrected in messages, in three docs, and to two peers within an hour, **and left wrong in the
  append-only status journal, which is the only artifact a reset successor reads.** The journal kept
  every superseded copy, all in the present tense, with nothing marking which held. **Being diligent
  in the channel with an audience and lax in the one without is not a different failure from
  over-compliance — it is the same attention following the same gradient.** Near-miss: it looks like
  *structure over convention*, but the remedy that worked was not a structure — it was a closing
  current-state block declaring everything above it superseded, **where every claim carries the single
  command that falsifies it**, ending with *if a claim above has no falsifier in that table, I did not
  make it*, **which turns an absent falsifier into a signal instead of a silence.** Filed as an orphan
  until a second instance shows whether the law is about channels or about audiences.
- **orphan-and-flagged — the same text can be a drifting claim or a durable fact, and only its
  maintainer distinguishes them.** A count of another package's internals in a comment drifts on the
  next edit; a count of a published format's constants is recomputed by the format, which does not
  change. **The two are identical as text and opposite as claims**, and the discriminator is *who
  maintains this number?* Applying a no-numbers-in-comments rule by pattern-match would have deleted a
  correct fact — **the over-compliance direction, caught in the act rather than reconstructed.** Near
  miss: it nearly serves *denominators*, but it is about the maintainer of a fact rather than about a
  population.

## Serving: the test before quoting a number

- **filed — Where nothing recomputes, no number.** Not a better warning — **delete the figure and
  leave the recompute command.** A stamp warns without supplying a substitute, so it loses to any use
  that needs a value: the reader's choice becomes *subtract with a known-stale number* or *say
  nothing*, and **the annotated figure is what makes the wrong option available.** One stamped figure
  was quoted as live two commits later **by the reader who had ruled on the stamp.**
- **filed — An instrument's scope must be derived, not chosen — its population, not only its
  vocabulary.** A gate built to catch stale numbers took its shape list from the grammar and its
  *file* list from what was in front of its author, **so the instrument inherited the very bias it
  existed to remove**, and missed a consumer contract understating coverage by roughly half.
- **filed — Quote the source line rather than restating the number.** A quoted figure carries its own
  tree; **a restated one is a new claim with nothing behind it, and cannot be silently reunited with a
  different denominator in passing.**
- **filed — Quantities with different meanings cannot be compared for direction**; **a tally is
  evidence about how often you looked, a mechanism about what must be true**; and **a prediction
  asserts a base rate the way a ratio asserts a denominator** — both need the population stated.
