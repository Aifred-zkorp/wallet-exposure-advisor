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

// Starknet mainnet RPC (using free public endpoint)
const STARKNET_RPC = "https://free-rpc.nethermind.io/mainnet-juno";

// Main tokens on Starknet
const STARKNET_TOKENS = [
  {
    address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    symbol: "ETH",
    decimals: 18,
  },
  {
    address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    symbol: "STRK",
    decimals: 18,
  },
  {
    address: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    symbol: "USDC",
    decimals: 6,
  },
  {
    address: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
    symbol: "USDT",
    decimals: 6,
  },
  {
    address: "0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3",
    symbol: "DAI",
    decimals: 18,
  },
  {
    address: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
    symbol: "WBTC",
    decimals: 8,
  },
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
      
      // Handle Uint256 response (low, high)
      let balance: bigint;
      if (typeof result === "object" && "balance" in result) {
        const balanceObj = result.balance as { low: bigint; high: bigint };
        balance = balanceObj.low + (balanceObj.high << 128n);
      } else if (typeof result === "bigint") {
        balance = result;
      } else {
        balance = BigInt(num.toHex(result));
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
