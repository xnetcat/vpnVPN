use anyhow::{anyhow, Context, Result};
use rcgen::{
    BasicConstraints, Certificate, CertificateParams, DistinguishedName, DnType, IsCa, SanType,
    PKCS_ECDSA_P256_SHA256,
};
use sha2::{Digest, Sha256};
use std::os::unix::fs::PermissionsExt;
use std::{fs, path::Path};
use zeroize::Zeroizing;

pub const PKI_DIR: &str = "/etc/vpnvpn/pki";
pub const CA_PEM: &str = "ca.pem";
pub const SERVER_PEM: &str = "server.pem";
pub const SERVER_KEY: &str = "server.key";
pub const TLS_CRYPT_KEY: &str = "tls-crypt.key";

pub struct PkiArtifacts {
    pub ca_pem: String,
    pub server_pem: String,
    pub server_fingerprint: String,
}

/// Set restrictive permissions (0o600) on a file containing sensitive material.
fn restrict_permissions(path: &Path) -> Result<()> {
    let mut perms = fs::metadata(path)
        .with_context(|| format!("stat {}", path.display()))?
        .permissions();
    perms.set_mode(0o600);
    fs::set_permissions(path, perms)
        .with_context(|| format!("chmod 0600 {}", path.display()))?;
    Ok(())
}

/// Set restrictive permissions (0o700) on a directory containing sensitive material.
fn restrict_dir_permissions(path: &Path) -> Result<()> {
    let mut perms = fs::metadata(path)
        .with_context(|| format!("stat {}", path.display()))?
        .permissions();
    perms.set_mode(0o700);
    fs::set_permissions(path, perms)
        .with_context(|| format!("chmod 0700 {}", path.display()))?;
    Ok(())
}

pub fn ensure_pki(public_ip: Option<String>) -> Result<PkiArtifacts> {
    // If env already provides OVPN bundle/fingerprint, respect it and skip generation.
    if std::env::var("VPN_OVPN_CA_BUNDLE").is_ok()
        && std::env::var("VPN_OVPN_PEER_FINGERPRINT").is_ok()
    {
        let ca = std::env::var("VPN_OVPN_CA_BUNDLE").unwrap_or_default();
        let fp = std::env::var("VPN_OVPN_PEER_FINGERPRINT").unwrap_or_default();
        let server_pem =
            fs::read_to_string(Path::new(PKI_DIR).join(SERVER_PEM)).unwrap_or_default();
        return Ok(PkiArtifacts {
            ca_pem: ca,
            server_pem,
            server_fingerprint: fp,
        });
    }

    fs::create_dir_all(PKI_DIR).context("create pki dir")?;
    restrict_dir_permissions(Path::new(PKI_DIR))?;

    let ca_pem_path = Path::new(PKI_DIR).join(CA_PEM);
    let server_pem_path = Path::new(PKI_DIR).join(SERVER_PEM);
    let server_key_path = Path::new(PKI_DIR).join(SERVER_KEY);

    // If CA and server already exist, use them
    if ca_pem_path.exists() && server_pem_path.exists() {
        let ca_pem = fs::read_to_string(&ca_pem_path).context("read existing ca pem")?;
        let server_pem =
            fs::read_to_string(&server_pem_path).context("read existing server pem")?;
        let fingerprint = fingerprint_pem(&server_pem)?;
        return Ok(PkiArtifacts {
            ca_pem,
            server_pem,
            server_fingerprint: fingerprint,
        });
    }

    // Generate fresh CA and server cert with explicit algorithm and constraints
    let mut ca_params = CertificateParams::default();
    ca_params.alg = &PKCS_ECDSA_P256_SHA256;
    ca_params.is_ca = IsCa::Ca(BasicConstraints::Constrained(0));
    ca_params.distinguished_name = DistinguishedName::new();
    ca_params
        .distinguished_name
        .push(DnType::CommonName, "vpnvpn-ca");
    let ca_cert = Certificate::from_params(ca_params)?;
    let ca_pem = ca_cert.serialize_pem()?;
    fs::write(&ca_pem_path, &ca_pem).context("write ca pem")?;
    // CA private key is only needed during this function to sign the server cert.
    // Do not persist it to disk to reduce exposure surface.

    let mut server_params = CertificateParams::new(vec!["vpnvpn-server".into()]);
    server_params.alg = &PKCS_ECDSA_P256_SHA256;
    if let Some(ip) = public_ip {
        if let Ok(parsed_ip) = ip.parse() {
            server_params
                .subject_alt_names
                .push(SanType::IpAddress(parsed_ip));
        }
    }
    server_params.distinguished_name = DistinguishedName::new();
    server_params
        .distinguished_name
        .push(DnType::CommonName, "vpnvpn-server");
    server_params.is_ca = IsCa::NoCa;
    server_params.use_authority_key_identifier_extension = true;
    let server_cert = Certificate::from_params(server_params)?;
    let server_pem = server_cert.serialize_pem_with_signer(&ca_cert)?;
    fs::write(&server_pem_path, &server_pem).context("write server pem")?;
    // Wrap server key in Zeroizing to clear from memory after write
    let server_key_pem = Zeroizing::new(server_cert.serialize_private_key_pem());
    fs::write(&server_key_path, server_key_pem.as_str())
        .context("write server key")?;
    drop(server_key_pem);
    restrict_permissions(&server_key_path)?;

    let fingerprint = fingerprint_pem(&server_pem)?;

    Ok(PkiArtifacts {
        ca_pem,
        server_pem,
        server_fingerprint: fingerprint,
    })
}

pub fn ensure_tls_crypt_key() -> Result<String> {
    let key_path = Path::new(PKI_DIR).join(TLS_CRYPT_KEY);
    if key_path.exists() {
        return fs::read_to_string(&key_path).context("read existing tls-crypt key");
    }

    fs::create_dir_all(PKI_DIR).context("create pki dir")?;
    restrict_dir_permissions(Path::new(PKI_DIR))?;

    let key_path_str = key_path
        .to_str()
        .ok_or_else(|| anyhow!("invalid tls-crypt key path"))?;

    let status = std::process::Command::new("openvpn")
        .args(["--genkey", "secret", key_path_str])
        .status()
        .context("run openvpn --genkey")?;

    if !status.success() {
        return Err(anyhow!("openvpn --genkey failed"));
    }

    restrict_permissions(&key_path)?;
    fs::read_to_string(&key_path).context("read generated tls-crypt key")
}

fn pem_to_der(pem: &str) -> Result<Vec<u8>> {
    let stripped = pem
        .lines()
        .filter(|l| !l.starts_with("-----"))
        .collect::<String>();
    let der = base64::decode(stripped).map_err(|e| anyhow!("pem base64 decode failed: {e}"))?;
    Ok(der)
}

fn fingerprint_pem(pem: &str) -> Result<String> {
    let der = pem_to_der(pem)?;
    let digest = Sha256::digest(&der);
    Ok(digest
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(":"))
}
