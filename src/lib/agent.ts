import { z } from "zod";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";

import { getEVMWalletBalances, getAllEVMWalletBalances, type EVMChain, ALL_EVM_CHAINS } from "./evm";
import { getStarknetWalletBalances } from "./starknet";
import { getTokenPrices, getEthPrice } from "./prices";
import { analyzePortfolio, generateAdvice, type PortfolioAnalysis } from "./advisor";

// Create the agent
const agent = await createAgent({
  name: process.env.AGENT_NAME ?? "wallet-exposure-advisor",
  version: process.env.AGENT_VERSION ?? "1.0.0",
  description:
    process.env.AGENT_DESCRIPTION ??
    "AI-powered wallet exposure analyzer with rebalancing advice for EVM and Starknet wallets",
})
  .use(http({ landingPage: true }))
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// Input schema for wallet analysis
const analyzeWalletInput = z.object({
  address: z.string().min(1, "Wallet address is required"),
  chain: z.enum(["ethereum", "base", "arbitrum", "hyperliquid", "starknet", "all"]).default("all"),
});

// Output schema
const analyzeWalletOutput = z.object({
  address: z.string(),
  chain: z.string(),
  totalValueUsd: z.number(),
  holdings: z.array(
    z.object({
      symbol: z.string(),
      balance: z.string(),
      valueUsd: z.number(),
      percentage: z.number(),
      category: z.string(),
    })
  ),
  riskLevel: z.string(),
  stablecoinPercentage: z.number(),
  volatilePercentage: z.number(),
  concentrationRisk: z.boolean(),
  advice: z.string(),
});

// Helper to process EVM chain balances
async function processEVMBalances(
  balances: Awaited<ReturnType<typeof getEVMWalletBalances>>,
  ethPrice: number,
  chainLabel: string
): Promise<Array<{ symbol: string; balance: string; valueUsd: number; chain: string }>> {
  const holdings: Array<{ symbol: string; balance: string; valueUsd: number; chain: string }> = [];

  // Add native balance (ETH)
  const nativeValueUsd = parseFloat(balances.nativeBalance.formattedBalance) * ethPrice;
  if (nativeValueUsd > 0.01) {
    holdings.push({
      symbol: "ETH",
      balance: balances.nativeBalance.formattedBalance,
      valueUsd: nativeValueUsd,
      chain: chainLabel,
    });
  }

  // Add token balances
  for (const token of balances.tokenBalances) {
    let price = 0;
    if (["USDC", "USDT", "DAI", "USDbC"].includes(token.symbol)) {
      price = 1;
    } else if (token.symbol === "WETH") {
      price = ethPrice;
    } else if (token.symbol === "ARB") {
      price = 0.35; // Approximate ARB price
    } else if (token.symbol === "HYPE") {
      price = 20; // Approximate HYPE price
    } else {
      price = 0;
    }

    const valueUsd = parseFloat(token.formattedBalance) * price;
    if (valueUsd > 0.01) {
      holdings.push({
        symbol: token.symbol,
        balance: token.formattedBalance,
        valueUsd,
        chain: chainLabel,
      });
    }
  }

  return holdings;
}

