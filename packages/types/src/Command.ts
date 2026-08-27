import type { Kind } from './Entity';
import type { NodeAny } from './Node';
import type { KeyedTable } from './RegistryTable';
import type { Signal } from './Signal';

// A recorded, reversible intent — PLAIN KIND-TAGGED DATA, never an object carrying execute/undo methods.
//
// The behaviour for a kind lives in a `CommandBinding` registered in a keyed table and resolved at
// dispatch, exactly as a renderer is bound to a node kind. That is what lets an unused command kind
// tree-shake out, lets a caller add their own vendor-prefixed kinds, and keeps a history stack out of the
// closure business: a stack of closures is not portable to C/C++ idioms, cannot be inspected by a history
// panel, and cannot be persisted. Flight already ruled the same way for authored timeline cues.
//
// THE PRESENT SERIALIZATION LIMIT: the built-in command kinds address their target as a LIVE NODE
// REFERENCE, so a command is data with one non-serializable field and a history cannot yet be written to
// disk. Nodes have no stable identity to name instead — `scene-document` is what supplies one, by key and
// path — so this is a limit of the SDK today rather than of this design. Everything except the target is
// already serializable, and the seam is in the right place for the rest to follow once identity exists.
export interface Command {
  readonly kind: Kind;
  // Human-readable description, shown by a history panel and returned by the undo/redo label queries.
  readonly label: string;
}

// The behaviour registered for one command kind. A record of free functions over the command's own data —
// none of them closes over captured state, which is the whole point of keeping the command plain data.
//
// `execute` and `undo` are required together because a command kind that cannot be reversed is not a
// command; binding one without the other would put an entry on the stack that undo silently skips.
export interface CommandBinding {
  readonly execute: (command: Readonly<Command>) => void;
  // Folds `next` into `previous`, returning the combined command, or `null` to keep them separate. This is
  // what collapses a 60-frame drag into one undo entry. Resolved by the kind of the INCOMING command.
  readonly merge?: (previous: Readonly<Command>, next: Readonly<Command>) => Command | null;
  readonly undo: (command: Readonly<Command>) => void;
}

// An undo/redo stack over commands, plus the bindings that give its entries behaviour.
//
// `index` is the count of APPLIED entries: `entries[0 .. index - 1]` have been executed and
// `entries[index .. ]` are available to redo. Executing a new command discards everything from `index`
// onward, which is the standard fork-the-timeline behaviour.
export interface CommandHistory {
  // Persistent table — every registration returns a REPLACEMENT that the owner assigns, so this field is
  // reassigned rather than mutated.
  bindings: KeyedTable<CommandBinding>;
  entries: Command[];
  index: number;
  // Cap on retained entries; `0` means unbounded. Trimming drops from the OLDEST end, so the most recent
  // history is what survives.
  maxSize: number;
  // Opt-in change signal; null until enableCommandHistorySignals allocates it, so a bare history pays no
  // signal allocation or dispatch cost. Emits after any execute, undo, redo, or clear that changed state.
  onChange: Signal<() => void> | null;
  // Open transaction bracket. `transactionDepth` counts nested begins; `transactionIndex` records where
  // the bracket started so end can fold and abort can unwind exactly that range.
  transactionDepth: number;
  transactionIndex: number;
  transactionLabel: string | null;
}

// One entry of a property change: which node, which field, and the values on both sides.
//
// `before` and `after` are `unknown` rather than a generic parameter because the history holds commands of
// many kinds in one array; the binding that reads them is the one that wrote them.
export interface CommandPropertyEntry {
  readonly after: unknown;
  readonly before: unknown;
  readonly property: string;
  readonly target: NodeAny;
}

// Several commands applied as one history entry. Composite is DATA like every other kind — a `children`
// array, not a closure over a list — so a composite can be inspected, and nested composites just work.
export interface CompositeCommand extends Command {
  readonly children: readonly Command[];
}

export interface AddNodeChildCommand extends Command {
  readonly child: NodeAny;
  // Insertion position; `-1` appends.
  readonly index: number;
  readonly parent: NodeAny;
}

export interface RemoveNodeChildCommand extends Command {
  readonly child: NodeAny;
  // The index the child occupied when the command was created, so undo restores position and not merely
  // membership.
  readonly index: number;
  readonly parent: NodeAny;
}

export interface ReorderNodeChildCommand extends Command {
  readonly child: NodeAny;
  readonly fromIndex: number;
  readonly parent: NodeAny;
  readonly toIndex: number;
}

// One or more property assignments applied together. A single-property change is this with one entry,
// rather than a separate kind, so the merge rule has one implementation instead of two that can disagree.
export interface SetNodePropertyCommand extends Command {
  readonly entries: readonly CommandPropertyEntry[];
  // Optional coalescing window compared against `time`. Both must be present on both commands for a merge
  // to happen; absent means every change is its own undo entry.
  readonly mergeWindow: number;
  // Caller-supplied timestamp. The package takes no clock dependency — whoever records the command owns
  // what "now" means, which is also what keeps this field serializable.
  readonly time: number;
}

// Why a dispatch would not happen, as plain data. `executeCommand`, `undoCommand` and `redoCommand` all
// return a `false` sentinel on an unregistered kind; this is the shakeable query that says WHICH kind was
// missing, so the core never has to carry a message.
export interface CommandDispatchExplanation {
  // The kind that could not be resolved, or null when dispatch would succeed.
  readonly missingKind: Kind | null;
  // True when a binding exists for every kind this command would dispatch, nested children included.
  readonly resolved: boolean;
}

export const AddNodeChildCommandKind = 'AddNodeChildCommand';
export const CompositeCommandKind = 'CompositeCommand';
export const RemoveNodeChildCommandKind = 'RemoveNodeChildCommand';
export const ReorderNodeChildCommandKind = 'ReorderNodeChildCommand';
export const SetNodePropertyCommandKind = 'SetNodePropertyCommand';

// The registry identity and miss policy the command binding table is created with, named here so a
// consumer composing an overlay table uses the same pair rather than a guessed string.
export const CommandBindingRegistryId = 'command.bindings';
export const CommandBindingMissPolicy = 'ignore';
