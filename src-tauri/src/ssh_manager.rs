use russh::client;
use russh_keys::key::PublicKey;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot, Mutex};
use async_trait::async_trait;

pub enum TerminalCommand {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
}

pub struct SshState {
    pub fp_txs: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
    pub connections: Arc<Mutex<HashMap<String, Arc<Mutex<client::Handle<ClientHandler>>>>>>,
    pub terminal_txs: Arc<Mutex<HashMap<String, mpsc::Sender<TerminalCommand>>>>,
}

impl SshState {
    pub fn new() -> Self {
        Self {
            fp_txs: Arc::new(Mutex::new(HashMap::new())),
            connections: Arc::new(Mutex::new(HashMap::new())),
            terminal_txs: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

pub struct ClientHandler {
    pub app: AppHandle,
    pub session_id: String,
    pub fp_rx: Option<oneshot::Receiver<bool>>,
}

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(mut self, server_public_key: &PublicKey) -> Result<(Self, bool), Self::Error> {
        // Auto-accept the fingerprint to prevent getting stuck waiting during Phase 1
        let fingerprint = server_public_key.fingerprint();
        let key_type = server_public_key.name();

        let _ = self.app.emit(&format!("session-log-{}", self.session_id), serde_json::json!({
            "msg": format!("Auto-accepted host key ({}): {}", key_type, fingerprint),
            "type": "success"
        }));

        Ok((self, true))
    }
}
