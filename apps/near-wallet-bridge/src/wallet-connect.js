import { NearConnector } from "@hot-labs/near-connect";
import {
  NEAR_NETWORK,
  getVerifiedOwnerAccount,
} from "./wallet-guard.js";

export function createOwnerConnector() {
  return new NearConnector({
    network: NEAR_NETWORK,
    autoConnect: false,
    features: {
      testnet: true,
    },
    footerBranding: null,
  });
}

export async function connectOwnerWallet(connector) {
  if (connector.network !== NEAR_NETWORK) {
    throw new Error("Connector bukan NEAR Testnet.");
  }

  await connector.whenManifestLoaded;

  // Koneksi hanya dimulai setelah pengguna menekan tombol.
  const wallet = await connector.connect();

  try {
    const accounts = await wallet.getAccounts();

    const account = getVerifiedOwnerAccount({
      network: connector.network,
      accounts,
    });

    return { wallet, account };
  } catch (error) {
    await connector.disconnect(wallet).catch(() => {});
    throw error;
  }
}

export async function disconnectOwnerWallet(connector, wallet) {
  if (wallet) {
    await connector.disconnect(wallet);
  }
}
