import type { createAppKit } from '@reown/appkit';
import type { Connection } from '@solana/web3.js';

type AppKitModal = ReturnType<typeof createAppKit>;
type WalletInfo = ReturnType<AppKitModal['getWalletInfo']> | undefined;

export const store = {
  accountState: null as Parameters<AppKitModal['subscribeAccount']>[0] | null,
  networkState: null as Parameters<AppKitModal['subscribeNetwork']>[0] | null,
  appKitState: null as Parameters<AppKitModal['subscribeState']>[0] | null,
  events: [] as unknown[],
  walletInfo: null as WalletInfo | null,
  solanaProvider: null as Parameters<AppKitModal['subscribeProviders']>[0]['solana'] | null,
  solanaConnection: null as Connection | null,
};

export function updateStore<K extends keyof typeof store>(key: K, value: (typeof store)[K]) {
  store[key] = value;
}

export function cacheWalletInfo(info: WalletInfo | null) {
  updateStore('walletInfo', info);
}

export function cacheProvider(provider: typeof store['solanaProvider']) {
  updateStore('solanaProvider', provider);
}
