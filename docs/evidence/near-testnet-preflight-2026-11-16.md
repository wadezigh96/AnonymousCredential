# NEAR Testnet Preflight Evidence

**Repository:** `wadezigh96/anonymesh`
**PR:** #1
**Branch:** `feat/anonymesh-near-testnet-deployer`
**Head inspected:** `4af6109d829fab640ddbdee037780aed387385cd`
**Network:** NEAR Testnet only
**RPC:** `https://rpc.testnet.near.org`

## Read-only results

The following calls were made with `finality=final` and no transaction was submitted.

| Query | Result | Final block evidence |
|---|---|---|
| `registry.wkams.testnet.get_owner({})` | `"wkams.testnet"` | height `277965952`, hash `4VBDJ4EM13MR4Cr6T7M61svbQGwqcFAQ18Z41FQ2xRtN` |
| `registry.wkams.testnet.get_issuer({"issuer_id":"wkams.testnet"})` | `null` | height `277965959`, hash `B3PJ9HnuhNKYNvUTH2McxSUxjERFtvsVfA1XRCAXXJpY` |
| `view_account(registry.wkams.testnet)` | deployed code present | height `277965966`, hash `FzzimGaUtWPoFPehnhbLopyFpskvtgY4Q8vJAM4WLmm`, code hash `2829R23heDqiv8HRX6dSqFmPtEE4Cu4sE8BbRLajfxKi` |

The recorded `get_issuer` result is `null` for `issuer_id=wkams.testnet`. This is a lookup for the owner account ID, not the bridge's configured issuer ID `issuer.testnet`; it does not establish the live state of `issuer.testnet`. No issuer-registration transaction hash is recorded, and no live verifier acceptance can be claimed yet.

## Signer preflight

No `near`, `near-cli`, or `near-cli-rs` executable was available in the sandbox. No NEAR signer environment variables or credential/config files were present. No private key, seed phrase, access key, or token was requested, read, printed, or stored.

## Required secure operator action

To perform the mutation, the repository owner must connect an approved secure NEAR Testnet signer for owner account `wkams.testnet` through a wallet/connector or a controlled signing service. The signer must authorize the reviewed `register_issuer` payload from owner `wkams.testnet`; credentials must remain outside chat, Git, logs, and CI. Until that signer is connected, the correct status is **live registration blocked**, not successful.

## Status classification

- Contract deployment and owner read-back: **verified on live Testnet**.
- Issuer persistence and canonical metadata formatting: **implemented/tested locally**.
- Registry authorization against a deterministic mock: **tested locally only**.
- Issuer registration on live Testnet: **blocked by unavailable secure owner signer**.
- Live issuer → holder → verifier acceptance: **not run; blocked by missing issuer record**.
