use std::str::FromStr;

use near_sdk::borsh::{self, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U64;
use near_sdk::{env, near, AccountId, BorshStorageKey, CurveType, PanicOnDefault, PublicKey};

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    Issuers,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct IssuerRecord {
    pub public_key: String,
    pub key_version: u32,
    pub schema_hash: String,
    pub active: bool,
    pub status_epoch: u64,
    pub status_root: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct IssuerRegistry {
    owner_id: AccountId,
    issuers: LookupMap<AccountId, IssuerRecord>,
}

fn assert_hash(value: &str, field: &str) {
    assert_eq!(value.len(), 64, "ERR_INVALID_{}", field);
    assert!(
        value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)),
        "ERR_INVALID_{}",
        field
    );
}

fn assert_valid_ed25519_public_key(public_key: &str) {
    assert!(!public_key.is_empty(), "ERR_EMPTY_PUBLIC_KEY");
    assert!(public_key.len() <= 512, "ERR_PUBLIC_KEY_TOO_LONG");
    assert!(
        public_key.starts_with("ed25519:"),
        "ERR_INVALID_PUBLIC_KEY_PREFIX"
    );

    let parsed = PublicKey::from_str(public_key)
        .unwrap_or_else(|_| env::panic_str("ERR_INVALID_PUBLIC_KEY"));

    assert_eq!(
        parsed.curve_type(),
        CurveType::ED25519,
        "ERR_PUBLIC_KEY_NOT_ED25519"
    );
}

