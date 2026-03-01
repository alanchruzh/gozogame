const RPC_URL = 'https://rpc.monad.xyz';
const GOZO_CONTRACT = '0xc655797B4FDdE40B4c68CA41C29aadd672d77777';
const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function rpcCall(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export default async (req) => {
  try {
    // 1. Get total burned: balanceOf(BURN_ADDRESS) on GOZO contract
    const balanceOfSelector = '0x70a08231';
    const paddedBurn = BURN_ADDRESS.slice(2).padStart(64, '0');
    const balanceData = balanceOfSelector + paddedBurn;

    const balanceHex = await rpcCall('eth_call', [
      { to: GOZO_CONTRACT, data: balanceData },
      'latest',
    ]);

    const totalBurnedRaw = BigInt(balanceHex || '0x0');
    const totalBurned = Number(totalBurnedRaw / BigInt(1e18));
    const totalBurnedExact = (totalBurnedRaw * BigInt(100) / BigInt(1e18));
    const totalBurnedFormatted = (Number(totalBurnedExact) / 100).toFixed(2);

    // 2. Get total supply: totalSupply()
    const totalSupplyHex = await rpcCall('eth_call', [
      { to: GOZO_CONTRACT, data: '0x18160ddd' },
      'latest',
    ]);
    const totalSupplyRaw = BigInt(totalSupplyHex || '0x0');
    const totalSupply = Number(totalSupplyRaw / BigInt(1e18));
    const burnPercentage = totalSupply > 0 ? ((totalBurned / totalSupply) * 100).toFixed(4) : '0';

    // 3. Get recent burn transactions (Transfer events to dead address)
    const latestBlockHex = await rpcCall('eth_blockNumber', []);
    const latestBlock = parseInt(latestBlockHex, 16);
    // Look back ~50000 blocks
    const fromBlock = Math.max(0, latestBlock - 50000);

    const paddedBurnTopic = '0x' + BURN_ADDRESS.slice(2).padStart(64, '0');
    let recentBurns = [];

    try {
      const logs = await rpcCall('eth_getLogs', [{
        address: GOZO_CONTRACT,
        fromBlock: '0x' + fromBlock.toString(16),
        toBlock: 'latest',
        topics: [
          TRANSFER_TOPIC,
          null, // any sender
          paddedBurnTopic, // to burn address
        ],
      }]);

      if (logs && Array.isArray(logs)) {
        recentBurns = logs.slice(-20).reverse().map((log) => {
          const amountRaw = BigInt(log.data || '0x0');
          const amount = Number(amountRaw / BigInt(1e18));
          const from = '0x' + (log.topics[1] || '').slice(26);
          return {
            txHash: log.transactionHash,
            blockNumber: parseInt(log.blockNumber, 16),
            from,
            amount,
          };
        });
      }
    } catch (logErr) {
      console.warn('Could not fetch burn logs:', logErr.message);
    }

    return Response.json({
      totalBurned: totalBurnedFormatted,
      totalSupply,
      burnPercentage,
      recentBurns,
      burnAddress: BURN_ADDRESS,
      contractAddress: GOZO_CONTRACT,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Burn data error:', err);
    return Response.json(
      { error: 'Failed to fetch burn data', details: err.message },
      { status: 500 }
    );
  }
};

export const config = {
  path: '/api/burn-data',
  method: 'GET',
};
