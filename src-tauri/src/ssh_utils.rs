use ssh_key::{PrivateKey, algorithm::Ed25519};
use rand_core::OsRng;

pub fn generate_ed25519_key() -> (String, String) {
    let private_key = PrivateKey::random(&mut OsRng, Ed25519).unwrap();
    let public_key = private_key.public_key().to_openssh().unwrap();
    let private_openssh = private_key.to_openssh(ssh_key::LineEnding::LF).unwrap();
    
    (public_key, (*private_openssh).to_string())
}