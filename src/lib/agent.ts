import { z } from "zod";
import { createAgentApp } from "@lucid-agents/hono";
import { createAgent } from "@lucid-agents/core";
import { http } from "@lucid-agents/http";
import { payments, paymentsFromEnv } from "@lucid-agents/payments";

import { getEVMWalletBalances } from "./evm";
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
  chain: z.enum(["ethereum", "base", "arbitrum", "starknet"]).default("ethereum"),
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

// Main endpoint: Analyze wallet exposure
addEntrypoint({
  key: "analyze-wallet",
  description:
    "Analyze a wallet's token exposure and get AI-powered rebalancing advice. Supports Ethereum, Base, Arbitrum, and Starknet.",
  input: analyzeWalletInput,
  output: analyzeWalletOutput,
  // Price: $0.10 per analysis (configured via DEFAULT_PRICE env)
  handler: async (ctx) => {
    const { address, chain } = ctx.input;

    console.log(`[analyze-wallet] Analyzing ${address} on ${chain}...`);

    try {
      // Fetch balances based on chain
      let holdings: Array<{ symbol: string; balance: string; valueUsd: number }> = [];

      if (chain === "starknet") {
        // Starknet wallet
        const balances = await getStarknetWalletBalances(address);
        const ethPrice = await getEthPrice();
        
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
        // EVM wallet
        const balances = await getEVMWalletBalances(
          address,
          chain as "ethereum" | "base" | "arbitrum"
        );
        const ethPrice = await getEthPrice();

        // Get token prices
        const allTokens = [
          { chain, address: balances.nativeBalance.address, symbol: "ETH" },
          ...balances.tokenBalances.map((t) => ({
            chain,
            address: t.address,
            symbol: t.symbol,
          })),
        ];
        const tokenPrices = await getTokenPrices(allTokens);

        // Add native balance (ETH)
        const nativeValueUsd =
          parseFloat(balances.nativeBalance.formattedBalance) * ethPrice;
        if (nativeValueUsd > 0.01) {
          holdings.push({
            symbol: "ETH",
            balance: balances.nativeBalance.formattedBalance,
            valueUsd: nativeValueUsd,
          });
        }

        // Add token balances
        for (const token of balances.tokenBalances) {
          let price = 0;
          if (["USDC", "USDT", "DAI", "USDbC"].includes(token.symbol)) {
            price = 1;
          } else if (token.symbol === "WETH") {
            price = ethPrice;
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
            });
          }
        }
      }

      // Analyze portfolio
      const analysis = analyzePortfolio(holdings);

      // Generate AI advice
      const advice = await generateAdvice(analysis, chain);

      const result: PortfolioAnalysis = {
        ...analysis,
        advice,
      };

      console.log(`[analyze-wallet] Analysis complete. Total: $${result.totalValueUsd.toFixed(2)}`);

      return {
        output: {
          address,
          chain,
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
