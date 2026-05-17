#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
use argon2::{password_hash::{PasswordHasher, SaltString}, Argon2};
use rand::Rng;
use rusqlite::Connection;
use std::sync::Mutex as StdMutex;
use std::path::PathBuf;
use std::fs;
use tauri::Manager;
use serde_json::json;
use ssh_key::{private::Ed25519Keypair, rand_core::OsRng, PrivateKey};
mod ssh_manager;
use ssh_manager::SshState;

pub struct DbState {
    pub conn: std::sync::Arc<StdMutex<Option<Connection>>>,
    pub master_key: StdMutex<Option<[u8; 32]>>,
    pub db_path: StdMutex<Option<PathBuf>>,
}

pub fn derive_key(password: &str) -> [u8; 32] {
    let salt = SaltString::encode_b64(b"___Carpe_Diem___").unwrap();
    let argon2 = Argon2::default();
    let password_hash = argon2.hash_password(password.as_bytes(), &salt).unwrap();
    let mut key = [0u8; 32];
    key.copy_from_slice(password_hash.hash.unwrap().as_bytes());
    key
}

pub fn encrypt_vault(data: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let cipher = Aes256Gcm::new(key.into());
    let nonce_bytes = rand::thread_rng().gen::<[u8; 12]>();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, data).expect("encryption failure");
    let mut out = nonce_bytes.to_vec();
    out.extend(ciphertext);
    out
}

pub fn decrypt_vault(encrypted_data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    if encrypted_data.len() < 12 { 
        return Err("[CRYPTO] INVALID_VAULT_SIZE: Data too short to contain nonce".into()); 
    }
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(&encrypted_data[..12]);
    cipher.decrypt(nonce, &encrypted_data[12..])
        .map_err(|e| format!("[CRYPTO] DECRYPT_FAILURE: Possible wrong key or corrupted data. Details: {}", e))
}

fn save_vault_internal(state: &DbState) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] MUTEX_POISON_CONN")?;
    let key_guard = state.master_key.lock().map_err(|_| "[STATE] MUTEX_POISON_KEY")?;
    let path_guard = state.db_path.lock().map_err(|_| "[STATE] MUTEX_POISON_PATH")?;

    if let (Some(conn), Some(key), Some(path)) = (&*conn_guard, &*key_guard, &*path_guard) {
        let temp_file = std::env::temp_dir().join("omni_sync.db");
        {
            let mut backup_conn = Connection::open(&temp_file)
                .map_err(|e| format!("[FILE] TEMP_DB_OPEN_FAILED: {}", e))?;
            let backup = rusqlite::backup::Backup::new(conn, &mut backup_conn)
                .map_err(|e| format!("[DATABASE] BACKUP_INIT_FAILED: {}", e))?;
            backup.run_to_completion(5, std::time::Duration::from_millis(10), None)
                .map_err(|e| format!("[DATABASE] BACKUP_RUN_FAILED: {}", e))?;
        }
        let db_bytes = fs::read(&temp_file)
            .map_err(|e| format!("[FILE] READ_TEMP_FAILED: {}", e))?;
        let encrypted = encrypt_vault(&db_bytes, key);
        fs::write(path, encrypted)
            .map_err(|e| format!("[FILE] VAULT_WRITE_FAILED at {:?}: {}", path, e))?;
        let _ = fs::remove_file(temp_file);
    } else {
        return Err("[STATE] MISSING_REQUIRED_RESOURCES_FOR_SAVE".into());
    }
    Ok(())
}

#[tauri::command]
async fn check_db_exists(app_handle: tauri::AppHandle) -> bool {
    let data_dir = app_handle.path().app_data_dir().unwrap();
    data_dir.join("omni.vault").exists()
}

