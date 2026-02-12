const PROXY_URL = import.meta.env.VITE_NFT_PROXY_URL || 'http://localhost:8787/api/magiceden';

export async function fetchNfts(wallet: string) {
  if (!wallet) return [];
  const url = new URL(PROXY_URL);
  url.searchParams.set('wallet', wallet);
  const response = await fetch(url.toString(), { method: 'GET' });
  if (!response.ok) {
    throw new Error(`NFT proxy request failed (${response.status})`);
  }
  const payload = await response.json();
  return (payload.items ?? []) as Array<{
    mint: string;
    name?: string;
    img?: string;
    collection?: { symbol?: string };
  }>;
}
