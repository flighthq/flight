# flight-midi

Origin-pinned MIDI access, permission queries, input/output port resources and event subscriptions
over caller-supplied capabilities. The crate never resolves browser, Web MIDI or native MIDI APIs;
all reads, commands, listeners and releases go through the explicit provider records.

## Source and export audit

The pinned `midi/src` package contains five implementation modules and five behavior suites:
`midiAccess`, `midiPermission`, `midiPort`, `midiResource` and `midiSubscription`. The locally owned
vocabulary comes from the complete pinned `types/src/Midi.ts`; `HostMidiPermissionCapability` and
its permission outcomes stay canonical in `flight-permissions`.

The crate root mirrors exactly the 23 functions exported by the pinned `index.ts`. The `contract`
lane additionally exposes the three resource constructors and initializers, private-state
retention/read seams, exact enum string tables, attachment release, and free-function delegates for
the methods declared on the final-owner operation records. No ambient backend or provider factory
is exported.

## Identity and lifecycle

Accesses, ports, attachments and subscriptions are Entities with private per-object runtime
bindings. `Ref` preserves exact identity: matching native IDs do not collapse ports, input and
output ports remain distinct, callbacks retain their canonical `ProviderRef`, and hotplug delivery
adds the emitted port Entity to the access cleanup ledger.

Access and port disposal share an in-flight result, become terminal only after successful cleanup,
and retain only failed subscriptions, ports or an owned close for retry. Ports are closed during
disposal only when Flight opened them. A failed connection read never waives that owned close.
Subscription attach/detach/dispose uses generation invalidation, waits for an in-flight attach, and
releases the exact returned attachment. Failed release stays pinned for retry; successful detach
keeps consumer signal slots, while dispose clears them even on failure. Provider calls, awaits and
signal delivery happen without holding lifecycle locks, so callbacks may re-enter.

## MIDI data

Port connection and device state remain pull-based provider snapshots; no public mirrored state is
invented. Input messages copy each native `Uint8Array` and preserve its event timestamp. Output
validation runs before any provider access, rejects empty/status/data/length/timestamp errors,
distinguishes system-exclusive status, and copies valid bytes into the provider call.

## Sugar (D18)

The Rust-only layer supplies thin delegates for the public access, port and subscription operations,
both host capabilities, attachment release, and every method declared by the final-owner resource
operation records. Subscription Entities expose `new`. All 18 closed MIDI enums expose exact
`parse` and `to_str` delegates. Forty-six inline comparison tests exercise every delegate against
its free-function contract; no lifecycle logic lives in the methods.

## Verification and exceptions

The mirrored and provider-contract suites contain 101 integration tests, plus the 46 D18 inline
comparisons. They cover identity, origin pinning, rejected operations, owned-versus-borrowed close,
retry ledgers, terminal idempotency, payload copies, pull state, reentry-safe signals and an
in-flight attach/dispose race.

The only `f64` values are Web MIDI event and optional send timestamps, which require fractional
millisecond precision (D1). `Uint8Array` is the canonical byte representation; no array waiver is
needed. The enum-payload exception records that the source `MidiPort` union directly carries one of
two Entity identities. Async rejection aliases use the established `Result<T, FlightError>`
contract representation. There are no hidden-state, conformance-skip or baseline additions.
