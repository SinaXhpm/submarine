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
    pub server_host: String,
    pub server_port: u16,
    pub db: Arc<std::sync::Mutex<Option<rusqlite::Connection>>>,
    pub fp_rx: Option<oneshot::Receiver<bool>>,
}

#[async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(mut self, server_public_key: &PublicKey) -> Result<(Self, bool), Self::Error> {
        let fingerprint = server_public_key.fingerprint();
        let key_type = server_public_key.name();
        let fp_str = fingerprint.to_string();

        let _ = self.app.emit(&format!("session-log-{}", self.session_id), serde_json::json!({
            "msg": format!("Server offered key ({}): {}", key_type, fp_str),
            "type": "info"
        }));

        // 1. Check if the key is already in known_hosts database
        let mut is_known = false;
        if let Some(ref conn) = *self.db.lock().unwrap() {
            let stmt = conn.prepare("SELECT fingerprint FROM known_hosts WHERE host=?1 AND port=?2").ok();
            if let Some(mut stmt) = stmt {
                let rows = stmt.query(rusqlite::params![self.server_host, self.server_port]).ok();
                if let Some(mut rows) = rows {
                    while let Some(row) = rows.next().ok().flatten() {
                        if let Some(saved_fp) = row.get::<_, String>(0).ok() {
                            if saved_fp == fp_str {
                                is_known = true;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if is_known {
            let _ = self.app.emit(&format!("session-log-{}", self.session_id), serde_json::json!({
                "msg": "Host fingerprint found in known_hosts database. Verified.",
                "type": "success"
            }));
            return Ok((self, true));
        }

        // 2. Not known, prompt user
        let _ = self.app.emit(&format!("session-log-{}", self.session_id), serde_json::json!({
            "msg": "Host fingerprint is unknown. Waiting for user approval...",
            "type": "warn"
        }));

        let _ = self.app.emit(&format!("fingerprint-prompt-{}", self.session_id), serde_json::json!({
            "host": self.server_host,
            "keyType": key_type,
            "fingerprint": fp_str
        }));

        if let Some(rx) = self.fp_rx.take() {
            match tokio::time::timeout(tokio::time::Duration::from_secs(10), rx).await {
                Ok(Ok(true)) => {
                    // Save to database
                    if let Some(ref conn) = *self.db.lock().unwrap() {
                        let _ = conn.execute(
                            "INSERT INTO known_hosts (host, port, fingerprint) VALUES (?1, ?2, ?3)",
                            rusqlite::params![self.server_host, self.server_port, fp_str]
                        );
                    }
                    let _ = self.app.emit(&format!("session-log-{}", self.session_id), serde_json::json!({
                        "msg": "Host key accepted and saved.",
                        "type": "success"
                    }));
                    Ok((self, true))
                }
                Ok(Ok(false)) => {
                    let _ = self.app.emit(&format!("session-log-{}", self.session_id), serde_json::json!({
                        "msg": "Host key rejected by user.",
                        "type": "error"
                    }));
                    let _ = self.app.emit(&format!("fingerprint-prompt-dismiss-{}", self.session_id), serde_json::json!({}));
                    Ok((self, false))
                }
                Err(_) => {
                    let _ = self.app.emit(&format!("session-log-{}", self.session_id), serde_json::json!({
                        "msg": "Host key verification timed out (no response from user within 10 seconds).",
                        "type": "error"
                    }));
                    let _ = self.app.emit(&format!("fingerprint-prompt-dismiss-{}", self.session_id), serde_json::json!({}));
                    Ok((self, false))
                }
                _ => {
                    let _ = self.app.emit(&format!("session-log-{}", self.session_id), serde_json::json!({
                        "msg": "Host key verification aborted.",
                        "type": "error"
                    }));
                    let _ = self.app.emit(&format!("fingerprint-prompt-dismiss-{}", self.session_id), serde_json::json!({}));
                    Ok((self, false))
                }
            }
        } else {
            Ok((self, false))
        }
    }
}

