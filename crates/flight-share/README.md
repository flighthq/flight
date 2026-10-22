# flight-share

Portable sharing commands and result signals over operation-specific host
capabilities. Source: the supplied `share/src/share.ts` and the share-owned
`types/src/{Share,ShareFile,ShareSignals}.ts` declarations plus
`Host.ts::HostShareCapabilities`. No OS, browser, filesystem or native sharing
provider is implemented here.

The root mirrors all 13 source public functions. The full `contract` also
exports `initialize_share_signals`. `ShareSignals` is an Entity with a private
runtime slot; enabling it allocates an inert group. Attach explicitly to receive
results. Content, files and results remain plain data.

Principal batch 6 approves the three named `ShareContent` payload alternatives,
each retaining text/title/url with the selected field required. Their target
union is untagged: no discriminator is added. Absent optional strings remain
distinct from explicit empty strings. `ShareFilesContent.files` uses ordered
`Vec<Ref<ShareFile>>`, with the source nonempty invariant checked at command
boundaries. Core copies the file array and retains descriptor references.
Both capability records carry canonical `provider: ProviderRef` from
`flight-host`; facets from one provider share its token (Principal
9170da33). No duplicate identity alias is defined.
Content and detailed outcomes use `Ref` to preserve provider/caller identity,
including callback retention of the exact emitted and returned result.

Content validation checks only nonempty strings. File validation checks only
nonempty name/MIME strings and a `data:` prefix plus comma; decoding, MIME
plausibility and URL syntax remain provider responsibilities. Empty content and
invalid files short-circuit with the source false/null sentinels. Provider
outcomes are forwarded unchanged. Executor-neutral futures use the existing
D15/D10 `Result<T, FlightError>` rejection representation; rejected detailed
commands do not broadcast.

`ShareState` is the D5 caller-owned replacement for the source strong ordered
Set. Clones share one context; separate defaults are independent. D15 Entity
UIDs identify registrations. Monotonic insertion positions and live traversal
preserve idempotent attachment, insertion order, future-entry removal, additions
and reattachment during delivery, and nested broadcasts. No lock is held across
a callback. Detach removes the strong registration without clearing listeners;
dispose additionally clears them, as in the source.

D18 supplies 13 delegates with 13 inline comparisons. The behavior tests port
all representable pinned assertions and add identity, ordered live mutation,
reentry, retained descriptors, nullable outcome and rejection coverage. The eight
removed ambient backend exports are each checked with a compile-fail import.
One TS typing fixture is unrepresentable: `share.test.ts:87-88` deliberately
passes `{}` under `@ts-expect-error`, while every Rust content arm requires a
field. Empty declared fields remain covered. Entity-symbol and initializer
`typeof` assertions become Entity identity and initialization behavior checks.

Allow inventory: four `conform-params` markers for the explicit D5 context; two
`contract-vocabulary` markers for the established async rejection representation;
one test-only `test-default-call` marker for constructing a plain D5 context
without inventing an Entity factory. No conformance skips, new string enums,
numeric-array changes, precision exceptions or baseline changes.
