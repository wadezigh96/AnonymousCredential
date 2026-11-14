use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U64;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

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
        assert!(!public_key.is_empty(), "ERR_EMPTY_PUBLIC_KEY");
        assert!(public_key.len() <= 512, "ERR_PUBLIC_KEY_TOO_LONG");
        assert!(key_version > 0, "ERR_INVALID_KEY_VERSION");
        assert_hash(&schema_hash, "SCHEMA_HASH");

        if let Some(existing) = self.issuers.get(&issuer_id) {
            assert!(key_version > existing.key_version, "ERR_KEY_VERSION_NOT_INCREASED");
        }

        self.issuers.insert(
            issuer_id,
            IssuerRecord {
                public_key,
                key_version,
                schema_hash,
                active: true,
                status_epoch: 0,
                status_root: "0".repeat(64),
            },
        );
    }

    pub fn set_issuer_active(&mut self, issuer_id: AccountId, active: bool) {
        self.assert_owner();
        let mut record = self.issuers.get(&issuer_id).cloned().expect("ERR_ISSUER_NOT_FOUND");
        record.active = active;
        self.issuers.insert(issuer_id, record);
    }

    pub fn update_status_root(&mut self, issuer_id: AccountId, epoch: U64, root: String) {
        self.assert_owner();
        assert_hash(&root, "STATUS_ROOT");
        let mut record = self.issuers.get(&issuer_id).cloned().expect("ERR_ISSUER_NOT_FOUND");
        assert!(epoch.0 > record.status_epoch, "ERR_STATUS_EPOCH_NOT_INCREASED");
        record.status_epoch = epoch.0;
        record.status_root = root;
        self.issuers.insert(issuer_id, record);
    }

    pub fn get_issuer(&self, issuer_id: AccountId) -> Option<IssuerRecord> {
        self.issuers.get(&issuer_id).cloned()
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
            "ed25519:example-public-key".to_string(),
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
            "public-key".to_string(),
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
            "replacement-key".to_string(),
            1,
            "c".repeat(64),
        );
    }
}