#[tauri::command]
async fn setup_master_db(app_handle: tauri::AppHandle, password: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("[SYSTEM] APP_DATA_DIR_NOT_FOUND: {}", e))?;
    
    if !data_dir.exists() { 
        fs::create_dir_all(&data_dir).map_err(|e| format!("[FILE] DIR_CREATION_FAILED: {}", e))?; 
    }
    
    let path = data_dir.join("omni.vault");
    let key = derive_key(&password);
    let conn;

    if path.exists() {
        let encrypted_data = fs::read(&path)
            .map_err(|e| format!("[FILE] VAULT_READ_FAILED: {}", e))?;
        let decrypted_data = decrypt_vault(&encrypted_data, &key)?;
        let temp_db = data_dir.join("temp_load.db");
        fs::write(&temp_db, decrypted_data)
            .map_err(|e| format!("[FILE] TEMP_WRITE_FAILED: {}", e))?;
        
        let disk_conn = Connection::open(&temp_db)
            .map_err(|e| format!("[DATABASE] DISK_TEMP_OPEN_FAILED: {}", e))?;
        let mut mem_conn = Connection::open_in_memory()
            .map_err(|e| format!("[DATABASE] MEM_INIT_FAILED: {}", e))?;
        
        {
            let backup = rusqlite::backup::Backup::new(&disk_conn, &mut mem_conn)
                .map_err(|e| format!("[DATABASE] RESTORE_INIT_FAILED: {}", e))?;
            backup.run_to_completion(5, std::time::Duration::from_millis(1), None)
                .map_err(|e| format!("[DATABASE] RESTORE_RUN_FAILED: {}", e))?;
        }
        let _ = fs::remove_file(temp_db);
        conn = mem_conn;

        // Migrations for older DB versions
        let _ = conn.execute("CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, parent_id INTEGER)", []);
        let _ = conn.execute("ALTER TABLE servers ADD COLUMN folder_id INTEGER REFERENCES folders(id)", []);
        let _ = conn.execute("CREATE TABLE IF NOT EXISTS commands (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT)", []);
        let _ = conn.execute("CREATE TABLE IF NOT EXISTS known_hosts (id INTEGER PRIMARY KEY AUTOINCREMENT, host TEXT, port INTEGER, fingerprint TEXT)", []);
        
    } else {
        conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, parent_id INTEGER);
             CREATE TABLE ssh_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, public_key TEXT, private_key TEXT, passphrase TEXT);
             CREATE TABLE credentials (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, auth_type TEXT, username TEXT, password TEXT, key_id INTEGER, FOREIGN KEY(key_id) REFERENCES ssh_keys(id));
             CREATE TABLE servers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, host TEXT, port INTEGER, username TEXT, credential_id INTEGER, folder_id INTEGER, proxy_type TEXT, proxy_host TEXT, proxy_port INTEGER, tunnels TEXT, FOREIGN KEY(folder_id) REFERENCES folders(id));
             CREATE TABLE commands (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT);
             CREATE TABLE known_hosts (id INTEGER PRIMARY KEY AUTOINCREMENT, host TEXT, port INTEGER, fingerprint TEXT);"
        ).map_err(|e| format!("[DATABASE] SCHEMA_CREATION_FAILED: {}", e))?;
    }

    conn.execute("PRAGMA foreign_keys = ON", []).map_err(|e| format!("[DATABASE] PRAGMA_FAILED: {}", e))?;
    
    *state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED_CONN")? = Some(conn);
    *state.master_key.lock().map_err(|_| "[STATE] LOCK_FAILED_KEY")? = Some(key);
    *state.db_path.lock().map_err(|_| "[STATE] LOCK_FAILED_PATH")? = Some(path);
    
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn reset_db(app_handle: tauri::AppHandle, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let data_dir = app_handle.path().app_data_dir().unwrap();
    let path = data_dir.join("omni.vault");
    if path.exists() { 
        fs::remove_file(path).map_err(|e| format!("[FILE] DELETE_VAULT_FAILED: {}", e))?; 
    }
    *state.conn.lock().unwrap() = None;
    *state.master_key.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
async fn generate_ssh_key(state: tauri::State<'_, DbState>, name: String) -> Result<(), String> {
    let keypair = Ed25519Keypair::random(&mut OsRng);
    let priv_key = PrivateKey::from(keypair);
    let pub_ssh = priv_key.public_key().to_openssh()
        .map_err(|e| format!("[SSH] PUB_EXPORT_FAILED: {}", e))?;
    let priv_ssh = priv_key.to_openssh(ssh_key::LineEnding::LF)
        .map_err(|e| format!("[SSH] PRIV_EXPORT_FAILED: {}", e))?.to_string();

    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute("INSERT INTO ssh_keys (name, public_key, private_key) VALUES (?1, ?2, ?3)", rusqlite::params![name, pub_ssh, priv_ssh])
        .map_err(|e| format!("[DATABASE] KEY_INSERT_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn add_ssh_key(state: tauri::State<'_, DbState>, name: String, public_key: String, private_key: String, passphrase: Option<String>) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute("INSERT INTO ssh_keys (name, public_key, private_key, passphrase) VALUES (?1, ?2, ?3, ?4)", rusqlite::params![name, public_key, private_key, passphrase])
        .map_err(|e| format!("[DATABASE] KEY_INSERT_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn edit_ssh_key(state: tauri::State<'_, DbState>, id: i32, name: String, public_key: String, private_key: String, passphrase: Option<String>) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute("UPDATE ssh_keys SET name=?1, public_key=?2, private_key=?3, passphrase=?4 WHERE id=?5", rusqlite::params![name, public_key, private_key, passphrase, id])
        .map_err(|e| format!("[DATABASE] KEY_UPDATE_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn delete_ssh_key(state: tauri::State<'_, DbState>, id: i32) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute("DELETE FROM ssh_keys WHERE id=?1", rusqlite::params![id])
        .map_err(|e| format!("[DATABASE] KEY_DELETE_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn add_server(
    state: tauri::State<'_, DbState>, 
    name: String, 
    host: String, 
    port: i32, 
    username: String, 
    password: Option<String>,
    credential_id: Option<i32>, 
    folder_id: Option<i32>,
    proxy_type: String, 
    proxy_host: String, 
    proxy_port: i32, 
    tunnels: Vec<serde_json::Value>
) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    // Auto-migrate to add password if not exists
    let _ = conn.execute("ALTER TABLE servers ADD COLUMN password TEXT", []);

    let tunnels_json = serde_json::to_string(&tunnels).unwrap_or_else(|_| "[]".to_string());

    let res = conn.execute(
        "INSERT INTO servers (name, host, port, username, password, credential_id, folder_id, proxy_type, proxy_host, proxy_port, tunnels) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![name, host, port, username, password, credential_id, folder_id, proxy_type, proxy_host, proxy_port, tunnels_json],
    ).map_err(|e| format!("[DATABASE] SERVER_INSERT_FAILED: SQL_ERROR={}", e))?;

    if res == 0 {
        return Err("[DATABASE] SERVER_INSERT_FAILED: No rows affected".into());
    }

    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn edit_server(
    state: tauri::State<'_, DbState>, 
    id: i32,
    name: String, 
    host: String, 
    port: i32, 
    username: String, 
    password: Option<String>,
    credential_id: Option<i32>, 
    folder_id: Option<i32>,
    proxy_type: String, 
    proxy_host: String, 
    proxy_port: i32, 
    tunnels: Vec<serde_json::Value>
) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    // Auto-migrate to add password if not exists
    let _ = conn.execute("ALTER TABLE servers ADD COLUMN password TEXT", []);

    let tunnels_json = serde_json::to_string(&tunnels).unwrap_or_else(|_| "[]".to_string());

    conn.execute(
        "UPDATE servers SET name=?1, host=?2, port=?3, username=?4, password=?5, credential_id=?6, folder_id=?7, proxy_type=?8, proxy_host=?9, proxy_port=?10, tunnels=?11 WHERE id=?12",
        rusqlite::params![name, host, port, username, password, credential_id, folder_id, proxy_type, proxy_host, proxy_port, tunnels_json, id],
    ).map_err(|e| format!("[DATABASE] SERVER_UPDATE_FAILED: SQL_ERROR={}", e))?;

    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn delete_server(state: tauri::State<'_, DbState>, id: i32) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute("DELETE FROM servers WHERE id=?1", rusqlite::params![id])
        .map_err(|e| format!("[DATABASE] SERVER_DELETE_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn get_servers(state: tauri::State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    let mut stmt = conn.prepare("SELECT id, name, host, port, username, password, credential_id, folder_id, proxy_type, proxy_host, proxy_port, tunnels FROM servers")
        .map_err(|e| format!("[DATABASE] PREPARE_FAILED: {}", e))?;
    
    let rows = stmt.query_map([], |row| {
        Ok(json!({
            "id": row.get::<_, i32>(0)?,
            "name": row.get::<_, String>(1)?,
            "host": row.get::<_, String>(2)?,
            "port": row.get::<_, i32>(3)?,
            "username": row.get::<_, String>(4)?,
            "password": row.get::<_, Option<String>>(5)?,
            "credential_id": row.get::<_, Option<i32>>(6)?,
            "folder_id": row.get::<_, Option<i32>>(7)?,
            "proxy_type": row.get::<_, String>(8)?,
            "proxy_host": row.get::<_, String>(9)?,
            "proxy_port": row.get::<_, i32>(10)?,
            "tunnels": row.get::<_, String>(11)?,
        }))
    }).map_err(|e| format!("[DATABASE] QUERY_MAPPING_FAILED: {}", e))?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r.map_err(|e| format!("[DATABASE] ROW_FETCH_FAILED: {}", e))?);
    }
    Ok(list)
}

#[tauri::command]
async fn get_ssh_keys(state: tauri::State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INIT")?;
    let mut stmt = conn.prepare("SELECT id, name, public_key, private_key, passphrase FROM ssh_keys").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(json!({
            "id": row.get::<_, i32>(0)?, 
            "name": row.get::<_, String>(1)?, 
            "public_key": row.get::<_, String>(2)?,
            "private_key": row.get::<_, String>(3)?,
            "passphrase": row.get::<_, Option<String>>(4)?
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut list = Vec::new();
    for r in rows { list.push(r.unwrap()); }
    Ok(list)
}

#[tauri::command]
async fn get_credentials(state: tauri::State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INIT")?;
    let mut stmt = conn.prepare("SELECT id, name, auth_type, username, password, key_id FROM credentials").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(json!({
            "id": row.get::<_, i32>(0)?, 
            "name": row.get::<_, String>(1)?, 
            "auth_type": row.get::<_, String>(2)?,
            "username": row.get::<_, String>(3)?,
            "password": row.get::<_, Option<String>>(4)?,
            "key_id": row.get::<_, Option<i32>>(5)?
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut list = Vec::new();
    for r in rows { list.push(r.unwrap()); }
    Ok(list)
}

#[tauri::command]
async fn add_credential(state: tauri::State<'_, DbState>, name: String, auth_type: String, username: String, password: Option<String>, key_id: Option<i32>) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute("INSERT INTO credentials (name, auth_type, username, password, key_id) VALUES (?1, ?2, ?3, ?4, ?5)", rusqlite::params![name, auth_type, username, password, key_id])
        .map_err(|e| format!("[DATABASE] CREDENTIAL_INSERT_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn edit_credential(state: tauri::State<'_, DbState>, id: i32, name: String, auth_type: String, username: String, password: Option<String>, key_id: Option<i32>) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute("UPDATE credentials SET name=?1, auth_type=?2, username=?3, password=?4, key_id=?5 WHERE id=?6", rusqlite::params![name, auth_type, username, password, key_id, id])
        .map_err(|e| format!("[DATABASE] CREDENTIAL_UPDATE_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn delete_credential(state: tauri::State<'_, DbState>, id: i32) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute("DELETE FROM credentials WHERE id=?1", rusqlite::params![id])
        .map_err(|e| format!("[DATABASE] CREDENTIAL_DELETE_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn add_folder(state: tauri::State<'_, DbState>, name: String, parent_id: Option<i32>) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute(
        "INSERT INTO folders (name, parent_id) VALUES (?1, ?2)",
        rusqlite::params![name, parent_id],
    ).map_err(|e| format!("[DATABASE] FOLDER_INSERT_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn delete_folder(state: tauri::State<'_, DbState>, id: i32) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    // First, delete all servers in this folder
    conn.execute("DELETE FROM servers WHERE folder_id=?1", rusqlite::params![id])
        .map_err(|e| format!("[DATABASE] FOLDER_SERVERS_DELETE_FAILED: {}", e))?;
        
    // Then delete the folder
    conn.execute("DELETE FROM folders WHERE id=?1", rusqlite::params![id])
        .map_err(|e| format!("[DATABASE] FOLDER_DELETE_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn get_folders(state: tauri::State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INIT")?;
    let mut stmt = conn.prepare("SELECT id, name, parent_id FROM folders").map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(json!({
            "id": row.get::<_, i32>(0)?, 
            "name": row.get::<_, String>(1)?, 
            "parent_id": row.get::<_, Option<i32>>(2)?
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut list = Vec::new();
    for r in rows { list.push(r.unwrap()); }
    Ok(list)
}

#[tauri::command]
async fn add_command(state: tauri::State<'_, DbState>, title: String, content: String) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute(
        "INSERT INTO commands (title, content) VALUES (?1, ?2)",
        rusqlite::params![title, content],
    ).map_err(|e| format!("[DATABASE] COMMAND_INSERT_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn edit_command(state: tauri::State<'_, DbState>, id: i32, title: String, content: String) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute(
        "UPDATE commands SET title=?1, content=?2 WHERE id=?3",
        rusqlite::params![title, content, id],
    ).map_err(|e| format!("[DATABASE] COMMAND_UPDATE_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn delete_command(state: tauri::State<'_, DbState>, id: i32) -> Result<(), String> {
    let conn_guard = state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
    
    conn.execute(
        "DELETE FROM commands WHERE id=?1",
        rusqlite::params![id],
    ).map_err(|e| format!("[DATABASE] COMMAND_DELETE_FAILED: {}", e))?;
    
    drop(conn_guard);
    save_vault_internal(&state)?;
    Ok(())
}

#[tauri::command]
async fn get_commands(state: tauri::State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INIT")?;
    let mut stmt = conn.prepare("SELECT id, title, content FROM commands").map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(json!({
            "id": row.get::<_, i32>(0)?, 
            "title": row.get::<_, String>(1)?, 
            "content": row.get::<_, String>(2)?
        }))
    }).map_err(|e| e.to_string())?;
    
    let mut list = Vec::new();
    for r in rows { list.push(r.unwrap()); }
    Ok(list)
}

#[tauri::command]
async fn initiate_connection(app: tauri::AppHandle, state: tauri::State<'_, SshState>, db_state: tauri::State<'_, DbState>, session_id: String, server_id: i32, custom_password: Option<String>) -> Result<(), String> {
    use tauri::Emitter;
    use tokio::time::Duration;
    use russh::client;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    
    println!("[BACKEND] initiate_connection invoked for session_id: {}, server_id: {}", session_id, server_id);

    // 1. Prevent duplicate connections
    {
        let connections = state.connections.lock().await;
        if connections.contains_key(&session_id) {
            println!("[BACKEND] Connection already active for session: {}", session_id);
            return Ok(());
        }
        
        let fp_txs = state.fp_txs.lock().await;
        if fp_txs.contains_key(&session_id) {
            println!("[BACKEND] Fingerprint check already in progress for session: {}", session_id);
            return Ok(());
        }
    }

    println!("[BACKEND] No duplicates found. Registering oneshot channel and spawning connection worker...");
    let (fp_tx, fp_rx) = tokio::sync::oneshot::channel();
    state.fp_txs.lock().await.insert(session_id.clone(), fp_tx);

    let session_id_clone = session_id.clone();
    let state_connections = Arc::clone(&state.connections);
    let fp_txs_clone = Arc::clone(&state.fp_txs);
    let db_conn_shared = Arc::clone(&db_state.conn);

    // Fetch DB record inside a nested block to drop non-Send Rows/Statement before any await
    let db_res = {
        let conn_guard = db_state.conn.lock().map_err(|_| "[STATE] LOCK_FAILED")?;
        let conn = conn_guard.as_ref().ok_or("[STATE] DATABASE_NOT_INITIALIZED")?;
        
        let mut stmt = conn.prepare("
            SELECT s.host, s.port, 
                   COALESCE(c.username, s.username) as username,
                   COALESCE(c.password, s.password) as password, 
                   c.key_id,
                   s.proxy_type, s.proxy_host, s.proxy_port
            FROM servers s
            LEFT JOIN credentials c ON s.credential_id = c.id
            WHERE s.id=?1
        ").map_err(|e| e.to_string())?;
        
        let mut rows = stmt.query([server_id]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            Some((
                row.get::<_, String>(0).unwrap(), 
                row.get::<_, i32>(1).unwrap(), 
                row.get::<_, String>(2).unwrap_or_default(),
                row.get::<_, Option<String>>(3).unwrap_or_default(),
                row.get::<_, Option<i32>>(4).unwrap_or_default(),
                row.get::<_, Option<String>>(5).unwrap_or_default().unwrap_or_else(|| "none".to_string()),
                row.get::<_, Option<String>>(6).unwrap_or_default(),
                row.get::<_, Option<i32>>(7).unwrap_or_default()
            ))
        } else {
            None
        }
    };

    let (host, port, user, password, _key_id, proxy_type, proxy_host, proxy_port) = match db_res {
        Some(val) => val,
        None => {
            state.fp_txs.lock().await.remove(&session_id);
            return Err("Server not found".into());
        }
    };

    let handler = ssh_manager::ClientHandler {
        app: app.clone(),
        session_id: session_id.clone(),
        server_host: host.clone(),
        server_port: port as u16,
        db: db_conn_shared,
        fp_rx: Some(fp_rx),
    };

    tauri::async_runtime::spawn(async move {
        println!("[BACKEND WORKER] Started connection worker thread for session: {}", session_id_clone);

        struct FpCleanupGuard {
            fp_txs: Arc<Mutex<std::collections::HashMap<String, tokio::sync::oneshot::Sender<bool>>>>,
            session_id: String,
        }
        impl Drop for FpCleanupGuard {
            fn drop(&mut self) {
                let fp_txs = Arc::clone(&self.fp_txs);
                let session_id = self.session_id.clone();
                tauri::async_runtime::spawn(async move {
                    fp_txs.lock().await.remove(&session_id);
                    println!("[BACKEND WORKER] FpCleanupGuard: Evicted session {} from pending list.", session_id);
                });
            }
        }
        let _guard = FpCleanupGuard {
            fp_txs: Arc::clone(&fp_txs_clone),
            session_id: session_id_clone.clone(),
        };

        let emit_log = |msg: &str, log_type: &str| {
            println!("[LOG-{}] {}", session_id_clone, msg);
            let _ = app.emit(&format!("session-log-{}", session_id_clone), serde_json::json!({"msg": msg, "type": log_type}));
        };

        let cleanup = || async {
            // Already handled by Drop Guard, but keeping for immediate eviction if needed
            fp_txs_clone.lock().await.remove(&session_id_clone);
        };

        emit_log("Initializing SSH connection process...", "info");
        emit_log(&format!("Server Details -> Host: {}, Port: {}, User: {}", host, port, user), "info");

        // Set up generic stream based on proxy configuration
        trait AsyncStream: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static {}
        impl<T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static> AsyncStream for T {}

        struct StreamWrapper(Box<dyn AsyncStream>);
        impl tokio::io::AsyncRead for StreamWrapper {
            fn poll_read(mut self: std::pin::Pin<&mut Self>, cx: &mut std::task::Context<'_>, buf: &mut tokio::io::ReadBuf<'_>) -> std::task::Poll<std::io::Result<()>> {
                std::pin::Pin::new(&mut *self.0).poll_read(cx, buf)
            }
        }
        impl tokio::io::AsyncWrite for StreamWrapper {
            fn poll_write(mut self: std::pin::Pin<&mut Self>, cx: &mut std::task::Context<'_>, buf: &[u8]) -> std::task::Poll<std::io::Result<usize>> {
                std::pin::Pin::new(&mut *self.0).poll_write(cx, buf)
            }
            fn poll_flush(mut self: std::pin::Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<std::io::Result<()>> {
                std::pin::Pin::new(&mut *self.0).poll_flush(cx)
            }
            fn poll_shutdown(mut self: std::pin::Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<std::io::Result<()>> {
                std::pin::Pin::new(&mut *self.0).poll_shutdown(cx)
            }
        }

        let stream_res: Result<Box<dyn AsyncStream>, String> = match proxy_type.as_str() {
            "socks5" => {
                let p_host = match proxy_host.as_ref().filter(|h| !h.is_empty()) {
                    Some(h) => h,
                    None => {
                        let err_msg = "SOCKS5 Proxy Host is empty";
                        emit_log(&format!("Error: {}", err_msg), "error");
                        cleanup().await;
                        let _ = app.emit(&format!("connection-failed-{}", session_id_clone), serde_json::json!({"reason": err_msg}));
                        return;
                    }
                };
                let p_port = proxy_port.unwrap_or(1080) as u16;
                emit_log(&format!("Connecting via SOCKS5 Proxy {}:{}...", p_host, p_port), "info");
                
                let proxy_addr = format!("{}:{}", p_host, p_port);
                match tokio::time::timeout(
                    Duration::from_secs(10),
                    tokio_socks::tcp::Socks5Stream::connect(proxy_addr.as_str(), (host.as_str(), port as u16))
                ).await {
                    Ok(Ok(stream)) => {
                        emit_log("SOCKS5 Proxy tunnel established successfully.", "success");
                        Ok(Box::new(stream))
                    }
                    Ok(Err(e)) => {
                        Err(format!("SOCKS5 connection error: {}", e))
                    }
                    Err(_) => {
                        Err("SOCKS5 proxy connection timed out after 10 seconds".to_string())
                    }
                }
            }
            "http" => {
                let p_host = match proxy_host.as_ref().filter(|h| !h.is_empty()) {
                    Some(h) => h,
                    None => {
                        let err_msg = "HTTP Proxy Host is empty";
                        emit_log(&format!("Error: {}", err_msg), "error");
                        cleanup().await;
                        let _ = app.emit(&format!("connection-failed-{}", session_id_clone), serde_json::json!({"reason": err_msg}));
                        return;
                    }
                };
                let p_port = proxy_port.unwrap_or(8080) as u16;
                emit_log(&format!("Connecting via HTTP Proxy {}:{}...", p_host, p_port), "info");

                let proxy_addr = format!("{}:{}", p_host, p_port);
                match tokio::time::timeout(
                    Duration::from_secs(10),
                    tokio::net::TcpStream::connect(proxy_addr)
                ).await {
                    Ok(Ok(mut tcp_stream)) => {
                        emit_log(&format!("Requesting HTTP CONNECT tunnel to {}:{}...", host, port), "info");
                        match tokio::time::timeout(
                            Duration::from_secs(10),
                            async_http_proxy::http_connect_tokio(&mut tcp_stream, &host, port as u16)
                        ).await {
                            Ok(Ok(_)) => {
                                emit_log("HTTP Proxy tunnel established successfully.", "success");
                                Ok(Box::new(tcp_stream))
                            }
                            Ok(Err(e)) => {
                                Err(format!("HTTP CONNECT tunnel failed: {}", e))
                            }
                            Err(_) => {
                                Err("HTTP CONNECT tunnel request timed out".to_string())
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        Err(format!("HTTP proxy network connection failed: {}", e))
                    }
                    Err(_) => {
                        Err("HTTP proxy connection timed out after 10 seconds".to_string())
                    }
                }
            }
            _ => {
                emit_log(&format!("Connecting directly to {}:{}...", host, port), "info");
                match tokio::time::timeout(
                    Duration::from_secs(10),
                    tokio::net::TcpStream::connect((host.as_str(), port as u16))
                ).await {
                    Ok(Ok(stream)) => {
                        emit_log("Direct TCP Connection established successfully.", "success");
                        Ok(Box::new(stream))
                    }
                    Ok(Err(e)) => {
                        Err(format!("Direct connection failed: {}", e))
                    }
                    Err(_) => {
                        Err("Direct connection timed out after 10 seconds".to_string())
                    }
                }
            }
        };

        let stream = match stream_res {
            Ok(s) => s,
            Err(e) => {
                emit_log(&e, "error");
                cleanup().await;
                let _ = app.emit(&format!("connection-failed-{}", session_id_clone), serde_json::json!({"reason": e}));
                return;
            }
        };

        emit_log("Starting SSH Handshake and establishing secure session...", "info");
        let config = client::Config::default();
        let config = Arc::new(config);
        
        let connect_future = client::connect_stream(config, StreamWrapper(stream), handler);

        match tokio::time::timeout(Duration::from_secs(15), connect_future).await {
            Ok(Ok(mut session)) => {
                emit_log("SSH Handshake complete. Authenticating user...", "info");
                
                let final_pass = custom_password.or(password);
                
                let auth_res = if let Some(pass) = final_pass {
                    emit_log("Attempting Password Authentication...", "info");
                    session.authenticate_password(user, pass).await
                } else {
                    emit_log("Key auth not yet implemented in Phase 1", "warn");
                    Ok(false)
                };

                match auth_res {
                    Ok(true) => {
                        emit_log("Authentication successful. Session ready.", "success");
                        state_connections.lock().await.insert(session_id_clone.clone(), Arc::new(Mutex::new(session)));
                        let _ = app.emit(&format!("connection-success-{}", session_id_clone), serde_json::json!({}));
                    },
                    Ok(false) => {
                        emit_log("Authentication failed (Access Denied).", "error");
                        let _ = app.emit(&format!("connection-failed-{}", session_id_clone), serde_json::json!({"reason": "Access Denied", "is_auth_error": true}));
                    },
                    Err(e) => {
                        emit_log(&format!("Auth error: {}", e), "error");
                        let _ = app.emit(&format!("connection-failed-{}", session_id_clone), serde_json::json!({"reason": e.to_string(), "is_auth_error": true}));
                    }
                }
            },
            Ok(Err(e)) => {
                emit_log(&format!("SSH connection failed: {}", e), "error");
                let _ = app.emit(&format!("connection-failed-{}", session_id_clone), serde_json::json!({"reason": e.to_string()}));
            },
            Err(_) => {
                emit_log("SSH connection timed out during handshake (15 seconds limit).", "error");
                let _ = app.emit(&format!("connection-failed-{}", session_id_clone), serde_json::json!({"reason": "Handshake Timed Out"}));
            }
        }

        cleanup().await;
    });
    
    Ok(())
}

#[tauri::command]
async fn verify_fingerprint_response(state: tauri::State<'_, SshState>, session_id: String, accepted: bool) -> Result<(), String> {
    if let Some(tx) = state.fp_txs.lock().await.remove(&session_id) {
        let _ = tx.send(accepted);
    }
    Ok(())
}

#[tauri::command]
async fn disconnect_session(state: tauri::State<'_, SshState>, session_id: String) -> Result<(), String> {
    state.connections.lock().await.remove(&session_id);
    Ok(())
}

#[tauri::command]
async fn open_terminal(app: tauri::AppHandle, state: tauri::State<'_, SshState>, session_id: String, terminal_id: String, cols: u32, rows: u32) -> Result<(), String> {
    use russh::ChannelMsg;
    use tauri::Emitter;
    use std::sync::Arc;
    use crate::ssh_manager::TerminalCommand;

    let session_arc = {
        let mut connections = state.connections.lock().await;
        if let Some(sess) = connections.get_mut(&session_id) {
            Arc::clone(sess)
        } else {
            return Err("Session not connected".into());
        }
    };

    let mut session = session_arc.lock().await;
    let mut channel = session.channel_open_session().await.map_err(|e| e.to_string())?;
    
    // Request PTY
    channel.request_pty(false, "xterm-256color", cols, rows, 0, 0, &[]).await.map_err(|e| e.to_string())?;
    channel.request_shell(true).await.map_err(|e| e.to_string())?;

    let (tx, mut rx) = tokio::sync::mpsc::channel::<TerminalCommand>(32);
    state.terminal_txs.lock().await.insert(terminal_id.clone(), tx);

    let terminal_id_clone = terminal_id.clone();
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::select! {
                Some(msg) = channel.wait() => {
                    match msg {
                        ChannelMsg::Data { ref data } => {
                            let _ = app_clone.emit(&format!("terminal-output-{}", terminal_id_clone), data.to_vec());
                        },
                        ChannelMsg::ExtendedData { ref data, ext } => {
                            let _ = app_clone.emit(&format!("terminal-output-{}", terminal_id_clone), data.to_vec());
                        },
                        ChannelMsg::Eof => {
                            break;
                        },
                        ChannelMsg::Close => {
                            break;
                        },
                        _ => {}
                    }
                },
                opt_cmd = rx.recv() => {
                    match opt_cmd {
                        Some(cmd) => {
                            match cmd {
                                TerminalCommand::Data(data) => {
                                    if let Err(_) = channel.data(&data[..]).await {
                                        break;
                                    }
                                },
                                TerminalCommand::Resize { cols, rows } => {
                                    let _ = channel.window_change(cols, rows, 0, 0).await;
                                }
                            }
                        },
                        None => {
                            let _ = channel.close().await;
                            break;
                        }
                    }
                }
            }
        }
        let _ = app_clone.emit(&format!("terminal-closed-{}", terminal_id_clone), serde_json::json!({}));
    });

    Ok(())
}

#[tauri::command]
async fn write_terminal_data(state: tauri::State<'_, SshState>, terminal_id: String, data: Vec<u8>) -> Result<(), String> {
    use crate::ssh_manager::TerminalCommand;
    if let Some(tx) = state.terminal_txs.lock().await.get(&terminal_id) {
        let _ = tx.send(TerminalCommand::Data(data)).await;
    }
    Ok(())
}

#[tauri::command]
async fn resize_terminal(state: tauri::State<'_, SshState>, terminal_id: String, cols: u32, rows: u32) -> Result<(), String> {
    use crate::ssh_manager::TerminalCommand;
    if let Some(tx) = state.terminal_txs.lock().await.get(&terminal_id) {
        let _ = tx.send(TerminalCommand::Resize { cols, rows }).await;
    }
    Ok(())
}

#[tauri::command]
async fn close_terminal(state: tauri::State<'_, SshState>, terminal_id: String) -> Result<(), String> {
    state.terminal_txs.lock().await.remove(&terminal_id);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(DbState { conn: std::sync::Arc::new(StdMutex::new(None)), master_key: StdMutex::new(None), db_path: StdMutex::new(None) })
        .manage(SshState::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            check_db_exists, setup_master_db, reset_db, 
            add_server, edit_server, delete_server, get_servers, get_ssh_keys, 
            get_credentials, generate_ssh_key,
            add_folder, delete_folder, get_folders,
            add_command, edit_command, delete_command, get_commands,
            add_credential, edit_credential, delete_credential,
            add_ssh_key, edit_ssh_key, delete_ssh_key,
            initiate_connection, verify_fingerprint_response, disconnect_session,
            open_terminal, write_terminal_data, resize_terminal, close_terminal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}