export interface Env {
  QUICKNODE_RPC_URL: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return new Response(
      JSON.stringify({ status: 'ok', quicknode: !!env.QUICKNODE_RPC_URL }),
      {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  if (request.method === 'GET' && url.pathname === '/magiceden') {
    const wallet = url.searchParams.get('wallet');
    if (!wallet) {
      return new Response('Missing wallet query', { status: 400, headers: CORS_HEADERS });
    }
    const magicUrl = `https://api-mainnet.magiceden.dev/v2/wallets/${wallet}/tokens`;
    const magicResponse = await fetch(magicUrl, { headers: { Accept: 'application/json' } });
    if (!magicResponse.ok) {
      return new Response(null, { status: magicResponse.status, headers: CORS_HEADERS });
    }
    const data = await magicResponse.json();
    return new Response(JSON.stringify({ items: data }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (request.method !== 'POST' || url.pathname !== '/nfts') {
    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  }

  if (!env.QUICKNODE_RPC_URL) {
    return new Response('QuickNode URL not configured', {
      status: 500,
      headers: CORS_HEADERS,
    });
  }

  try {
    const payload = await request.json();
    const ownerAddress = payload.ownerAddress as string | undefined;
    const page = payload.page ?? 1;
    const limit = payload.limit ?? 40;

    if (!ownerAddress) {
      return new Response(JSON.stringify({ error: 'ownerAddress required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const rpcResponse = await fetch(env.QUICKNODE_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress,
          page,
          limit,
        },
      }),
    });

    const rpcPayload = await rpcResponse.json();
    return new Response(JSON.stringify(rpcPayload), {
      status: rpcResponse.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'worker error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return handle(request, env);
  },
};
