// Price fetching via DefiLlama (free, no API key needed)

export interface TokenPrice {
  symbol: string;
  price: number;
  confidence: number;
}

// DefiLlama price API
const DEFILLAMA_API = "https://coins.llama.fi";

// Common token addresses by chain
export const TOKEN_ADDRESSES: Record<string, Record<string, string>> = {
  ethereum: {
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    USDT: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    DAI: "0x6b175474e89094c44da98b954eedeac495271d0f",
    WBTC: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  },
  base: {
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    USDbC: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
  },
  arbitrum: {
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    USDC: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    ARB: "0x912ce59144191c1204e64559fe8253a0e49e6548",
  },
  starknet: {
    ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  },
};

export async function getTokenPrices(
  tokens: Array<{ chain: string; address: string; symbol?: string }>
): Promise<Map<string, TokenPrice>> {
  const prices = new Map<string, TokenPrice>();

  // Build DefiLlama query
  const coins = tokens
    .map((t) => {
      const chain = t.chain === "starknet" ? "starknet" : t.chain;
      return `${chain}:${t.address}`;
    })
    .join(",");

  try {
    const response = await fetch(`${DEFILLAMA_API}/prices/current/${coins}`);
    const data = await response.json();

    for (const token of tokens) {
      const chain = token.chain === "starknet" ? "starknet" : token.chain;
      const key = `${chain}:${token.address}`;
      const priceData = data.coins?.[key];

      if (priceData) {
        prices.set(token.address.toLowerCase(), {
          symbol: priceData.symbol || token.symbol || "UNKNOWN",
          price: priceData.price || 0,
          confidence: priceData.confidence || 0.99,
        });
      }
    }
  } catch (error) {
    console.error("Error fetching prices:", error);
  }

  return prices;
}

// Get ETH price specifically (used often)
export async function getEthPrice(): Promise<number> {
  try {
    const response = await fetch(
      `${DEFILLAMA_API}/prices/current/coingecko:ethereum`
    );
    const data = await response.json();
    return data.coins?.["coingecko:ethereum"]?.price || 0;
  } catch {
    return 0;
  }
}
