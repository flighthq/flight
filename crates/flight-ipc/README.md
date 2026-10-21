# flight-ipc

IPC routing through caller-supplied, operation-tight capability callbacks. The crate opens no
process, socket, Electron, browser, or native-host channel and installs no global provider.

`AnySlot` is the IR's established `unknown` representation. Promise rejection is retained as a
`FlightError`, and callbacks that the provider stores use the D9 `Arc<dyn Fn>` form.
