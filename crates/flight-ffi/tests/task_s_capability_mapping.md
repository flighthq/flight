# Task S host-capability inventory and withdrawal report

This report freezes the independent source census while recording that generated host-capability
construction is withdrawn from the alpha ABI. The machine-readable companion is
`task_s_capability_inventory.tsv`; neither artifact enables runtime adapters.

## Census

- 242 structs whose exact name starts with `Host` and contains `Capabilit`
- 237 public SDK-lane structs and 5 net/share contract-lane structs
- 795 fields in declaration order
- 438 callable fields: 360 required and 78 optional
- 304 canonical signature families
- 186 callback-bearing structs, of which 183 are public and 3 are contract-only
- 302 synchronous and 136 future-returning callbacks
- Borrow shapes: 230 owned/scalar-only, 193 shared-borrow, and 15 shared-plus-mutable-borrow

The callable census includes both closure carriers and three structural bare function pointers. The
bare pointers are `HostCompressDeflateCapability.compress`, `HostCompressLzmaCapability.compress`,
and `HostTextSegmenterCapability.segment`. Omitting them produces the misleading 435/302 census.

## Withdrawn HostLime priorities

The seven former implementation priorities resolve to 29 callback-bearing leaf structs and 76 callbacks.
All 29 are explicitly inventoried as `withdrawn_priority=true`; none has a public FFI constructor:

| Priority | Exact leaf types | Callbacks |
| --- | --- | ---: |
| Window | `HostWindowAppearanceCapability`, `HostWindowAttachCapability`, `HostWindowAttentionCapability`, `HostWindowContentProtectionCapability`, `HostWindowFocusCapability`, `HostWindowFullscreenCapability`, `HostWindowGeometryCapability`, `HostWindowHierarchyCapability`, `HostWindowLifecycleCapability`, `HostWindowProgressCapability`, `HostWindowShadowCapability`, `HostWindowShellCapability`, `HostWindowSizeConstraintsCapability`, `HostWindowStateCapability`, `HostWindowVisibilityCapability`, `HostWindowZOrderCapability` | 33 |
| Screen | `HostScreenChangeCapability`, `HostScreenDetailsCapability`, `HostScreenPermissionChangeCapability`, `HostScreenQueryCapability` | 8 |
| Device | `HostDeviceCapability` | 6 |
| Input ingress | `HostInputIngressCapability` | 6 |
| Lifecycle | `HostLifecycleCapability` | 4 |
| Timer | `HostTimerCapability` | 3 |
| Surface / Canvas / GL / WGPU | `HostCanvasCapability`, `HostGlCapability`, `HostSurfaceDisplayCapability`, `HostSurfaceResizeCapability`, `HostWgpuCapability` | 16 |

The plural aggregate structs remain routing containers. The briefly generated
`flight_create_host_*_capability` surface and its S-only paired frees are withdrawn.

## Carrier and support decisions

The independent source inventory groups callbacks into these first-pass carrier/risk buckets:

| Bucket | Fields | Meaning |
| --- | ---: | --- |
| `mapped:scalar` | 97 | No borrow or nested behavior is visible; primitive, checked-enum, handle, or owned-result lowering still must be named by the generator. |
| `mapped:pointer` | 95 | Shared/nullable borrowed handle or optional-result pointer semantics are required. |
| `mapped:string` | 38 | Borrowed input strings or owned UTF-8 returns require explicit lifetime/ownership handling. |
| `mapped:out-pointer` | 15 | Mutable borrows must become borrowed out handles and preserve argument identity. |
| `needs:nested-callback` | 50 | A callback/listener/sink crosses inside another callback and needs a retained typed handle plus a bounded call helper. |
| `needs:callback-return` | 7 | The callback returns a disposer/unsubscribe/release behavior and needs an owned callable lease. |
| `unsupported:future` | 136 | A future result needs an explicit one-shot completion context, error carrier, and exactly-once rule before it is eligible. |

These buckets are an audit aid, not permission to infer support from spelling. The generated report
emits an adjacent unsupported decision for every field. Fields on the former 29 priorities use the
reason `withdrawn-capability-construction-deferred-beyond-alpha`; every other field remains
`not-prioritized`.

## Withdrawal contract

The default Rust, strict-C, and HashLink outputs contain no `flight_create_host_*_capability`,
`flight_complete_host_*`, `FfiHostCallback`, callback lease, input-ingress adapter, provider
registry, or S-only disposer-construction path. This removes the reachable use-after-free in which
a disposer lease could drop a callback box without cancelling the host callback, as well as the
async completion double-free/use-after-free risk. Capability construction requires a redesigned
ownership and cancellation protocol before it can return to a later ABI.

## Executable and structural coverage

- The unsafe Task S Rust runtime fixture and strict-C constructor round trip are removed.
- The generated-output oracle checks an explicit set of 86 public symbols in Rust, C, and HashLink:
  29 constructors, 28 paired frees, 3 async completions, 8 callback invokers, 16 input-ingress
  invokers, the disposer constructor, and the owned-string constructor.
- The same oracle rejects the withdrawn host callback, future, provider, completion, disposer, and
  owned-string runtime tokens. Mutation cases inject `flight_create_string(` and
  `struct FfiHostFuture` and require both reintroductions to be detected.
- The source oracle reparses every workspace crate with `syn`, compares a frozen 1,344-line
  inventory, and independently cross-checks the generated 242-struct/795-field/438-callback report
  and the exact 29 withdrawn priorities.
