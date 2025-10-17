pub mod cloudwatch;

use once_cell::sync::Lazy;
use prometheus::{Encoder, IntCounter, IntCounterVec, IntGauge, Opts, Registry, TextEncoder};
use std::sync::atomic::{AtomicU64, Ordering};

pub static REGISTRY: Lazy<Registry> = Lazy::new(Registry::new);

pub static SESSIONS_TOTAL: Lazy<IntCounter> = Lazy::new(|| {
    let counter = IntCounter::new("vpn_sessions_total", "Total VPN sessions served")
        .expect("create sessions_total metric");
    REGISTRY.register(Box::new(counter.clone())).ok();
    counter
});

pub static SESSIONS_ACTIVE: Lazy<IntGauge> = Lazy::new(|| {
    let gauge = IntGauge::new("vpn_active_sessions", "Number of active VPN sessions")
        .expect("create active_sessions metric");
    REGISTRY.register(Box::new(gauge.clone())).ok();
    gauge
});

pub static PEERS_REGISTERED: Lazy<IntGauge> = Lazy::new(|| {
    let gauge = IntGauge::new("vpn_registered_peers", "Total registered peers")
        .expect("create peers gauge");
    REGISTRY.register(Box::new(gauge.clone())).ok();
    gauge
});

pub static BYTES_TRANSFERS: Lazy<IntCounterVec> = Lazy::new(|| {
    let vec = IntCounterVec::new(
        Opts::new("vpn_transfer_bytes_total", "Transferred bytes by direction"),
        &["direction"],
    )
    .expect("create bytes counter vec");
    REGISTRY.register(Box::new(vec.clone())).ok();
    vec
});

pub static AUTH_FAILURES: Lazy<IntCounter> = Lazy::new(|| {
    let counter = IntCounter::new("vpn_admin_auth_failures", "Failed admin authentications")
        .expect("create auth failures counter");
    REGISTRY.register(Box::new(counter.clone())).ok();
    counter
});

static LAST_EGRESS: Lazy<AtomicU64> = Lazy::new(|| AtomicU64::new(0));

pub fn encode_prometheus() -> Vec<u8> {
    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    let mut buffer = Vec::new();
    encoder
        .encode(&metric_families, &mut buffer)
        .expect("encode metrics");
    buffer
}

pub fn record_active_sessions(total: usize) {
    SESSIONS_ACTIVE.set(total as i64);
}

pub fn increment_total_sessions(count: usize) {
    if count > 0 {
        SESSIONS_TOTAL.inc_by(count as u64);
    }
}

pub fn set_registered_peers(total: usize) {
    PEERS_REGISTERED.set(total as i64);
}

pub fn record_transfer(direction: &str, bytes: u64) {
    if bytes == 0 {
        return;
    }
    BYTES_TRANSFERS.with_label_values(&[direction]).inc_by(bytes);
}

pub fn get_egress_delta() -> u64 {
    let total: u64 = BYTES_TRANSFERS
        .with_label_values(&["egress"])
        .get()
        .try_into()
        .unwrap_or_default();
    let last = LAST_EGRESS.load(Ordering::Relaxed);
    let delta = total.saturating_sub(last);
    LAST_EGRESS.store(total, Ordering::Relaxed);
    delta
}
