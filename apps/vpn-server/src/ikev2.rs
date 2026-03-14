use crate::pki::{CA_PEM, PKI_DIR, SERVER_KEY, SERVER_PEM};
use anyhow::{anyhow, Context, Result};
use std::{fs, path::Path, process::Command};
use tracing::{info, warn};
use zeroize::Zeroizing;

#[derive(Debug, Clone)]
pub struct IkeMetadata {
    pub remote: String,
    pub ca_pem: String,
    pub server_fingerprint: String,
}

pub fn setup_ikev2(
    public_ip: Option<String>,
    ca_pem: &str,
    server_pem: &str,
    server_fingerprint: &str,
) -> Result<IkeMetadata> {
    let enabled = std::env::var("IKEV2_ENABLED")
        .ok()
        .map(|v| v.to_lowercase() != "false")
        .unwrap_or(true);
    if !enabled {
        info!("ikev2 disabled via IKEV2_ENABLED=false");
        return Err(anyhow!("ikev2 disabled"));
    }

    let base = Path::new("/etc/ipsec.d");
    let cacerts = base.join("cacerts");
    let certs = base.join("certs");
    let private = base.join("private");
    fs::create_dir_all(&cacerts).context("create cacerts")?;
    fs::create_dir_all(&certs).context("create certs")?;
    fs::create_dir_all(&private).context("create private")?;

    let ca_path = cacerts.join(CA_PEM);
    let server_path = certs.join(SERVER_PEM);
    let key_path = private.join(SERVER_KEY);

    fs::write(&ca_path, ca_pem).context("write ikev2 ca pem")?;
    fs::write(&server_path, server_pem).context("write ikev2 server pem")?;
    let stored_key = Zeroizing::new(
        fs::read_to_string(Path::new(PKI_DIR).join(SERVER_KEY))
            .context("read generated server key")?
    );
    fs::write(&key_path, stored_key.as_str()).context("write ikev2 server key")?;
    drop(stored_key);

    // Restrict permissions on private key
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&key_path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&key_path, perms)?;
    }

    let id = std::env::var("IKEV2_IDENTITY")
        .ok()
        .or_else(|| public_ip.clone())
        .unwrap_or_else(|| "vpnvpn-ikev2".to_string());
    let remote = std::env::var("IKEV2_REMOTE")
        .ok()
        .or_else(|| public_ip.clone())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let pool_v4 = std::env::var("IKEV2_POOL_V4").unwrap_or_else(|_| "10.9.0.0/24".to_string());
    let pool_v6 = std::env::var("IKEV2_POOL_V6").unwrap_or_else(|_| "fd42:42:42::/64".to_string());
    let ike_port = std::env::var("IKEV2_PORT").unwrap_or_else(|_| "500".to_string());

    let ipsec_conf = format!(
        r#"
config setup
    charondebug="ike 1, cfg 1"

# EAP-TLS connection (preferred — certificate-based, no password cracking possible)
conn ikev2-eaptls
    keyexchange=ikev2
    auto=add
    ike=aes256-sha256-ecp256,aes256-sha256-modp2048
    esp=aes256-sha256-ecp256,aes256-sha256
    left=%any
    leftid={id}
    leftcert=server.pem
    leftsendcert=always
    leftsubnet=0.0.0.0/0,::/0
    leftauth=pubkey
    right=%any
    rightid=%any
    rightauth=eap-tls
    rightca="CN=vpnvpn-ca"
    eap_identity=%identity
    rightsourceip={pool_v4},{pool_v6}
    dpdaction=clear
    dpddelay=30s
    fragmentation=yes
    rekey=yes
    mobike=yes
    forceencaps=yes
    leftikeport={port}
    rightikeport={port}

# EAP-MSCHAPv2 fallback (for clients without certificates)
conn ikev2-eap
    keyexchange=ikev2
    auto=add
    ike=aes256-sha256-ecp256,aes256-sha256-modp2048
    esp=aes256-sha256-ecp256,aes256-sha256
    left=%any
    leftid={id}
    leftcert=server.pem
    leftsendcert=always
    leftsubnet=0.0.0.0/0,::/0
    leftauth=pubkey
    right=%any
    rightid=%any
    rightauth=eap-mschapv2
    eap_identity=%identity
    rightsourceip={pool_v4},{pool_v6}
    dpdaction=clear
    dpddelay=30s
    fragmentation=yes
    rekey=yes
    mobike=yes
    forceencaps=yes
    leftikeport={port}
    rightikeport={port}
"#,
        id = id,
        pool_v4 = pool_v4,
        pool_v6 = pool_v6,
        port = ike_port
    );

    fs::write("/etc/ipsec.conf", ipsec_conf).context("write ipsec.conf")?;

    let secrets = format!(
        ": ECDSA {}\n",
        key_path
            .to_str()
            .ok_or_else(|| anyhow!("invalid key path"))?
    );
    fs::write("/etc/ipsec.secrets", &secrets).context("write ipsec.secrets")?;
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata("/etc/ipsec.secrets")?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions("/etc/ipsec.secrets", perms)?;
    }

    let stop = Command::new("ipsec").arg("stop").output().ok();
    if let Some(out) = stop {
        if !out.status.success() {
            warn!("ipsec stop returned non-zero");
        }
    }

    let start = Command::new("ipsec")
        .args(["start", "--nofork"])
        .spawn()
        .context("spawn ipsec start")?;
    info!("spawned ipsec with pid {}", start.id());

    Ok(IkeMetadata {
        remote: format!("{remote}:{}", ike_port),
        ca_pem: ca_pem.to_string(),
        server_fingerprint: server_fingerprint.to_string(),
    })
}