// Main endpoint: Analyze wallet exposure
addEntrypoint({
  key: "analyze-wallet",
  description:
    "Analyze a wallet's token exposure and get AI-powered rebalancing advice. Supports Ethereum, Base, Arbitrum, Hyperliquid, Starknet, or 'all' for multi-chain.",
  input: analyzeWalletInput,
  output: analyzeWalletOutput,
  // Price: $0.10 per analysis (configured via DEFAULT_PRICE env)
  handler: async (ctx) => {
    const { address, chain } = ctx.input;

    console.log(`[analyze-wallet] Analyzing ${address} on ${chain}...`);

    try {
      // Fetch balances based on chain
      let holdings: Array<{ symbol: string; balance: string; valueUsd: number; chain?: string }> = [];
      const ethPrice = await getEthPrice();

      if (chain === "all") {
        // Query ALL chains (EVM + Starknet)
        console.log("[analyze-wallet] Fetching from all chains...");

        // Get all EVM balances in parallel
        const evmBalances = await getAllEVMWalletBalances(address);
        for (const balances of evmBalances) {
          const chainHoldings = await processEVMBalances(balances, ethPrice, balances.chain);
          holdings.push(...chainHoldings);
        }

        // Get Starknet balances (only if address looks like Starknet format)
        if (address.startsWith("0x") && address.length > 42) {
          try {
            const starknetBalances = await getStarknetWalletBalances(address);
            const tokenPrices = await getTokenPrices(
              starknetBalances.tokenBalances.map((t) => ({
                chain: "starknet",
                address: t.address,
                symbol: t.symbol,
              }))
            );

            for (const token of starknetBalances.tokenBalances) {
              let price = 0;
              if (token.symbol === "ETH") {
                price = ethPrice;
              } else if (["USDC", "USDT", "DAI"].includes(token.symbol)) {
                price = 1;
              } else {
                const priceData = tokenPrices.get(token.address.toLowerCase());
                price = priceData?.price || 0;
              }

              const valueUsd = parseFloat(token.formattedBalance) * price;
              if (valueUsd > 0.01) {
                holdings.push({
                  symbol: token.symbol,
                  balance: token.formattedBalance,
                  valueUsd,
                  chain: "starknet",
                });
              }
            }
          } catch (e) {
            console.log("[analyze-wallet] Skipping Starknet (EVM address format)");
          }
        }

      } else if (chain === "starknet") {
        // Starknet wallet
        const balances = await getStarknetWalletBalances(address);
        
        // Get STRK and stablecoin prices
        const tokenPrices = await getTokenPrices(
          balances.tokenBalances.map((t) => ({
            chain: "starknet",
            address: t.address,
            symbol: t.symbol,
          }))
        );

        holdings = balances.tokenBalances.map((token) => {
          let price = 0;
          if (token.symbol === "ETH") {
            price = ethPrice;
          } else if (["USDC", "USDT", "DAI"].includes(token.symbol)) {
            price = 1; // Stablecoins pegged to $1
          } else {
            const priceData = tokenPrices.get(token.address.toLowerCase());
            price = priceData?.price || 0;
          }

          const valueUsd = parseFloat(token.formattedBalance) * price;
          return {
            symbol: token.symbol,
            balance: token.formattedBalance,
            valueUsd,
          };
        });
      } else {
        // Single EVM chain
        const balances = await getEVMWalletBalances(address, chain as EVMChain);
        const chainHoldings = await processEVMBalances(balances, ethPrice, chain);
        holdings.push(...chainHoldings);
      }

      // Aggregate holdings by symbol (combine across chains)
      const aggregatedHoldings = new Map<string, { symbol: string; balance: number; valueUsd: number; chains: string[] }>();
      for (const holding of holdings) {
        const existing = aggregatedHoldings.get(holding.symbol);
        if (existing) {
          existing.balance += parseFloat(holding.balance);
          existing.valueUsd += holding.valueUsd;
          if (holding.chain && !existing.chains.includes(holding.chain)) {
            existing.chains.push(holding.chain);
          }
        } else {
          aggregatedHoldings.set(holding.symbol, {
            symbol: holding.symbol,
            balance: parseFloat(holding.balance),
            valueUsd: holding.valueUsd,
            chains: holding.chain ? [holding.chain] : [],
          });
        }
      }

      // Convert back to array format
      const finalHoldings = Array.from(aggregatedHoldings.values()).map((h) => ({
        symbol: h.chains.length > 1 ? `${h.symbol} (${h.chains.join("+")})` : h.symbol,
        balance: h.balance.toString(),
        valueUsd: h.valueUsd,
      }));

      // Analyze portfolio
      const analysis = analyzePortfolio(finalHoldings);

      // Generate AI advice
      const chainLabel = chain === "all" ? "multi-chain (Ethereum, Base, Arbitrum, Hyperliquid)" : chain;
      const advice = await generateAdvice(analysis, chainLabel);

      const result: PortfolioAnalysis = {
        ...analysis,
        advice,
      };

      console.log(`[analyze-wallet] Analysis complete. Total: $${result.totalValueUsd.toFixed(2)}`);

      return {
        output: {
          address,
          chain: chain === "all" ? "all (ethereum+base+arbitrum+hyperliquid)" : chain,
          ...result,
        },
      };
    } catch (error) {
      console.error("[analyze-wallet] Error:", error);
      throw new Error(
        `Failed to analyze wallet: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  },
});

// Health check endpoint (free)
addEntrypoint({
  key: "health",
  description: "Health check endpoint",
  input: z.object({}),
  handler: async () => {
    return {
      output: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: process.env.AGENT_VERSION ?? "1.0.0",
      },
    };
  },
});

export { app };
