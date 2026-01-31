// EVM wallet balance fetching - Hybrid approach
// - Blockscout API for chains that support it (auto-detects ALL tokens)
// - Direct RPC fallback for other chains (Hyperliquid)

import { createPublicClient, http, formatEther, formatUnits, type Address } from "viem";
import { mainnet, base, arbitrum } from "viem/chains";

export interface TokenBalance {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  formattedBalance: string;
  usdValue?: number;
  usdPrice?: number;
  logoUrl?: string;
}

export interface WalletBalances {
  chain: string;
  chainId: number;
  address: string;
  nativeBalance: TokenBalance;
  tokenBalances: TokenBalance[];
  totalUsdValue?: number;
}

// Blockscout API endpoints for supported chains
const BLOCKSCOUT_APIS: Record<string, { url: string; chainId: number; nativeSymbol: string }> = {
  ethereum: { url: "https://eth.blockscout.com", chainId: 1, nativeSymbol: "ETH" },
  arbitrum: { url: "https://arbitrum.blockscout.com", chainId: 42161, nativeSymbol: "ETH" },
  base: { url: "https://base.blockscout.com", chainId: 8453, nativeSymbol: "ETH" },
  optimism: { url: "https://optimism.blockscout.com", chainId: 10, nativeSymbol: "ETH" },
  polygon: { url: "https://polygon.blockscout.com", chainId: 137, nativeSymbol: "POL" },
  gnosis: { url: "https://gnosis.blockscout.com", chainId: 100, nativeSymbol: "xDAI" },
};

// ERC20 ABI for fallback RPC calls
const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Hyperliquid chain definition (not in viem by default)
const hyperliquid = {
  id: 998,
  name: "Hyperliquid",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid.xyz/evm"] } },
} as const;

