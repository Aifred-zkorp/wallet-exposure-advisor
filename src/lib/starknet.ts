// Starknet wallet balance fetching
import { RpcProvider, Contract, num, type Abi } from "starknet";

export interface StarknetTokenBalance {
  address: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  formattedBalance: string;
}

export interface StarknetWalletBalances {
  chain: "starknet";
  address: string;
  tokenBalances: StarknetTokenBalance[];
}

// Starknet mainnet RPC
const STARKNET_RPC = "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_7/demo";

// Main tokens on Starknet (mainnet)
const STARKNET_TOKENS = [
  // Core tokens
  { address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", symbol: "ETH", decimals: 18 },
  { address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", symbol: "STRK", decimals: 18 },
  // Stablecoins
  { address: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", symbol: "USDC", decimals: 6 },
  { address: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8", symbol: "USDT", decimals: 6 },
  { address: "0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3", symbol: "DAI", decimals: 18 },
  // Bitcoin variants
  { address: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", symbol: "WBTC", decimals: 8 },
  { address: "0x04daa17763b286d1e59b97c283c0b8c949994c361e426a28f743c67bdfe9a32f", symbol: "tBTC", decimals: 18 },
  // Liquid staking
  { address: "0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2", symbol: "wstETH", decimals: 18 },
  { address: "0x028d709c875c0ceac3dce7065bec5328186dc89fe254527084d1689910954b0a", symbol: "xSTRK", decimals: 18 },
  // Gaming / Ecosystem tokens
  { address: "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49", symbol: "LORDS", decimals: 18 },
  { address: "0x042dd777885ad2c116be96d4d634abc90a26a790ffb5871e037dd5ae7d2ec86b", symbol: "SURVIVOR", decimals: 18 },
  { address: "0x03b405a98c9e795d427fe82cdeeeed803f221b52471e3a757574a2b4180793ee", symbol: "BROTHER", decimals: 18 },
  { address: "0x04fcaf2a7b4a072fe57c59beee807322d34ed65000d78611c909a46fead07fb1", symbol: "DREAMS", decimals: 18 },
];

// ERC20 ABI for Starknet
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "felt" }],
    outputs: [{ name: "balance", type: "Uint256" }],
    stateMutability: "view",
  },
];

function formatBalance(balance: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = balance / divisor;
  const fractionalPart = balance % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
  return `${integerPart}.${fractionalStr.slice(0, 6)}`;
}

export async function getStarknetWalletBalances(
  walletAddress: string
): Promise<StarknetWalletBalances> {
  const provider = new RpcProvider({ nodeUrl: STARKNET_RPC });

  const tokenBalances: StarknetTokenBalance[] = [];

  for (const token of STARKNET_TOKENS) {
    try {
      const contract = new Contract({
        abi: ERC20_ABI as Abi,
        address: token.address,
        providerOrAccount: provider,
      });
      const result = await contract.balanceOf(walletAddress);
      
      // Handle Uint256 response (low, high) - starknet.js v9
      let balance: bigint;
      try {
        if (typeof result === "bigint") {
          balance = result;
        } else if (typeof result === "object" && result !== null) {
          // Could be { low, high } or { balance: { low, high } } or just a number
          const balanceValue = "balance" in result ? result.balance : result;
          if (typeof balanceValue === "bigint") {
            balance = balanceValue;
          } else if (typeof balanceValue === "object" && balanceValue !== null && "low" in balanceValue) {
            const low = BigInt(String(balanceValue.low || 0));
            const high = BigInt(String(balanceValue.high || 0));
            balance = low + (high << 128n);
          } else {
            balance = BigInt(String(balanceValue));
          }
        } else {
          balance = BigInt(String(result));
        }
      } catch {
        balance = 0n;
      }

      if (balance > 0n) {
        tokenBalances.push({
          address: token.address,
          symbol: token.symbol,
          decimals: token.decimals,
          balance,
          formattedBalance: formatBalance(balance, token.decimals),
        });
      }
    } catch (error) {
      console.warn(`Error fetching ${token.symbol} on Starknet:`, error);
    }
  }

  return {
    chain: "starknet",
    address: walletAddress,
    tokenBalances,
  };
}
