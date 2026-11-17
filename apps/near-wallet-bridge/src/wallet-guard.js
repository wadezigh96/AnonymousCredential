export const NEAR_NETWORK = "testnet";
export const EXPECTED_OWNER_ACCOUNT_ID = "wkams.testnet";

export function getVerifiedOwnerAccount({
  network,
  accounts,
  expectedAccountId = EXPECTED_OWNER_ACCOUNT_ID,
}) {
  if (network !== NEAR_NETWORK) {
    throw new Error("Wallet harus terhubung ke NEAR Testnet.");
  }

  if (!Array.isArray(accounts)) {
    throw new Error("Daftar akun wallet tidak valid.");
  }

  const account = accounts.find(
    (entry) => entry?.accountId === expectedAccountId,
  );

  if (!account) {
    throw new Error(
      `Akun owner ${expectedAccountId} tidak ditemukan di wallet.`,
    );
  }

  return account;
}
