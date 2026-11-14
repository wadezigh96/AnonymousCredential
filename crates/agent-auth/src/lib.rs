//! Minimal Ed25519 challenge-response for ANONYMESH agent sessions.
//!
//! This is NOT an anonymous credential, ZK proof, or unlinkable presentation.
//! It proves possession of a signing key and binds the signature to one
//! verifier, task, capability digest, nonce, and expiry.

use ed25519_dalek::{Signature, VerifyingKey};
use std::collections::HashSet;

const DOMAIN: &[u8] = b"ANONYMESH_AGENT_AUTH_V1";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Challenge {
    pub nonce: [u8; 32],
    pub audience: String,
    pub task: String,
    pub capability_digest: [u8; 32],
    pub expires_at: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum VerifyError {
    EmptyAudience,
    EmptyTask,
    Expired,
    InvalidPublicKey,
    InvalidSignature,
    Replay,
    ReplayCacheFull,
}

impl Challenge {
    /// Canonical, domain-separated transcript. Strings are length-prefixed;
    /// fixed-width fields have fixed positions.
    pub fn signing_bytes(&self) -> Result<Vec<u8>, VerifyError> {
        if self.audience.is_empty() {
            return Err(VerifyError::EmptyAudience);
        }
        if self.task.is_empty() {
            return Err(VerifyError::EmptyTask);
        }
        let audience = self.audience.as_bytes();
        let task = self.task.as_bytes();
        let audience_len = u32::try_from(audience.len()).map_err(|_| VerifyError::EmptyAudience)?;
        let task_len = u32::try_from(task.len()).map_err(|_| VerifyError::EmptyTask)?;

        let mut out = Vec::with_capacity(
            DOMAIN.len() + 32 + 4 + audience.len() + 4 + task.len() + 32 + 8,
        );
        out.extend_from_slice(DOMAIN);
        out.extend_from_slice(&self.nonce);
        out.extend_from_slice(&audience_len.to_be_bytes());
        out.extend_from_slice(audience);
        out.extend_from_slice(&task_len.to_be_bytes());
        out.extend_from_slice(task);
        out.extend_from_slice(&self.capability_digest);
        out.extend_from_slice(&self.expires_at.to_be_bytes());
        Ok(out)
    }
}

/// In-memory replay guard for a single verifier process/session.
/// Production deployments must persist or distribute replay state and bound
/// it with an explicit retention policy.
#[derive(Debug)]
pub struct ReplayGuard {
    seen: HashSet<[u8; 32]>,
    max_entries: usize,
}

impl ReplayGuard {
    pub fn new(max_entries: usize) -> Self {
        Self {
            seen: HashSet::new(),
            max_entries,
        }
    }

    pub fn verify_and_consume(
        &mut self,
        public_key: &[u8; 32],
        challenge: &Challenge,
        signature: &[u8; 64],
        now: u64,
    ) -> Result<(), VerifyError> {
        if challenge.expires_at <= now {
            return Err(VerifyError::Expired);
        }
        let message = challenge.signing_bytes()?;
        let key = VerifyingKey::from_bytes(public_key)
            .map_err(|_| VerifyError::InvalidPublicKey)?;
        let signature = Signature::from_bytes(signature);
        key.verify_strict(&message, &signature)
            .map_err(|_| VerifyError::InvalidSignature)?;

        if self.seen.contains(&challenge.nonce) {
            return Err(VerifyError::Replay);
        }
        if self.seen.len() >= self.max_entries {
            return Err(VerifyError::ReplayCacheFull);
        }
        self.seen.insert(challenge.nonce);
        Ok(())
    }
}


const CAPABILITY_DOMAIN: &[u8] = b"ANONYMESH_DELEGATED_CAPABILITY_V1";

/// A signed, attenuable capability. Public keys are explicit so a verifier
/// can validate each delegation edge without trusting the delegate.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Capability {
    pub parent_digest: Option<[u8; 32]>,
    pub issuer_key: [u8; 32],
    pub delegate_key: [u8; 32],
    pub audience: String,
    pub action: String,
    pub resource: String,
    pub expires_at: u64,
    pub quota: u64,
    pub signature: [u8; 64],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CapabilityError {
    EmptyAudience,
    EmptyAction,
    EmptyResource,
    ZeroQuota,
    Expired,
    InvalidKey,
    InvalidSignature,
    InvalidRoot,
    BrokenParentLink,
    WrongDelegator,
    AudienceEscalation,
    ActionEscalation,
    ResourceEscalation,
    ExpiryEscalation,
    QuotaEscalation,
    EmptyChain,
}

impl Capability {
    fn unsigned_bytes(&self) -> Result<Vec<u8>, CapabilityError> {
        if self.audience.is_empty() { return Err(CapabilityError::EmptyAudience); }
        if self.action.is_empty() { return Err(CapabilityError::EmptyAction); }
        if self.resource.is_empty() { return Err(CapabilityError::EmptyResource); }
        if self.quota == 0 { return Err(CapabilityError::ZeroQuota); }

        let mut out = Vec::new();
        out.extend_from_slice(CAPABILITY_DOMAIN);
        match self.parent_digest {
            Some(digest) => { out.push(1); out.extend_from_slice(&digest); }
            None => out.push(0),
        }
        out.extend_from_slice(&self.issuer_key);
        out.extend_from_slice(&self.delegate_key);
        for value in [&self.audience, &self.action, &self.resource] {
            let bytes = value.as_bytes();
            let len = u32::try_from(bytes.len()).map_err(|_| CapabilityError::EmptyResource)?;
            out.extend_from_slice(&len.to_be_bytes());
            out.extend_from_slice(bytes);
        }
        out.extend_from_slice(&self.expires_at.to_be_bytes());
        out.extend_from_slice(&self.quota.to_be_bytes());
        Ok(out)
    }

    /// Sign only after all capability fields have been fixed.
    pub fn sign(mut self, issuer: &ed25519_dalek::SigningKey) -> Result<Self, CapabilityError> {
        if issuer.verifying_key().to_bytes() != self.issuer_key {
            return Err(CapabilityError::WrongDelegator);
        }
        let bytes = self.unsigned_bytes()?;
        self.signature = issuer.sign(&bytes).to_bytes();
        Ok(self)
    }

    pub fn digest(&self) -> Result<[u8; 32], CapabilityError> {
        use sha2::{Digest, Sha256};
        let mut bytes = self.unsigned_bytes()?;
        bytes.extend_from_slice(&self.signature);
        Ok(Sha256::digest(&bytes).into())
    }

    fn verify_signature(&self, now: u64) -> Result<(), CapabilityError> {
        if self.expires_at <= now { return Err(CapabilityError::Expired); }
        let key = VerifyingKey::from_bytes(&self.issuer_key)
            .map_err(|_| CapabilityError::InvalidKey)?;
        let signature = Signature::from_bytes(&self.signature);
        key.verify_strict(&self.unsigned_bytes()?, &signature)
            .map_err(|_| CapabilityError::InvalidSignature)
    }
}

/// Verify a root capability and every delegation link. Every child must be
/// signed by its parent's delegate key and may only narrow scope, expiry and
/// quota. This function validates authorization metadata; callers must still
/// atomically account for quota consumption before performing the action.
pub fn verify_capability_chain(
    trusted_root_issuer: &[u8; 32],
    chain: &[Capability],
    now: u64,
) -> Result<(), CapabilityError> {
    let root = chain.first().ok_or(CapabilityError::EmptyChain)?;
    if root.parent_digest.is_some() || &root.issuer_key != trusted_root_issuer {
        return Err(CapabilityError::InvalidRoot);
    }
    for (index, capability) in chain.iter().enumerate() {
        capability.verify_signature(now)?;
        if index == 0 { continue; }
        let parent = &chain[index - 1];
        if capability.issuer_key != parent.delegate_key {
            return Err(CapabilityError::WrongDelegator);
        }
        if capability.parent_digest != Some(parent.digest()?) {
            return Err(CapabilityError::BrokenParentLink);
        }
        if capability.audience != parent.audience {
            return Err(CapabilityError::AudienceEscalation);
        }
        if capability.action != parent.action {
            return Err(CapabilityError::ActionEscalation);
        }
        if capability.resource != parent.resource {
            return Err(CapabilityError::ResourceEscalation);
        }
        if capability.expires_at > parent.expires_at {
            return Err(CapabilityError::ExpiryEscalation);
        }
        if capability.quota > parent.quota {
            return Err(CapabilityError::QuotaEscalation);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn challenge() -> Challenge {
        Challenge {
            nonce: [9u8; 32],
            audience: "agent-b.example".into(),
            task: "read:weather".into(),
            capability_digest: [3u8; 32],
            expires_at: 500,
        }
    }

    fn signed(c: &Challenge) -> [u8; 64] {
        key().sign(&c.signing_bytes().unwrap()).to_bytes()
    }

    #[test]
    fn accepts_valid_audience_task_and_capability_bound_challenge_once() {
        let c = challenge();
        let sig = signed(&c);
        let mut guard = ReplayGuard::new(8);
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &c, &sig, 100),
            Ok(())
        );
    }

    #[test]
    fn rejects_replay_of_consumed_nonce() {
        let c = challenge();
        let sig = signed(&c);
        let mut guard = ReplayGuard::new(8);
        assert_eq!(guard.verify_and_consume(&key().verifying_key().to_bytes(), &c, &sig, 100), Ok(()));
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &c, &sig, 100),
            Err(VerifyError::Replay)
        );
    }

    #[test]
    fn rejects_expired_challenge() {
        let c = challenge();
        let sig = signed(&c);
        let mut guard = ReplayGuard::new(8);
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &c, &sig, 500),
            Err(VerifyError::Expired)
        );
    }

    #[test]
    fn rejects_changed_audience() {
        let c = challenge();
        let sig = signed(&c);
        let mut changed = c.clone();
        changed.audience = "agent-c.example".into();
        let mut guard = ReplayGuard::new(8);
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &changed, &sig, 100),
            Err(VerifyError::InvalidSignature)
        );
    }

    #[test]
    fn rejects_changed_task() {
        let c = challenge();
        let sig = signed(&c);
        let mut changed = c.clone();
        changed.task = "transfer:funds".into();
        let mut guard = ReplayGuard::new(8);
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &changed, &sig, 100),
            Err(VerifyError::InvalidSignature)
        );
    }

    #[test]
    fn rejects_changed_capability_digest() {
        let c = challenge();
        let sig = signed(&c);
        let mut changed = c.clone();
        changed.capability_digest = [4u8; 32];
        let mut guard = ReplayGuard::new(8);
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &changed, &sig, 100),
            Err(VerifyError::InvalidSignature)
        );
    }

    #[test]
    fn rejects_changed_expiry() {
        let c = challenge();
        let sig = signed(&c);
        let mut changed = c.clone();
        changed.expires_at = 501;
        let mut guard = ReplayGuard::new(8);
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &changed, &sig, 100),
            Err(VerifyError::InvalidSignature)
        );
    }

    #[test]
    fn replay_cache_is_bounded() {
        let first = challenge();
        let second = Challenge { nonce: [8u8; 32], ..first.clone() };
        let mut guard = ReplayGuard::new(1);
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &first, &signed(&first), 100),
            Ok(())
        );
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &second, &signed(&second), 100),
            Err(VerifyError::ReplayCacheFull)
        );
    }

    #[test]
    fn rejects_empty_audience_before_signature_verification() {
        let mut c = challenge();
        c.audience.clear();
        let mut guard = ReplayGuard::new(8);
        assert_eq!(
            guard.verify_and_consume(&key().verifying_key().to_bytes(), &c, &[0u8; 64], 100),
            Err(VerifyError::EmptyAudience)
        );
    }
}
