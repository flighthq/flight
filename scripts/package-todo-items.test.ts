import { describe, expect, it } from 'vitest';

import { itemHeadlines } from '../agents/packages/todo-items.mjs';

describe('package TODO item headlines', () => {
  it('keeps active recommendations even when their descriptions discuss completed work', () => {
    expect(
      itemHeadlines(`
1. **Complete playback semantics.** Events are complete, but root motion still needs work.
2. **Edge-case pinning tests.** The ordinary case is already handled but unasserted.
3. Add the final active item.
`),
    ).toEqual(['Complete playback semantics', 'Edge-case pinning tests', 'Add the final active item']);
  });

  it('omits recommendations carrying explicit closure markers', () => {
    expect(
      itemHeadlines(`
1. ~~**Lift the notification seam to id.**~~ _Already done._
2. **[2026-07-30 · completed] Fix the stale export.** See the status note.
3. **Seam-doc note** — n/a; the implementation already covers it.
4. Registry-only dispatch -- done, see the verification note.
5. **Retire the old path.** — retired after the package was absorbed.
6. **Keep this actual task.** Its predecessor landed, but this item did not.
`),
    ).toEqual(['Keep this actual task']);
  });

  it('omits strikethrough recommendations with or without an outer bold wrapper', () => {
    expect(
      itemHeadlines(`
1. ~~**Closed with outer strike.**~~
2. **~~Closed with outer bold.~~**
3. **Keep this task.** Its description mentions a ~~retired alternative~~.
`),
    ).toEqual(['Keep this task']);
  });

  it('ignores prose and nested continuation bullets', () => {
    expect(
      itemHeadlines(`
Sweep-safe continuations:

1. **Top-level task.** Do the work.
   - Nested detail must not become its own item.

_No other items._
`),
    ).toEqual(['Top-level task']);
  });
});
