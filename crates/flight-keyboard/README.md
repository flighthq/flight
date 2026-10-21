# flight-keyboard

Soft-keyboard state, transition signals, and commands routed through explicit host capabilities
(TS `@flighthq/keyboard`). The crate does not select an OS or runtime provider. Applications supply
capability records, which makes tests and native adapters ordinary callers rather than ambient
singletons.

`attach_soft_keyboard` samples the current height, subscribes asynchronously, and classifies later
height changes using the source's strict `height > 0` visibility rule. It updates its prior height
before synchronously emitting `on_show`, `on_hide`, or `on_resize`, so signal slots may re-enter the
provider safely. Re-attaching invokes the prior subscription's exact release first. That release is
kept in private state on the `SoftKeyboard` entity; no global or thread-local registry is used.

Provider futures are executor-neutral. A provider-reported operation result is represented by the
corresponding closed enum, while a rejected source Promise is preserved separately as
`Err(FlightError)`.

## Precision

Keyboard geometry uses `f32`. Height and bounds are reported display measurements used for current
layout and transition comparisons; they are not accumulated or used as persistent coordinates.
