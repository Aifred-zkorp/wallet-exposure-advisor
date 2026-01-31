import { getAllEVMWalletBalances, formatBalancesSummary } from "./src/lib/evm";

const WALLET = "0x9e68C21C016217d55e2951B550b00b1262Bf7c47";

async function main() {
  console.log("Fetching balances for:", WALLET);
  console.log("Using Blockscout API for: ethereum, arbitrum, base, optimism, polygon, gnosis");
  console.log("Using RPC fallback for: hyperliquid\n");

  // Test specific chains first
  const chains = ["ethereum", "arbitrum", "base", "hyperliquid"] as const;
  
  const balances = await getAllEVMWalletBalances(WALLET, [...chains]);
  
  console.log(formatBalancesSummary(balances));
  
  // Also output raw JSON for debugging
  console.log("\n\n=== RAW DATA ===");
  for (const chain of balances) {
    console.log(`\n${chain.chain}:`);
    console.log(`  Native: ${chain.nativeBalance.formattedBalance} ${chain.nativeBalance.symbol}`);
    console.log(`  Tokens: ${chain.tokenBalances.length}`);
    for (const t of chain.tokenBalances.slice(0, 5)) {
      console.log(`    - ${t.symbol}: ${t.formattedBalance} ${t.usdValue ? `($${t.usdValue.toFixed(2)})` : ''}`);
    }
  }
}

main().catch(console.error);
