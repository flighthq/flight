# Task S host-capability mapping report

This report freezes the independent source census and the acceptance policy for generated host
capability constructors. The machine-readable companion is `task_s_capability_inventory.tsv`.

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

## HostLime priorities

The seven user-facing priorities resolve to 29 callback-bearing leaf structs and 76 callbacks:

| Priority | Exact leaf types | Callbacks |
| --- | --- | ---: |
| Window | `HostWindowAppearanceCapability`, `HostWindowAttachCapability`, `HostWindowAttentionCapability`, `HostWindowContentProtectionCapability`, `HostWindowFocusCapability`, `HostWindowFullscreenCapability`, `HostWindowGeometryCapability`, `HostWindowHierarchyCapability`, `HostWindowLifecycleCapability`, `HostWindowProgressCapability`, `HostWindowShadowCapability`, `HostWindowShellCapability`, `HostWindowSizeConstraintsCapability`, `HostWindowStateCapability`, `HostWindowVisibilityCapability`, `HostWindowZOrderCapability` | 33 |
| Screen | `HostScreenChangeCapability`, `HostScreenDetailsCapability`, `HostScreenPermissionChangeCapability`, `HostScreenQueryCapability` | 8 |
| Device | `HostDeviceCapability` | 6 |
| Input ingress | `HostInputIngressCapability` | 6 |
| Lifecycle | `HostLifecycleCapability` | 4 |
| Timer | `HostTimerCapability` | 3 |
| Surface / Canvas / GL / WGPU | `HostCanvasCapability`, `HostGlCapability`, `HostSurfaceDisplayCapability`, `HostSurfaceResizeCapability`, `HostWgpuCapability` | 16 |

The plural aggregate structs are routing containers, not constructor leaves. Constructor names use
the exact leaf type converted to snake case: `flight_create_<leaf>` and `flight_free_<leaf>`.

## Carrier and support decisions

Every inventory field receives its own decision. A struct-level constructor flag is only a roll-up;
it never substitutes for field evidence. The independent source inventory groups callbacks into
these first-pass carrier/risk buckets:

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
must emit `decision|field|supported|rationale` or `decision|field|unsupported|rationale` adjacent to
every field. A generated constructor is valid only when every one of its fields is supported.

## Constructor contract

For every supported public leaf:

1. The Rust, strict-C, and HashLink surfaces contain exactly one deterministic constructor and one
   exact free.
2. The shared context is the first argument, is stored only as an integer-backed shared carrier,
   interns one provider identity across constructors, and requires distinct stable values for
   distinct providers. It may be used from every thread allowed by the Rust capability, remains
   caller-owned and valid until both the constructor handle is freed and every SDK value retaining
   a capability clone is released, and is never dereferenced or freed by Rust.
3. Callback parameters follow source declaration order. Required NULL rejects before allocation;
   optional NULL becomes `None` and a present optional callback becomes `Some`.
4. Borrowed pointer arguments exist only for the dynamic callback invocation. Mutable out handles
   preserve identity. Checked enums reject invalid discriminants inside the unwind boundary.
5. Owned callback returns transfer one owner. Nested callbacks/sinks remain Rust-owned through the
   returned disposer lease. Async completions settle exactly once through their typed helper.
6. Free accepts NULL and drops exactly the constructor-owned box. It never releases caller context.

## Executable and structural coverage

- The Rust runtime fixture constructs `HostDeviceCapability` and `HostTimerCapability`, exercises
  mutable out handles, owned strings, scalar returns, optional None/Some, context identity,
  cross-thread Send+Sync use, retained nested callbacks, disposer cancellation, and exact free.
- The strict-C consumer constructs and invokes `HostDeviceCapability` under C11 with
  `-Wall -Wextra -Wpedantic -Werror`, including required/optional NULL and owned-string behavior.
- The generated-output oracle checks every supported constructor/free in Rust, C, and HashLink,
  validates callback order and HashLink arity, and requires the context/ownership/mapping contract
  immediately adjacent to each C prototype.
- The source oracle reparses every workspace crate with `syn`, compares a frozen 1,344-line
  inventory, and independently cross-checks the generated 242-struct/795-field/438-callback report.
