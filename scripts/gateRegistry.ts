// The gate list `scripts/check.ts` builds, extracted so its one invariant can be tested: A STAGE NAME
// REGISTERS AT MOST ONCE.
//
// The invariant earns a guard because a duplicate is invisible in the only signal anyone reads. Two
// agents independently added the identical `add('evidence:check', …)` line to check.ts, five lines
// apart, from the same base. Neither hunk overlapped the other, so both applied clean and the stage
// registered twice — and a sweep that runs a stage twice is green exactly like a sweep that runs it
// once. ★ NON-OVERLAPPING TEXT IS NOT INDEPENDENT INTENT: git checks PROXIMITY, NOT IDENTITY, and a
// one-line fix is exactly the size that lands far enough from its twin to merge clean.
//
// It THROWS rather than returning a sentinel because registering the same stage twice is a programmer
// error — a precondition violation that correct code cannot reach — which is the repository's own
// dividing line between throwing and returning a sentinel.
//
// ★ THE CHECK IS AT REGISTRATION, DELIBERATELY, AND A STATIC SCAN OF check.ts WOULD BE WRONG. Two
// `add('typecheck', …)` calls sit in the source, on the two arms of an `if (scoped) / else` — only
// one ever executes, and that source is correct. A grep for duplicate stage names reports it as a
// finding; the runtime sees one registration and is right. The static and runtime readings of the
// same file answer different questions, and a duplicate-name linter would have been "fixed" by
// someone flattening a correct conditional.
//
// The cost of choosing the runtime reading, stated rather than discovered: A RUN ONLY SEES THE STAGES
// THAT RUN. Most of check.ts registers inside `if (!scoped)`, so a scoped run (`npm run check math`)
// cannot catch a duplicate among the whole-repo-only stages — measured, not assumed: the original
// `evidence:check` collision passes a scoped run and throws on a bare one. That is the right trade,
// because CI runs bare and the throw happens before any gate executes, so the bare sweep fails in
// seconds rather than after the full walk. But do not read a green scoped run as "no duplicates."
export interface Gate {
  args: readonly string[];
  command: string;
  label: string;
}

export interface GateRegistry {
  add: (label: string, command: string, args: readonly string[]) => void;
  gates: readonly Gate[];
}

export function createGateRegistry(): GateRegistry {
  const gates: Gate[] = [];
  const registered = new Set<string>();
  return {
    add: (label: string, command: string, args: readonly string[]): void => {
      if (registered.has(label)) {
        throw new Error(
          `check.ts registers the gate '${label}' twice. A duplicate is never intended and is invisible in a green sweep, so it is rejected here rather than run twice. If two edits added the same stage independently, keep one registration and merge the reasoning from both.`,
        );
      }
      registered.add(label);
      gates.push({ args, command, label });
    },
    gates,
  };
}
