const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function handle(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
  }

  const quicknodeUrl = env.QUICKNODE_RPC_URL;
  if (!quicknodeUrl) {
    return new Response('Missing QUICKNODE_RPC_URL', { status: 500 });
  }

  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet');
  if (!wallet) {
    return new Response('Missing wallet query', { status: 400, headers: CORS_HEADERS });
  }

  const rpcPayload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getAssetsByOwner',
    params: {
      ownerAddress: wallet,
      options: {
        showCollectionMetadata: true,
        showFungible: false,
      },
    },
  };

  const response = await fetch(quicknodeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rpcPayload),
  });

  if (!response.ok) {
    const payload = await response.text();
    return new Response(payload || 'Bad gateway', {
      status: response.status,
      headers: CORS_HEADERS,
    });
  }

  const payload = await response.json();
  const items = payload.result?.items ?? [];
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request, event.env));
});
