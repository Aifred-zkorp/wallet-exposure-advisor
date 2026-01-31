// AI-powered portfolio advisor
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

export interface PortfolioHolding {
  symbol: string;
  balance: string;
  valueUsd: number;
  percentage: number;
  category: "native" | "stablecoin" | "defi" | "volatile" | "other";
}

export interface PortfolioAnalysis {
  totalValueUsd: number;
  holdings: PortfolioHolding[];
  riskLevel: "low" | "medium" | "high" | "very-high";
  stablecoinPercentage: number;
  volatilePercentage: number;
  concentrationRisk: boolean;
  advice: string;
}

// Categorize tokens
function categorizeToken(symbol: string): PortfolioHolding["category"] {
  const stablecoins = ["USDC", "USDT", "DAI", "FRAX", "LUSD", "USDbC", "BUSD"];
  const natives = ["ETH", "STRK", "BTC", "WBTC", "WETH"];
  const defi = ["AAVE", "UNI", "LINK", "CRV", "LDO", "ARB", "OP", "MKR", "COMP"];

  if (stablecoins.includes(symbol)) return "stablecoin";
  if (natives.includes(symbol)) return "native";
  if (defi.includes(symbol)) return "defi";
  return "volatile";
}

// Calculate risk level based on portfolio composition
function calculateRiskLevel(
  stablecoinPct: number,
  concentrationRisk: boolean
): PortfolioAnalysis["riskLevel"] {
  if (stablecoinPct >= 50) return "low";
  if (stablecoinPct >= 30 && !concentrationRisk) return "medium";
  if (stablecoinPct >= 10) return "high";
  return "very-high";
}

export function analyzePortfolio(
  holdings: Array<{ symbol: string; balance: string; valueUsd: number }>
): Omit<PortfolioAnalysis, "advice"> {
  const totalValueUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

  const enrichedHoldings: PortfolioHolding[] = holdings
    .filter((h) => h.valueUsd > 0.01) // Filter dust
    .map((h) => ({
      symbol: h.symbol,
      balance: h.balance,
      valueUsd: h.valueUsd,
      percentage: totalValueUsd > 0 ? (h.valueUsd / totalValueUsd) * 100 : 0,
      category: categorizeToken(h.symbol),
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const stablecoinPercentage = enrichedHoldings
    .filter((h) => h.category === "stablecoin")
    .reduce((sum, h) => sum + h.percentage, 0);

  const volatilePercentage = enrichedHoldings
    .filter((h) => h.category !== "stablecoin")
    .reduce((sum, h) => sum + h.percentage, 0);

  // Check concentration risk (any single asset > 50%)
  const concentrationRisk = enrichedHoldings.some((h) => h.percentage > 50);

  const riskLevel = calculateRiskLevel(stablecoinPercentage, concentrationRisk);

  return {
    totalValueUsd,
    holdings: enrichedHoldings,
    riskLevel,
    stablecoinPercentage,
    volatilePercentage,
    concentrationRisk,
  };
}

export async function generateAdvice(
  analysis: Omit<PortfolioAnalysis, "advice">,
  chain: string
): Promise<string> {
  const holdingsSummary = analysis.holdings
    .slice(0, 10)
    .map((h) => `- ${h.symbol}: ${h.percentage.toFixed(1)}% ($${h.valueUsd.toFixed(2)})`)
    .join("\n");

  const prompt = `You are a crypto portfolio advisor. Analyze this wallet and provide specific, actionable advice.

**Chain:** ${chain}
**Total Value:** $${analysis.totalValueUsd.toFixed(2)}
**Risk Level:** ${analysis.riskLevel}
**Stablecoin Exposure:** ${analysis.stablecoinPercentage.toFixed(1)}%
**Volatile Exposure:** ${analysis.volatilePercentage.toFixed(1)}%
**Concentration Risk:** ${analysis.concentrationRisk ? "YES - Single asset > 50%" : "No"}

**Holdings:**
${holdingsSummary}

Provide:
1. **Risk Assessment** (2-3 sentences)
2. **Rebalancing Suggestions** (specific percentages)
3. **Action Items** (3-5 bullet points)

Be direct and specific. Reference actual tokens in the portfolio. Consider current market conditions (crypto is volatile, stablecoins provide safety).`;

  try {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt,
    });
    return text;
  } catch (error) {
    // Fallback to rule-based advice if LLM fails
    console.error("LLM error, using fallback advice:", error);
    return generateFallbackAdvice(analysis);
  }
}

function generateFallbackAdvice(
  analysis: Omit<PortfolioAnalysis, "advice">
): string {
  const advice: string[] = [];

  // Risk assessment
  if (analysis.riskLevel === "very-high") {
    advice.push(
      "⚠️ **High Risk Portfolio**: Your exposure to volatile assets is significant with minimal stablecoin buffer."
    );
  } else if (analysis.riskLevel === "high") {
    advice.push(
      "⚡ **Elevated Risk**: Consider increasing stablecoin allocation to reduce volatility impact."
    );
  } else if (analysis.riskLevel === "medium") {
    advice.push(
      "📊 **Balanced Risk**: Your portfolio has reasonable diversification but could be optimized."
    );
  } else {
    advice.push(
      "🛡️ **Conservative Portfolio**: Strong stablecoin position provides good downside protection."
    );
  }

  // Concentration risk
  if (analysis.concentrationRisk) {
    const topHolding = analysis.holdings[0];
    advice.push(
      `\n🎯 **Concentration Alert**: ${topHolding.symbol} represents ${topHolding.percentage.toFixed(1)}% of your portfolio. Consider diversifying to reduce single-asset risk.`
    );
  }

  // Rebalancing suggestions
  advice.push("\n**Suggested Allocation:**");
  if (analysis.stablecoinPercentage < 20) {
    advice.push("- Increase stablecoins to 20-30% for market volatility protection");
  }
  if (analysis.volatilePercentage > 80) {
    advice.push("- Reduce volatile asset exposure to ~70% maximum");
  }

  // Action items
  advice.push("\n**Action Items:**");
  advice.push("- Set stop-losses on volatile positions");
  advice.push("- Consider DCA (Dollar Cost Average) for new entries");
  if (analysis.totalValueUsd > 10000) {
    advice.push("- Review security: hardware wallet recommended for this portfolio size");
  }

  return advice.join("\n");
}
