# Review tool behavior

## Navigation

Up/Down follows the sidebar's current visual order: tool order, then the attention groups `differs`, `changed`, `not-commissioned`, `requested`, and `included`, then alphabetical order within a group. Filtering retains that relative order. Left/Right follows declared renderer order after excluding context-only reference cells.

The review and commissioning queue excludes scenes with fewer than two reviewable backend cells by default. Context-only reference cells do not count toward that minimum. Use **Include single-cell** to opt into reviewing those scenes when their own-drift signal is useful despite the absence of a cross-backend comparison.

The sidebar re-sorts immediately when commission state changes. That behavior is accepted for now. If it disrupts a review pass, the two deferred options are:

1. Advance to the next cell automatically upon commission.
2. Avoid re-sorting immediately by freezing the ordered list for the pass.
