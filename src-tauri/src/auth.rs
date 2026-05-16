use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
use argon2::{password_hash::{PasswordHasher, SaltString}, Argon2};
use rand::Rng;

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
    if encrypted_data.len() < 12 { return Err("INVALID_VAULT_FORMAT".into()); }
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(&encrypted_data[..12]);
    cipher.decrypt(nonce, &encrypted_data[12..]).map_err(|_| "DECRYPTION_FAILURE".into())
}