import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.NFT_PROXY_PORT) || 8787;

app.use(cors({ origin: 'http://localhost:5173' }));

app.get('/api/magiceden', async (req, res) => {
  const wallet = String(req.query.wallet || '');
  if (!wallet) {
    return res.status(400).json({ error: 'wallet query param required' });
  }
  try {
    const response = await fetch(
      `https://api-mainnet.magiceden.dev/v2/wallets/${wallet}/tokens`,
      { headers: { accept: 'application/json' } }
    );
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Magic Eden failed' });
    }
    const data = await response.json();
    return res.json({ items: data });
  } catch (error: any) {
    console.error('Magic Eden proxy error', error);
    return res.status(500).json({ error: error?.message || 'proxy error' });
  }
});

app.listen(PORT, () => {
  console.log(`NFT proxy ready at http://localhost:${PORT}/api/magiceden`);
});