#[near]
impl IssuerRegistry {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            issuers: LookupMap::new(StorageKey::Issuers),
        }
    }

    pub fn register_issuer(
        &mut self,
        issuer_id: AccountId,
        public_key: String,
        key_version: u32,
        schema_hash: String,
    ) {
        self.assert_owner();
        assert_valid_ed25519_public_key(&public_key);
        assert!(key_version > 0, "ERR_INVALID_KEY_VERSION");
        assert_hash(&schema_hash, "SCHEMA_HASH");

        let record = if let Some(existing) = self.issuers.get(&issuer_id) {
            assert!(key_version > existing.key_version, "ERR_KEY_VERSION_NOT_INCREASED");
            IssuerRecord {
                public_key,
                key_version,
                schema_hash,
                active: existing.active,
                status_epoch: existing.status_epoch,
                status_root: existing.status_root,
            }
        } else {
            IssuerRecord {
                public_key,
                key_version,
                schema_hash,
                active: true,
                status_epoch: 0,
                status_root: "0".repeat(64),
            }
        };
        self.issuers.insert(&issuer_id, &record);
    }

    pub fn set_issuer_active(&mut self, issuer_id: AccountId, active: bool) {
        self.assert_owner();
        let mut record = self.issuers.get(&issuer_id).expect("ERR_ISSUER_NOT_FOUND");
        record.active = active;
        self.issuers.insert(&issuer_id, &record);
    }

    pub fn update_status_root(&mut self, issuer_id: AccountId, epoch: U64, root: String) {
        self.assert_owner();
        assert_hash(&root, "STATUS_ROOT");
        let mut record = self.issuers.get(&issuer_id).expect("ERR_ISSUER_NOT_FOUND");
        assert!(epoch.0 > record.status_epoch, "ERR_STATUS_EPOCH_NOT_INCREASED");
        record.status_epoch = epoch.0;
        record.status_root = root;
        self.issuers.insert(&issuer_id, &record);
    }

    pub fn get_issuer(&self, issuer_id: AccountId) -> Option<IssuerRecord> {
        self.issuers.get(&issuer_id)
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner_id.clone()
    }

    fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "ERR_NOT_OWNER");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    const VALID_ED25519_KEY: &str =
        "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp";

    fn account(value: &str) -> AccountId {
        value.parse().expect("valid account id")
    }

    fn set_predecessor(value: &str) {
        let mut context = VMContextBuilder::new();
        context.predecessor_account_id(account(value));
        testing_env!(context.build());
    }

    fn registry() -> IssuerRegistry {
        set_predecessor("owner.testnet");
        IssuerRegistry::new(account("owner.testnet"))
    }

    fn register(registry: &mut IssuerRegistry) {
        registry.register_issuer(
            account("issuer.testnet"),
            VALID_ED25519_KEY.to_string(),
            1,
            "a".repeat(64),
        );
    }

    #[test]
    fn owner_can_register_and_read_issuer() {
        let mut contract = registry();
        register(&mut contract);
        let issuer = contract.get_issuer(account("issuer.testnet")).unwrap();
        assert_eq!(issuer.key_version, 1);
        assert!(issuer.active);
        assert_eq!(issuer.schema_hash, "a".repeat(64));
        assert_eq!(issuer.status_epoch, 0);
        assert_eq!(issuer.public_key, VALID_ED25519_KEY);
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_OWNER")]
    fn non_owner_cannot_register_issuer() {
        let mut contract = registry();
        set_predecessor("attacker.testnet");
        register(&mut contract);
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_SCHEMA_HASH")]
    fn rejects_malformed_schema_hash() {
        let mut contract = registry();
        contract.register_issuer(
            account("issuer.testnet"),
            VALID_ED25519_KEY.to_string(),
            1,
            "not-a-hash".to_string(),
        );
    }

    #[test]
    fn owner_can_disable_issuer() {
        let mut contract = registry();
        register(&mut contract);
        contract.set_issuer_active(account("issuer.testnet"), false);
        assert!(!contract.get_issuer(account("issuer.testnet")).unwrap().active);
    }

    #[test]
    fn key_rotation_preserves_status_and_suspension() {
        let mut contract = registry();
        register(&mut contract);
        contract.update_status_root(account("issuer.testnet"), U64(7), "b".repeat(64));
        contract.set_issuer_active(account("issuer.testnet"), false);
        contract.register_issuer(
            account("issuer.testnet"),
            VALID_ED25519_KEY.to_string(),
            2,
            "c".repeat(64),
        );
        let issuer = contract.get_issuer(account("issuer.testnet")).unwrap();
        assert_eq!(issuer.key_version, 2);
        assert_eq!(issuer.status_epoch, 7);
        assert_eq!(issuer.status_root, "b".repeat(64));
        assert!(!issuer.active);
    }

    #[test]
    fn status_epoch_must_increase() {
        let mut contract = registry();
        register(&mut contract);
        contract.update_status_root(account("issuer.testnet"), U64(1), "b".repeat(64));
        let issuer = contract.get_issuer(account("issuer.testnet")).unwrap();
        assert_eq!(issuer.status_epoch, 1);
        assert_eq!(issuer.status_root, "b".repeat(64));
    }

    #[test]
    #[should_panic(expected = "ERR_STATUS_EPOCH_NOT_INCREASED")]
    fn rejects_reused_status_epoch() {
        let mut contract = registry();
        register(&mut contract);
        contract.update_status_root(account("issuer.testnet"), U64(1), "b".repeat(64));
        contract.update_status_root(account("issuer.testnet"), U64(1), "c".repeat(64));
    }

    #[test]
    #[should_panic(expected = "ERR_KEY_VERSION_NOT_INCREASED")]
    fn rejects_key_version_rollback() {
        let mut contract = registry();
        register(&mut contract);
        contract.register_issuer(
            account("issuer.testnet"),
            VALID_ED25519_KEY.to_string(),
            1,
            "c".repeat(64),
        );
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_STATUS_ROOT")]
    fn rejects_malformed_status_root() {
        let mut contract = registry();
        register(&mut contract);
        contract.update_status_root(account("issuer.testnet"), U64(1), "not-a-hash".to_string());
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_OWNER")]
    fn non_owner_cannot_update_status_root() {
        let mut contract = registry();
        register(&mut contract);
        set_predecessor("attacker.testnet");
        contract.update_status_root(account("issuer.testnet"), U64(1), "b".repeat(64));
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_OWNER")]
    fn non_owner_cannot_change_issuer_activation() {
        let mut contract = registry();
        register(&mut contract);
        set_predecessor("attacker.testnet");
        contract.set_issuer_active(account("issuer.testnet"), false);
    }

    #[test]
    #[should_panic(expected = "ERR_EMPTY_PUBLIC_KEY")]
    fn rejects_empty_public_key() {
        let mut contract = registry();
        contract.register_issuer(
            account("issuer.testnet"),
            String::new(),
            1,
            "a".repeat(64),
        );
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_KEY_VERSION")]
    fn rejects_zero_key_version() {
        let mut contract = registry();
        contract.register_issuer(
            account("issuer.testnet"),
            VALID_ED25519_KEY.to_string(),
            0,
            "a".repeat(64),
        );
    }

    #[test]
    #[should_panic(expected = "ERR_ISSUER_NOT_FOUND")]
    fn cannot_update_status_for_unknown_issuer() {
        let mut contract = registry();
        contract.update_status_root(account("missing.testnet"), U64(1), "b".repeat(64));
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_PUBLIC_KEY_PREFIX")]
    fn rejects_bare_base58_public_key() {
        let mut contract = registry();
        contract.register_issuer(
            account("issuer.testnet"),
            VALID_ED25519_KEY.trim_start_matches("ed25519:").to_string(),
            1,
            "a".repeat(64),
        );
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_PUBLIC_KEY_PREFIX")]
    fn rejects_unknown_public_key_prefix() {
        let mut contract = registry();
        contract.register_issuer(
            account("issuer.testnet"),
            "ed25519x:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".to_string(),
            1,
            "a".repeat(64),
        );
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_PUBLIC_KEY")]
    fn rejects_invalid_base58_public_key() {
        let mut contract = registry();
        contract.register_issuer(
            account("issuer.testnet"),
            "ed25519:0OIl".to_string(),
            1,
            "a".repeat(64),
        );
    }

    #[test]
    #[should_panic(expected = "ERR_INVALID_PUBLIC_KEY")]
    fn rejects_wrong_length_public_key() {
        let mut contract = registry();
        contract.register_issuer(
            account("issuer.testnet"),
            "ed25519:2".to_string(),
            1,
            "a".repeat(64),
        );
    }

    #[test]
    #[should_panic(expected = "ERR_PUBLIC_KEY_TOO_LONG")]
    fn rejects_oversized_public_key() {
        let mut contract = registry();
        contract.register_issuer(
            account("issuer.testnet"),
            format!("ed25519:{}", "1".repeat(600)),
            1,
            "a".repeat(64),
        );
    }

    #[test]
    fn invalid_registration_does_not_create_issuer_record() {
        let mut contract = registry();
        let result = catch_unwind(AssertUnwindSafe(|| {
            contract.register_issuer(
                account("issuer.testnet"),
                "ed25519:0OIl".to_string(),
                1,
                "a".repeat(64),
            );
        }));
        assert!(result.is_err());
        assert!(contract.get_issuer(account("issuer.testnet")).is_none());
    }

    #[test]
    fn invalid_key_rotation_preserves_previous_record() {
        let mut contract = registry();
        register(&mut contract);
        let before = contract.get_issuer(account("issuer.testnet")).unwrap();

        let result = catch_unwind(AssertUnwindSafe(|| {
            contract.register_issuer(
                account("issuer.testnet"),
                "ed25519:0OIl".to_string(),
                2,
                "b".repeat(64),
            );
        }));

        assert!(result.is_err());
        let after = contract.get_issuer(account("issuer.testnet")).unwrap();
        assert_eq!(after.public_key, before.public_key);
        assert_eq!(after.key_version, before.key_version);
        assert_eq!(after.schema_hash, before.schema_hash);
        assert_eq!(after.active, before.active);
        assert_eq!(after.status_epoch, before.status_epoch);
        assert_eq!(after.status_root, before.status_root);
    }
}