// Fallback token lists for chains without Blockscout
const FALLBACK_TOKENS: Record<string, Array<{ address: Address; symbol: string; name: string; decimals: number }>> = {
  hyperliquid: [
    { address: "0x5e105266db42f78fa814322bce7f388b4c2e61eb", symbol: "hbUSDT", name: "Hyperbeat USDT", decimals: 18 },
    { address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped ETH", decimals: 18 },
  ],
};

// Chains that need RPC fallback
const RPC_FALLBACK_CHAINS: Record<string, { chain: typeof hyperliquid; rpc: string; chainId: number; nativeSymbol: string }> = {
  hyperliquid: { chain: hyperliquid, rpc: "https://rpc.hyperliquid.xyz/evm", chainId: 998, nativeSymbol: "ETH" },
};

export type EVMChain = keyof typeof BLOCKSCOUT_APIS | keyof typeof RPC_FALLBACK_CHAINS;

export const ALL_EVM_CHAINS: EVMChain[] = [
  ...Object.keys(BLOCKSCOUT_APIS),
  ...Object.keys(RPC_FALLBACK_CHAINS),
] as EVMChain[];

// Fetch token balances via Blockscout API (returns ALL tokens)
async function fetchBlockscoutBalances(
  walletAddress: string,
  chainName: string
): Promise<WalletBalances> {
  const config = BLOCKSCOUT_APIS[chainName];
  if (!config) throw new Error(`No Blockscout API for chain: ${chainName}`);

  // Fetch native balance
  const addressUrl = `${config.url}/api/v2/addresses/${walletAddress}`;
  const addressRes = await fetch(addressUrl);
  if (!addressRes.ok) throw new Error(`Blockscout address fetch failed: ${addressRes.status}`);
  const addressData = await addressRes.json();

  const nativeBalanceRaw = BigInt(addressData.coin_balance || "0");
  const nativeBalance: TokenBalance = {
    address: "0x0000000000000000000000000000000000000000",
    symbol: config.nativeSymbol,
    name: config.nativeSymbol,
    decimals: 18,
    balance: nativeBalanceRaw,
    formattedBalance: formatEther(nativeBalanceRaw),
    usdPrice: addressData.exchange_rate ? parseFloat(addressData.exchange_rate) : undefined,
  };

  if (nativeBalance.usdPrice && nativeBalanceRaw > 0n) {
    nativeBalance.usdValue = parseFloat(nativeBalance.formattedBalance) * nativeBalance.usdPrice;
  }

  // Fetch token balances
  const tokensUrl = `${config.url}/api/v2/addresses/${walletAddress}/token-balances`;
  const tokensRes = await fetch(tokensUrl);
  if (!tokensRes.ok) throw new Error(`Blockscout tokens fetch failed: ${tokensRes.status}`);
  const tokensData = await tokensRes.json();

  const tokenBalances: TokenBalance[] = [];

  for (const item of tokensData) {
    // Skip NFTs (ERC-721, ERC-1155)
    if (item.token?.type === "ERC-721" || item.token?.type === "ERC-1155") continue;
    
    // Skip spam/scam tokens (common patterns)
    const symbol = item.token?.symbol || "";
    const name = item.token?.name || "";
    if (
      symbol.includes("claim") ||
      symbol.includes("Visit") ||
      symbol.includes("t.me") ||
      name.includes("claim") ||
      name.includes("Visit") ||
      name.includes("Airdrop") ||
      name.includes("t.me") ||
      name.toLowerCase().includes("reward")
    ) continue;

    const decimals = parseInt(item.token?.decimals || "18");
    const balanceRaw = BigInt(item.value || "0");
    
    if (balanceRaw === 0n) continue;

    const formattedBalance = formatUnits(balanceRaw, decimals);
    const usdPrice = item.token?.exchange_rate ? parseFloat(item.token.exchange_rate) : undefined;

    const token: TokenBalance = {
      address: item.token?.address_hash || "",
      symbol: item.token?.symbol || "???",
      name: item.token?.name || "Unknown",
      decimals,
      balance: balanceRaw,
      formattedBalance,
      usdPrice,
      logoUrl: item.token?.icon_url,
    };

    if (usdPrice && balanceRaw > 0n) {
      token.usdValue = parseFloat(formattedBalance) * usdPrice;
    }

    tokenBalances.push(token);
  }

  // Sort by USD value (highest first), then by balance
  tokenBalances.sort((a, b) => {
    if (a.usdValue && b.usdValue) return b.usdValue - a.usdValue;
    if (a.usdValue) return -1;
    if (b.usdValue) return 1;
    return 0;
  });

  // Calculate total USD value
  let totalUsdValue = nativeBalance.usdValue || 0;
  for (const token of tokenBalances) {
    if (token.usdValue) totalUsdValue += token.usdValue;
  }

  return {
    chain: chainName,
    chainId: config.chainId,
    address: walletAddress,
    nativeBalance,
    tokenBalances,
    totalUsdValue: totalUsdValue > 0 ? totalUsdValue : undefined,
  };
}

// DefiLlama API for prices
const DEFILLAMA_API = "https://coins.llama.fi";

// Chain name mapping for DefiLlama
const DEFILLAMA_CHAIN_NAMES: Record<string, string> = {
  hyperliquid: "hyperliquid",
  monad: "monad",
};

// Fetch prices from DefiLlama
async function fetchDefiLlamaPrices(
  chainName: string,
  tokenAddresses: string[]
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  const llamaChain = DEFILLAMA_CHAIN_NAMES[chainName] || chainName;
  
  const coins = tokenAddresses
    .map((addr) => `${llamaChain}:${addr}`)
    .join(",");
  
  try {
    const response = await fetch(`${DEFILLAMA_API}/prices/current/${coins}`);
    const data = await response.json();
    
    for (const [key, value] of Object.entries(data.coins || {})) {
      const addr = key.split(":")[1]?.toLowerCase();
      if (addr && (value as any).price) {
        prices.set(addr, (value as any).price);
      }
    }
  } catch (error) {
    console.warn(`Error fetching DefiLlama prices for ${chainName}:`, error);
  }
  
  // Also fetch ETH price
  try {
    const ethRes = await fetch(`${DEFILLAMA_API}/prices/current/coingecko:ethereum`);
    const ethData = await ethRes.json();
    const ethPrice = ethData.coins?.["coingecko:ethereum"]?.price;
    if (ethPrice) {
      prices.set("native", ethPrice);
    }
  } catch {}
  
  return prices;
}

// Fetch balances via direct RPC (fallback for chains without Blockscout)
async function fetchRpcBalances(
  walletAddress: string,
  chainName: string
): Promise<WalletBalances> {
  const config = RPC_FALLBACK_CHAINS[chainName];
  if (!config) throw new Error(`No RPC config for chain: ${chainName}`);

  const client = createPublicClient({
    chain: config.chain,
    transport: http(config.rpc),
  });

  const address = walletAddress as Address;

  // Get native balance
  const nativeBalanceRaw = await client.getBalance({ address });
  
  // Get token balances from fallback list
  const tokenBalances: TokenBalance[] = [];
  const tokensToCheck = FALLBACK_TOKENS[chainName] || [];
  const tokenAddresses: string[] = [];

  for (const token of tokensToCheck) {
    try {
      const balance = await client.readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      if (balance > 0n) {
        tokenBalances.push({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          balance,
          formattedBalance: formatUnits(balance, token.decimals),
        });
        tokenAddresses.push(token.address);
      }
    } catch (error) {
      console.warn(`Error fetching ${token.symbol} on ${chainName}:`, error);
    }
  }

  // Fetch prices from DefiLlama
  const prices = await fetchDefiLlamaPrices(chainName, tokenAddresses);
  
  // Apply prices to tokens
  let totalUsdValue = 0;
  
  for (const token of tokenBalances) {
    const price = prices.get(token.address.toLowerCase());
    if (price) {
      token.usdPrice = price;
      token.usdValue = parseFloat(token.formattedBalance) * price;
      totalUsdValue += token.usdValue;
    }
  }
  
  // Native balance with price
  const ethPrice = prices.get("native");
  const nativeBalance: TokenBalance = {
    address: "0x0000000000000000000000000000000000000000",
    symbol: config.nativeSymbol,
    name: config.nativeSymbol,
    decimals: 18,
    balance: nativeBalanceRaw,
    formattedBalance: formatEther(nativeBalanceRaw),
    usdPrice: ethPrice,
  };
  
  if (ethPrice && nativeBalanceRaw > 0n) {
    nativeBalance.usdValue = parseFloat(nativeBalance.formattedBalance) * ethPrice;
    totalUsdValue += nativeBalance.usdValue;
  }

  // Sort by USD value
  tokenBalances.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0));

  return {
    chain: chainName,
    chainId: config.chainId,
    address: walletAddress,
    nativeBalance,
    tokenBalances,
    totalUsdValue: totalUsdValue > 0 ? totalUsdValue : undefined,
  };
}

