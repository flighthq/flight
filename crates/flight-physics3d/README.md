# flight-physics3d

The default package test command runs the unit and integration suites without the long-running
stress simulations:

```sh
cargo test -p flight-physics3d --locked
```

Enable `stress-tests` to run the same suites plus all 11 Physics3D stress cases:

```sh
cargo test -p flight-physics3d --locked --features stress-tests
```
