use std::env;
use std::time::Duration;

use aws_sdk_cloudwatch::types::{Dimension, MetricDatum, StandardUnit};
use aws_sdk_cloudwatch::Client as CloudWatchClient;
use tokio::time::sleep;
use tracing::{debug, error, info};

use super::{get_active_sessions, get_bytes_sent_delta, get_per_protocol_active, get_per_protocol_egress_delta};

const NAMESPACE: &str = "vpnVPN";

pub async fn start_publisher_task() {
    if env::var("DISABLE_CLOUDWATCH_METRICS").map(|v| v == "1").unwrap_or(false) {
        info!("cloudwatch_metrics_disabled");
        return;
    }

    let config = aws_config::load_from_env().await;
    let client = CloudWatchClient::new(&config);
    let instance_id = env::var("INSTANCE_ID").unwrap_or_else(|_| "unknown".into());
    let asg_name = env::var("ASG_NAME").ok();
    let interval = env::var("METRICS_INTERVAL_SECONDS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(60);

    tokio::spawn(async move {
        info!(interval_secs = interval, "cloudwatch_publisher_started");
        loop {
            let mut dimensions = vec![Dimension::builder()
                .name("InstanceId")
                .value(instance_id.clone())
                .build()];

            if let Some(asg) = &asg_name {
                dimensions.push(Dimension::builder()
                    .name("AutoScalingGroupName")
                    .value(asg.clone())
                    .build());
            }

            let active_sessions = get_active_sessions();
            let bytes_delta = get_bytes_sent_delta();
            let protos_env = env::var("VPN_PROTOCOLS").unwrap_or_else(|_| "wireguard,openvpn,ikev2".into());
            let protocols: Vec<&str> = protos_env.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();

            let mut data = Vec::new();
            data.push(
                MetricDatum::builder()
                    .metric_name("ActiveSessions")
                    .unit(StandardUnit::Count)
                    .value(active_sessions as f64)
                    .set_dimensions(Some(dimensions.clone()))
                    .build(),
            );

            data.push(
                MetricDatum::builder()
                    .metric_name("BytesEgress")
                    .unit(StandardUnit::Bytes)
                    .value(bytes_delta as f64)
                    .set_dimensions(Some(dimensions.clone()))
                    .build(),
            );

            // Per protocol metrics
            let per_active = get_per_protocol_active(&protocols);
            let per_egress = get_per_protocol_egress_delta(&protocols);
            for (proto, active) in per_active {
                let mut dims = dimensions.clone();
                dims.push(Dimension::builder().name("Protocol").value(proto.clone()).build());
                data.push(
                    MetricDatum::builder()
                        .metric_name("ActiveSessions")
                        .unit(StandardUnit::Count)
                        .value(active as f64)
                        .set_dimensions(Some(dims.clone()))
                        .build(),
                );
            }
            for (proto, egress) in per_egress {
                let mut dims = dimensions.clone();
                dims.push(Dimension::builder().name("Protocol").value(proto.clone()).build());
                data.push(
                    MetricDatum::builder()
                        .metric_name("BytesEgress")
                        .unit(StandardUnit::Bytes)
                        .value(egress as f64)
                        .set_dimensions(Some(dims.clone()))
                        .build(),
                );
            }

            if let Err(err) = client
                .put_metric_data()
                .namespace(NAMESPACE)
                .set_metric_data(Some(data))
                .send()
                .await
            {
                error!(error = ?err, "cloudwatch_publish_error");
            } else {
                debug!(active_sessions, bytes_delta, "cloudwatch_publish_success");
            }

            sleep(Duration::from_secs(interval)).await;
        }
    });
}