// Main function: get balances for a single chain
export async function getEVMWalletBalances(
  walletAddress: string,
  chainName: EVMChain
): Promise<WalletBalances> {
  // Use Blockscout if available, otherwise fallback to RPC
  if (chainName in BLOCKSCOUT_APIS) {
    return fetchBlockscoutBalances(walletAddress, chainName);
  } else if (chainName in RPC_FALLBACK_CHAINS) {
    return fetchRpcBalances(walletAddress, chainName);
  } else {
    throw new Error(`Unsupported chain: ${chainName}`);
  }
}

// Get balances from all EVM chains at once
export async function getAllEVMWalletBalances(
  walletAddress: string,
  chains?: EVMChain[]
): Promise<WalletBalances[]> {
  const chainsToQuery = chains || ALL_EVM_CHAINS;
  const results: WalletBalances[] = [];

  // Query all chains in parallel
  const promises = chainsToQuery.map(async (chainName) => {
    try {
      const balances = await getEVMWalletBalances(walletAddress, chainName);
      return balances;
    } catch (error) {
      console.warn(`Error fetching ${chainName} balances:`, error);
      return null;
    }
  });

  const allResults = await Promise.all(promises);

  for (const result of allResults) {
    if (result) {
      results.push(result);
    }
  }

  return results;
}

// Utility: format balances as a summary string
export function formatBalancesSummary(balances: WalletBalances[]): string {
  const lines: string[] = [];
  let grandTotal = 0;

  for (const chain of balances) {
    const hasValue = chain.totalUsdValue && chain.totalUsdValue > 0.01;
    const hasTokens = chain.tokenBalances.length > 0 || parseFloat(chain.nativeBalance.formattedBalance) > 0;
    
    if (!hasValue && !hasTokens) continue;

    lines.push(`\n=== ${chain.chain.toUpperCase()} ===`);
    
    if (chain.totalUsdValue) {
      lines.push(`Total: $${chain.totalUsdValue.toFixed(2)}`);
      grandTotal += chain.totalUsdValue;
    }

    // Native balance
    const nativeBal = parseFloat(chain.nativeBalance.formattedBalance);
    if (nativeBal > 0.0001) {
      let nativeLine = `${chain.nativeBalance.symbol}: ${nativeBal.toFixed(4)}`;
      if (chain.nativeBalance.usdValue) {
        nativeLine += ` ($${chain.nativeBalance.usdValue.toFixed(2)})`;
      }
      lines.push(nativeLine);
    }

    // Token balances
    for (const token of chain.tokenBalances) {
      const bal = parseFloat(token.formattedBalance);
      let tokenLine = `${token.symbol}: ${bal.toFixed(4)}`;
      if (token.usdValue) {
        tokenLine += ` ($${token.usdValue.toFixed(2)})`;
      }
      lines.push(tokenLine);
    }
  }

  if (grandTotal > 0) {
    lines.unshift(`GRAND TOTAL: $${grandTotal.toFixed(2)}`);
  }

  return lines.join("\n");
}
