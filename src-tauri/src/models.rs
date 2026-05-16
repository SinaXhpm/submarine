use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Folder {
    pub id: i32,
    pub name: String,
    pub parent_id: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SshKey {
    pub id: i32,
    pub name: String,
    pub public_key: String,
    pub private_key: String,
    pub passphrase: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Credential {
    pub id: i32,
    pub name: String,
    pub auth_type: String, 
    pub username: String,
    pub password: Option<String>,
    pub key_id: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PortForward {
    pub kind: String, 
    pub local_address: String,
    pub local_port: u16,
    pub remote_address: Option<String>,
    pub remote_port: Option<u16>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Server {
    pub id: i32,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub credential_id: Option<i32>,
    pub folder_id: Option<i32>,
    pub proxy_type: String,
    pub proxy_host: Option<String>,
    pub proxy_port: Option<u16>,
    pub proxy_user: Option<String>,
    pub proxy_pass: Option<String>,
    pub tunnels: Vec<PortForward>,
}