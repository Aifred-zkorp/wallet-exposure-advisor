# 💼 Wallet Exposure Advisor

AI-powered wallet exposure analyzer with rebalancing advice for **EVM** and **Starknet** wallets.

Built with [Lucid Agents SDK](https://github.com/daydreamsai/lucid-agents) • Payments via [x402](https://x402.org)

## ✨ Features

- **Multi-chain support**: Ethereum, Base, Arbitrum, Starknet
- **Real-time analysis**: Fetches live balances and prices
- **AI-powered advice**: GPT-4o-mini generates personalized rebalancing recommendations
- **Risk assessment**: Identifies concentration risk, stablecoin exposure, and overall portfolio risk level
- **x402 payments**: Pay-per-use model ($0.10 per analysis)

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- OpenAI API key (for AI advice)
- Wallet private key (for x402 payments)

### Installation

```bash
bun install
```

### Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:
- `OPENAI_API_KEY` - For AI-powered advice
- `PRIVATE_KEY` - Wallet private key for signing x402 payments
- `PAYMENTS_RECEIVABLE_ADDRESS` - Your address to receive payments

### Run

```bash
bun run dev
```

Agent runs at `http://localhost:3000`

## 📡 API Endpoints

### `POST /entrypoints/analyze-wallet/invoke`

Analyze a wallet's exposure and get rebalancing advice.

**Request:**
```json
{
  "input": {
    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f...",
    "chain": "ethereum"
  }
}
```

**Supported chains:** `ethereum`, `base`, `arbitrum`, `starknet`

**Response:**
```json
{
  "output": {
    "address": "0x...",
    "chain": "ethereum",
    "totalValueUsd": 15420.50,
    "holdings": [
      {
        "symbol": "ETH",
        "balance": "5.25",
        "valueUsd": 13125.00,
        "percentage": 85.1,
        "category": "native"
      },
      {
        "symbol": "USDC",
        "balance": "2295.50",
        "valueUsd": 2295.50,
        "percentage": 14.9,
        "category": "stablecoin"
      }
    ],
    "riskLevel": "high",
    "stablecoinPercentage": 14.9,
    "volatilePercentage": 85.1,
    "concentrationRisk": true,
    "advice": "⚠️ **High Risk Portfolio**: Your ETH position at 85% creates significant concentration risk..."
  }
}
```

### `POST /entrypoints/health/invoke`

Health check (free).

```json
{
  "output": {
    "status": "healthy",
    "timestamp": "2026-01-31T10:00:00.000Z",
    "version": "1.0.0"
  }
}
```

## 🏗️ Architecture

```
src/
├── index.ts           # Entry point
└── lib/
    ├── agent.ts       # Agent config + endpoints
    ├── evm.ts         # EVM wallet balance fetching (viem)
    ├── starknet.ts    # Starknet wallet balance fetching
    ├── prices.ts      # Price fetching (DefiLlama)
    └── advisor.ts     # AI advice generation
```

## 💰 Pricing

- `analyze-wallet`: $0.10 per request (paid via x402/USDC)
- `health`: Free

## 🔧 Tech Stack

- **Runtime**: Bun
- **Framework**: Lucid Agents SDK + Hono
- **EVM**: viem
- **Starknet**: starknet.js
- **Prices**: DefiLlama API
- **AI**: OpenAI GPT-4o-mini
- **Payments**: x402 protocol

## 📝 License

MIT

## 🦞 Lobster Combinator

Built for the [Lobster Combinator](https://github.com/langoustine69/lobster-combinator) bounty by **zKorp**.
