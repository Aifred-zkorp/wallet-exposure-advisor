// EVM wallet balance fetching using viem
import { createPublicClient, http, formatEther, formatUnits, type Address } from "viem";
import { mainnet, base, arbitrum } from "viem/chains";

export interface TokenBalance {
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  formattedBalance: string;
}

export interface WalletBalances {
  chain: string;
  address: string;
  nativeBalance: TokenBalance;
  tokenBalances: TokenBalance[];
}

// ERC20 ABI (minimal for balanceOf)
const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Hyperliquid chain definition (not in viem by default)
const hyperliquid = {
  id: 998,
  name: "Hyperliquid",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.hyperliquid.xyz/evm"] } },
} as const;

// Chain configs
const CHAINS = {
  ethereum: { chain: mainnet, rpc: "https://eth.llamarpc.com" },
  base: { chain: base, rpc: "https://base.llamarpc.com" },
  arbitrum: { chain: arbitrum, rpc: "https://arbitrum.llamarpc.com" },
  hyperliquid: { chain: hyperliquid, rpc: "https://api.hyperliquid.xyz/evm" },
};

// Top tokens to check per chain
const TOKENS_TO_CHECK: Record<string, Array<{ address: Address; symbol: string; decimals: number }>> = {
  ethereum: [
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EesdeAC495271d0F", symbol: "DAI", decimals: 18 },
    { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", decimals: 8 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 },
    { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", symbol: "LINK", decimals: 18 },
  ],
  base: [
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 },
    { address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", symbol: "USDbC", decimals: 6 },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 },
    { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", symbol: "DAI", decimals: 18 },
  ],
  arbitrum: [
    { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6 },
    { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6 },
    { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", decimals: 18 },
    { address: "0x912CE59144191C1204E64559FE8253a0e49E6548", symbol: "ARB", decimals: 18 },
  ],
  hyperliquid: [
    { address: "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", symbol: "USDC", decimals: 6 },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18 },
    { address: "0x0000000000000000000000000000000000000000", symbol: "HYPE", decimals: 18 }, // Native HYPE
  ],
};

export type EVMChain = "ethereum" | "base" | "arbitrum" | "hyperliquid";

export const ALL_EVM_CHAINS: EVMChain[] = ["ethereum", "base", "arbitrum", "hyperliquid"];

export async function getEVMWalletBalances(
  walletAddress: string,
  chainName: EVMChain
): Promise<WalletBalances> {
  const chainConfig = CHAINS[chainName];
  if (!chainConfig) throw new Error(`Unsupported chain: ${chainName}`);

  const client = createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpc),
  });

  const address = walletAddress as Address;

  // Get native balance (ETH)
  const nativeBalanceRaw = await client.getBalance({ address });
  const nativeBalance: TokenBalance = {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    decimals: 18,
    balance: nativeBalanceRaw,
    formattedBalance: formatEther(nativeBalanceRaw),
  };

  // Get token balances
  const tokenBalances: TokenBalance[] = [];
  const tokensToCheck = TOKENS_TO_CHECK[chainName] || [];

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
          decimals: token.decimals,
          balance,
          formattedBalance: formatUnits(balance, token.decimals),
        });
      }
    } catch (error) {
      // Token might not exist or other error, skip
      console.warn(`Error fetching ${token.symbol}:`, error);
    }
  }

  return {
    chain: chainName,
    address: walletAddress,
    nativeBalance,
    tokenBalances,
  };
}

// Get balances from all EVM chains at once
export async function getAllEVMWalletBalances(
  walletAddress: string
): Promise<WalletBalances[]> {
  const results: WalletBalances[] = [];
  
  // Query all chains in parallel
  const promises = ALL_EVM_CHAINS.map(async (chainName) => {
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
