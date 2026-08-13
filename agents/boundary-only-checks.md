# Boundary-only checks — verifications CI cannot run, and cannot be made to run

Every check listed here works. None of them is run by CI, and **none of them can be**: each one's subject
is a **parcel** — the note, patch set and metadata one agent hands to another — and a parcel does not
exist in the repository. There is no commit, no file and no branch for a gate to read, so no
`scripts/check.ts` stage, no hook and no workflow can ever invoke these. The boundary is the only place
they are possible.

**This is the mirror of [inert-gate-audit.md](inert-gate-audit.md).** That document catalogues gates that
run but do not check what their name claims. This one catalogues checks that check exactly what they
claim and that nothing can invoke. The two failure modes look identical from a green CI run and have
opposite remedies: an inert gate is **unwired** and can be fixed by wiring it; a boundary-only check is
**unwireable**, and the only thing available is to make its absence noticeable.

**Why an index and not a gate.** The tools live in the integration agent's workspace, beside its `repo/`
clone, and they run when that agent runs. A successor inherits the boundary with no way to learn these
existed — and **the first sign of their absence is a defect nobody caught**. An index cannot make them
run. It makes their **disappearance visible**, which is the whole of what is available here. If you hold
the boundary and a check below is not in your workspace, it is missing, not retired.

**Coverage is orthogonal, not layered.** The count check catches the **wrong set** of commits; the
rejected-value scanner catches the **wrong content** inside a set whose count was right; the net-deletion
detector catches content that was never authored at all. None subsumes another.

| Check | Subject | What must be true | How it fails |
| --- | --- | --- | --- |
| **Stated-count reconciliation** | The sender's note vs `handoff/in/received/<parcel>/commits/` | The commit count and range the note states matches the patch files delivered | A mismatch means the parcel carries commits the sender did not describe. Catchable **by arithmetic**, with no knowledge of any patch — which is the point: knowledge does not survive a context reset, arithmetic does |
| **Rejected-value scanner** (`check-rejected.py`) | Parcel patches vs the `REJECTED:` / `LANDED:` tokens in [unbacked-register.md](unbacked-register.md) | No patch adds a line carrying a rejected literal **under the path that rejected it** | A re-sent or rebased patch can *undo* a landed decision, and at apply time that is indistinguishable from one that makes it: same author, same clean application, same silence |
| **Net-deletion detector** | `git apply --numstat` over each patch, against the seed | Deletions are confined to content the parcel itself added earlier in the same stack | A bad base sync arrives as uncommitted worktree content and is captured as authored work. Authorship cannot be read off a diff |
| **Size-pin grep** | `git log <base>..<tip> -- tools/size/size.baseline.json` | The size baseline is untouched without the user's explicit permission | The pin is not gated, so there is no red to clear; a rewrite is how a real size increase stops being visible at merge |
| **One-writer tripwire** | Parcel patches vs the declared single owner of a file | Only the declared owner's changes to that file land | The rule is honoured by senders and not derivable from the tree — parcels arrive re-parented, so the tree cannot answer who wrote a line |

## The property that makes these worth writing down

A gate that stops running goes red, or its absence shows up in a diff of `scripts/check.ts`. **A
boundary-only check that stops running produces exactly the same output as one that ran and found
nothing.** Silence is the success signal and the failure signal both. That is why each tool above owes a
self-test with **known answers** rather than a smoke run, and why a scanner must decline to report
"clean" when it has nothing to match — a scan that parsed zero rules and a scan that found zero
violations must not print the same thing.
