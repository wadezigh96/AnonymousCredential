export const EXPECTED_ACCOUNT_ID = "wkams.testnet";

export function inspectAccount(accountId, expectedAccountId = EXPECTED_ACCOUNT_ID) {
  if (typeof accountId !== "string" || accountId.trim().length === 0) {
    return { connected: false, matchesExpected: false, accountId: null };
  }

  const normalized = accountId.trim();
  return {
    connected: true,
    matchesExpected: normalized === expectedAccountId,
    accountId: normalized,
  };
}
