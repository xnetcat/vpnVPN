use tokio::io::AsyncReadExt;
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tracing::info;

pub async fn run_udp(port: u16) {
    let addr = format!("0.0.0.0:{}", port);
    let socket = UdpSocket::bind(&addr).await.expect("bind udp");
    let mut buf = vec![0u8; 2048];
    loop {
        if let Ok((_n, _peer)) = socket.recv_from(&mut buf).await {
            // Discard; placeholder
        }
    }
}

async fn handle_tcp(mut stream: TcpStream) {
    let mut buf = [0u8; 1024];
    let _ = stream.read(&mut buf).await; // discard
}

pub async fn run_tcp(port: u16) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.expect("bind tcp");
    loop {
        if let Ok((stream, _)) = listener.accept().await {
            tokio::spawn(handle_tcp(stream));
        }
    }
}


