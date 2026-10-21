# flight-command

Reversible, inspectable command history over the node graph. A command is **plain kind-tagged data**;
the behaviour for its kind lives in a `CommandBinding` registered in a caller-owned table, exactly as
a renderer is bound to a node kind. Nothing on the history stack is a closure, so entries can be
inspected by a history panel and are portable to C/C++ idioms.

- `CommandFields` + the open `Command` trait; `AddNodeChildCommand`, `RemoveChildCommand`,
  `ReorderNodeChildCommand`, `SetNodePropertyCommand` and the nested `CompositeCommand` compose it
  (D16). Factories capture the child index undo needs at creation time.
- `CommandBinding { execute, merge?, undo }` keeps a kind reversible by construction; the binding
  table is immutable data replaced on registration, last write wins.
- `CommandHistory` holds entries and the applied-entry cursor; execute forks the redo branch, a drag
  can merge through the kind's `merge` hook with a caller-supplied time, and `maxSize` trims the
  oldest entries. `Ref<CommandHistory>` preserves history identity for bindings that need it.
- Transactions count nesting; only the outermost `end` folds, a single collected command keeps its
  own identity, and `abort` unwinds in reverse.

Pending Principal ruling: `SetNodePropertyCommand`'s constructors and binding need a dynamic node
property carrier. D16 has no dynamic field reflection, so the type, its entry records and the
contract-lane initializer are present while the two reading constructors and the default binding wait
for the ruled carrier.
