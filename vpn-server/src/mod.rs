pub mod client;
pub mod net;
// pub mod vpn; // This is wrong, main.rs declares mod vpn.
// In main.rs `mod vpn` exists.
// wait, if main.rs has `mod vpn`, then `crate::vpn` works.
// But `crate::net` needs to be exposed.
// main.rs has `mod vpn`, `mod net`.

// I should check main.rs module declarations.
