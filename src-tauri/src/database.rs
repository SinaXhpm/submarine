use rusqlite::{Connection, Result};
use std::sync::Mutex;
use std::path::PathBuf;
use std::fs;

pub struct DbState {
    pub conn: Mutex<Option<Connection>>,
    pub master_key: Mutex<Option<[u8; 32]>>,
    pub db_path: Mutex<Option<PathBuf>>,
}

pub fn create_empty_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
        CREATE TABLE folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER
        );
        CREATE TABLE ssh_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            public_key TEXT,
            private_key TEXT,
            passphrase TEXT
        );
        CREATE TABLE credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            auth_type TEXT,
            username TEXT,
            password TEXT,
            key_id INTEGER,
            FOREIGN KEY(key_id) REFERENCES ssh_keys(id)
        );
        CREATE TABLE servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            host TEXT,
            port INTEGER,
            username TEXT,
            password TEXT,
            credential_id INTEGER,
            folder_id INTEGER,
            proxy_type TEXT DEFAULT 'none',
            proxy_host TEXT,
            proxy_port INTEGER,
            proxy_user TEXT,
            proxy_pass TEXT,
            tunnels TEXT,
            FOREIGN KEY(credential_id) REFERENCES credentials(id),
            FOREIGN KEY(folder_id) REFERENCES folders(id)
        );"
    ).unwrap();
    conn
}

pub fn save_vault(state: &DbState) -> Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    let key_guard = state.master_key.lock().unwrap();
    let path_guard = state.db_path.lock().unwrap();

    if let (Some(conn), Some(key), Some(path)) = (&*conn_guard, &*key_guard, &*path_guard) {
        let temp_path = std::env::temp_dir().join("omni_vault_sync.db");
        {
            let mut temp_conn = Connection::open(&temp_path).map_err(|e| e.to_string())?;
            let backup = rusqlite::backup::Backup::new(conn, &mut temp_conn).map_err(|e| e.to_string())?;
            backup.run_to_completion(5, std::time::Duration::from_millis(10), None).map_err(|e| e.to_string())?;
        }
        
        let db_bytes = fs::read(&temp_path).map_err(|e| e.to_string())?;
        let encrypted = crate::auth::encrypt_vault(&db_bytes, key);
        fs::write(path, encrypted).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(temp_path);
    }
    Ok(())
}