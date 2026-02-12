import { createAppKit } from '@reown/appkit';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import { solana, solanaDevnet, solanaTestnet } from '@reown/appkit/networks';

const projectId =
  import.meta.env.VITE_APPKIT_PROJECT_ID ||
  import.meta.env.VITE_PROJECT_ID ||
  'b56e18d47c72ab683b10814fe9495694';

if (!projectId) {
  throw new Error('VITE_APPKIT_PROJECT_ID or VITE_PROJECT_ID must be set');
}

const appKit = createAppKit({
  adapters: [new SolanaAdapter()],
  networks: [solana, solanaDevnet, solanaTestnet],
  projectId,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#d4af37',
    '--w3m-modal-background-color': '#050505',
    '--w3m-card-background-color': '#0c0c0c',
    '--w3m-text-color': '#f5f5f5',
    '--w3m-border-color': '#232323',
  },
  features: {
    analytics: true,
  },
});

export function setupAppKit() {
  return Promise.resolve(appKit);
}

export function openAppKit(options?: Parameters<typeof appKit.open>[0]) {
  return setupAppKit().then((m) => m.open(options));
}

export function getWalletInfo(namespace: Parameters<typeof appKit.getWalletInfo>[0] = 'solana') {
  return setupAppKit().then((m) => m.getWalletInfo(namespace));
}

export function subscribeWalletInfo(
  callback: Parameters<typeof appKit.subscribeWalletInfo>[0],
  namespace?: Parameters<typeof appKit.subscribeWalletInfo>[1]
) {
  return setupAppKit().then((m) => m.subscribeWalletInfo(callback, namespace));
}
