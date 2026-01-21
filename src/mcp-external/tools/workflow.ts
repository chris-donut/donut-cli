/**
 * Workflow MCP Tools - Agent Execution & Trust Layer
 *
 * High-level workflow primitives that compose existing tools:
 * - donut_research: Market context aggregation
 * - donut_plan: Trade plan generation
 * - donut_pretrade_check: Policy enforcement gate
 * - donut_execute: Validated plan execution
 * - donut_report: Posttrade analysis
 */

import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import * as path from "path";
import { handleTrending, handleSearchMentions } from "./social-signals.js";
import { handleTokenSearch } from "./token-search.js";
import { handleWalletStatus, handleMultiChainWalletStatus } from "./wallet.js";
import { handleBaseWalletStatus } from "./base-wallet.js";
import { handleQuote } from "./swap.js";
import { handleBaseQuote, detectChainFromToken } from "./base-swap.js";

// ============================================================================
// Types
// ============================================================================

export interface ResearchResult {
  success: boolean;
  query: string;
  queryType: "token" | "narrative";
  data?: {
    sentiment: "bullish" | "neutral" | "bearish";
    sentimentScore: number; // -1 to 1
    keyLevels?: {
      support?: number;
      resistance?: number;
      currentPrice?: number;
    };
    recentNews: Array<{
      source: string;
      title: string;
      url: string;
      timestamp: string;
    }>;
    socialMentions: {
      count: number;
      trending: boolean;
      topSources: Array<{
        platform: string;
        author: string;
        text: string;
        engagement: number;
      }>;
    };
    riskFactors: string[];
    tokenInfo?: {
      symbol: string;
      name: string;
      address: string;
      chain: string;
      warning?: string;
    };
  };
  error?: string;
}

export interface TradePlan {
  planId: string;
  createdAt: string;
  thesis: string;
  token: string;
  chain: string;
  direction: "long" | "short";
  entry: number;
  target: number;
  stopLoss: number;
  size: number;
  sizeUsd: number;
  riskPercent: number;
  invalidation: string;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  pretradeStatus?: "pending" | "passed" | "failed";
  pretradeViolations?: string[];
}

export interface PlanResult {
  success: boolean;
  plan?: TradePlan;
  error?: string;
}

export interface PretradeResult {
  success: boolean;
  planId: string;
  passed: boolean;
  violations: string[];
  warnings: string[];
  timestamp: string;
}

export interface ExecutionResult {
  success: boolean;
  executionId?: string;
  planId?: string;
  status?: "pending" | "confirmed" | "failed" | "retrying";
  fills?: Array<{
    price: number;
    size: number;
    timestamp: string;
  }>;
  avgPrice?: number;
  fees?: number;
  txSignature?: string;
  error?: string;
  recoveryInstructions?: string;
}

export interface ReportResult {
  success: boolean;
  executionId?: string;
  report?: {
    plan: TradePlan;
    execution: {
      status: string;
      avgPrice: number;
      fees: number;
      timestamp: string;
    };
    slippage: number;
    slippagePercent: number;
    pnlIfClosed?: number;
    pnlPercent?: number;
    holdingPeriod?: string;
    currentPrice?: number;
  };
  error?: string;
}

// ============================================================================
// Storage Paths
// ============================================================================

const DONUT_DIR = path.join(process.env.HOME || "~", ".donut");
const PLANS_DIR = path.join(DONUT_DIR, "plans");
const EXECUTIONS_DIR = path.join(DONUT_DIR, "executions");

function ensureDirectories(): void {
  if (!fs.existsSync(DONUT_DIR)) {
    fs.mkdirSync(DONUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(PLANS_DIR)) {
    fs.mkdirSync(PLANS_DIR, { recursive: true });
  }
  if (!fs.existsSync(EXECUTIONS_DIR)) {
    fs.mkdirSync(EXECUTIONS_DIR, { recursive: true });
  }
}

function savePlan(plan: TradePlan): void {
  ensureDirectories();
  const filePath = path.join(PLANS_DIR, `${plan.planId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(plan, null, 2));
}

function loadPlan(planId: string): TradePlan | null {
  const filePath = path.join(PLANS_DIR, `${planId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveExecution(executionId: string, data: Record<string, unknown>): void {
  ensureDirectories();
  const filePath = path.join(EXECUTIONS_DIR, `${executionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadExecution(executionId: string): Record<string, unknown> | null {
  const filePath = path.join(EXECUTIONS_DIR, `${executionId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// ============================================================================
// WFL-001: Research Tool
// ============================================================================

/**
 * Aggregate market context from multiple sources
 */
export async function handleResearch(params: {
  query: string;
}): Promise<ResearchResult> {
  const { query } = params;

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      query: "",
      queryType: "narrative",
      error: "Query is required",
    };
  }

  const cleanQuery = query.trim();

  // Determine if this is a token query or narrative query
  const isTokenQuery =
    cleanQuery.startsWith("$") ||
    cleanQuery.match(/^[A-Za-z0-9]{32,44}$/) || // Solana address
    cleanQuery.match(/^0x[a-fA-F0-9]{40}$/) || // EVM address
    cleanQuery.length <= 10; // Short symbol like "SOL", "ETH"

  const queryType = isTokenQuery ? "token" : "narrative";
  const searchTerm = cleanQuery.replace(/^\$/, ""); // Remove $ prefix if present

  try {
    // Parallel fetch from multiple sources
    const [trendingResult, mentionsResult, tokenResult] = await Promise.all([
      handleTrending({ limit: 20, minMentions: 1, timeWindow: "24h" }),
      handleSearchMentions({ query: searchTerm, limit: 20 }),
      isTokenQuery ? handleTokenSearch(searchTerm) : Promise.resolve(null),
    ]);

    // Aggregate sentiment
    let sentimentScore = 0;
    let mentionCount = 0;

    // From trending
    if (trendingResult.success && trendingResult.signals) {
      for (const signal of trendingResult.signals) {
        if (
          signal.token.toLowerCase().includes(searchTerm.toLowerCase()) ||
          searchTerm.toLowerCase().includes(signal.token.toLowerCase())
        ) {
          mentionCount += signal.mentions;
          if (signal.sentiment === "positive") sentimentScore += signal.mentions;
          else if (signal.sentiment === "negative") sentimentScore -= signal.mentions;
        }
      }
    }

    // From search mentions
    if (mentionsResult.success && mentionsResult.signals) {
      for (const signal of mentionsResult.signals) {
        mentionCount += signal.mentions;
        if (signal.sentiment === "positive") sentimentScore += signal.mentions;
        else if (signal.sentiment === "negative") sentimentScore -= signal.mentions;
      }
    }

    // Normalize sentiment score to -1 to 1
    const normalizedSentiment = mentionCount > 0 ? sentimentScore / mentionCount : 0;

    // Determine sentiment label
    let sentiment: "bullish" | "neutral" | "bearish" = "neutral";
    if (normalizedSentiment > 0.3) sentiment = "bullish";
    else if (normalizedSentiment < -0.3) sentiment = "bearish";

    // Check if trending
    const isTrending =
      trendingResult.success &&
      trendingResult.signals?.some(
        (s) =>
          s.token.toLowerCase() === searchTerm.toLowerCase() && s.mentions >= 3
      );

    // Extract top social sources
    const topSources: Array<{
      platform: string;
      author: string;
      text: string;
      engagement: number;
    }> = [];

    if (mentionsResult.success && mentionsResult.signals) {
      for (const signal of mentionsResult.signals.slice(0, 3)) {
        for (const source of signal.sources.slice(0, 2)) {
          topSources.push({
            platform: source.platform,
            author: source.author,
            text: source.text,
            engagement:
              source.engagement.likes +
              source.engagement.recasts +
              source.engagement.replies,
          });
        }
      }
    }

    // Build risk factors
    const riskFactors: string[] = [];

    if (mentionCount < 5) {
      riskFactors.push("Low social activity - limited market data");
    }
    if (sentiment === "bearish") {
      riskFactors.push("Negative social sentiment detected");
    }
    if (tokenResult && tokenResult.results?.length > 1) {
      riskFactors.push(
        "Multiple tokens with similar names - verify contract address"
      );
    }
    const firstTokenResult = tokenResult?.results?.[0];
    if (firstTokenResult?.warning) {
      riskFactors.push(firstTokenResult.warning);
    }

    // Token info if available
    let tokenInfo: {
      symbol: string;
      name: string;
      address: string;
      chain: string;
      warning?: string;
    } | undefined;
    if (tokenResult && tokenResult.success && tokenResult.results?.length > 0) {
      const token = tokenResult.results[0];
      const chain = detectChainFromToken(token.address);
      tokenInfo = {
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        chain: chain || "unknown",
        warning: token.warning,
      };
    }

    // Build recent news (from social sources for now)
    const recentNews = topSources.slice(0, 5).map((s) => ({
      source: `Farcaster - @${s.author}`,
      title: s.text.slice(0, 100) + (s.text.length > 100 ? "..." : ""),
      url: `https://warpcast.com/${s.author}`,
      timestamp: new Date().toISOString(),
    }));

    return {
      success: true,
      query: cleanQuery,
      queryType,
      data: {
        sentiment,
        sentimentScore: Math.round(normalizedSentiment * 100) / 100,
        recentNews,
        socialMentions: {
          count: mentionCount,
          trending: isTrending || false,
          topSources: topSources.slice(0, 5),
        },
        riskFactors,
        tokenInfo,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      query: cleanQuery,
      queryType,
      error: `Research failed: ${message}`,
    };
  }
}

// ============================================================================
// WFL-002: Plan Tool
// ============================================================================

/**
 * Generate a structured trade plan
 */
export async function handlePlan(params: {
  thesis: string;
  token: string;
  direction: "long" | "short";
  riskPercent: number;
  timeHorizon?: string;
}): Promise<PlanResult> {
  const { thesis, token, direction, riskPercent, timeHorizon } = params;

  // Validate inputs
  if (!thesis || thesis.trim().length === 0) {
    return { success: false, error: "Thesis is required" };
  }
  if (!token || token.trim().length === 0) {
    return { success: false, error: "Token is required" };
  }
  if (!["long", "short"].includes(direction)) {
    return { success: false, error: "Direction must be 'long' or 'short'" };
  }
  if (riskPercent <= 0 || riskPercent > 100) {
    return { success: false, error: "Risk percent must be between 0 and 100" };
  }

  try {
    // Detect chain and get quote
    const chain = detectChainFromToken(token);
    let currentPrice = 0;
    let portfolioValue = 0;

    if (chain === "solana") {
      // Get SOL balance and price
      const walletStatus = await handleWalletStatus();
      if (walletStatus.connected && walletStatus.balance) {
        // Estimate portfolio value (SOL balance * ~$150 rough estimate)
        portfolioValue = walletStatus.balance.sol * 150;
      }

      // Get token price via quote
      const quote = await handleQuote({
        fromToken: "SOL",
        toToken: token,
        amount: 1,
      });
      if (quote.success && quote.expectedOutput) {
        currentPrice = 1 / parseFloat(quote.expectedOutput); // Price in SOL terms
      }
    } else if (chain === "base") {
      // Get ETH balance
      const walletStatus = await handleBaseWalletStatus();
      if (walletStatus.connected && walletStatus.balance) {
        portfolioValue = parseFloat(walletStatus.balance.eth) * 3500; // Rough ETH price
      }

      const quote = await handleBaseQuote({
        fromToken: "ETH",
        toToken: token,
        amount: 0.01,
      });
      if (quote.success && quote.toToken?.expectedOutput) {
        currentPrice = 0.01 / parseFloat(quote.toToken.expectedOutput);
      }
    } else {
      // Try multi-chain wallet status
      const multiWallet = await handleMultiChainWalletStatus();
      if (multiWallet.solana?.connected && multiWallet.solana?.balance) {
        portfolioValue += (multiWallet.solana.balance.sol || 0) * 150;
      }
      if (multiWallet.base?.connected && multiWallet.base?.balance) {
        portfolioValue += parseFloat(multiWallet.base.balance.eth || "0") * 3500;
      }
    }

    // Calculate position sizing
    const riskAmount = portfolioValue * (riskPercent / 100);

    // Default stop loss: 5% for longs, -5% for shorts
    const stopLossPercent = 0.05;
    const stopLoss =
      direction === "long"
        ? currentPrice * (1 - stopLossPercent)
        : currentPrice * (1 + stopLossPercent);

    // Calculate size based on risk and stop loss
    const maxLossPerUnit = Math.abs(currentPrice - stopLoss);
    const size = maxLossPerUnit > 0 ? riskAmount / maxLossPerUnit : 0;
    const sizeUsd = size * currentPrice;

    // Default target: 2:1 reward:risk
    const target =
      direction === "long"
        ? currentPrice + 2 * (currentPrice - stopLoss)
        : currentPrice - 2 * (stopLoss - currentPrice);

    // Build warnings
    const warnings: string[] = [];
    if (portfolioValue === 0) {
      warnings.push("Could not determine portfolio value - size may be inaccurate");
    }
    if (currentPrice === 0) {
      warnings.push("Could not fetch current price - using placeholder values");
    }
    if (riskPercent > 5) {
      warnings.push("Risk exceeds 5% of portfolio - consider reducing position size");
    }
    if (direction === "short" && chain === "solana") {
      warnings.push("Short positions require perps - consider Hyperliquid");
    }

    // Determine confidence
    let confidence: "high" | "medium" | "low" = "medium";
    if (warnings.length === 0 && portfolioValue > 0 && currentPrice > 0) {
      confidence = "high";
    } else if (warnings.length > 2) {
      confidence = "low";
    }

    // Build invalidation condition
    const invalidation =
      direction === "long"
        ? `Price closes below ${stopLoss.toFixed(6)} (stop loss)`
        : `Price closes above ${stopLoss.toFixed(6)} (stop loss)`;

    const plan: TradePlan = {
      planId: uuidv4(),
      createdAt: new Date().toISOString(),
      thesis: thesis.trim(),
      token: token.trim(),
      chain: chain || "unknown",
      direction,
      entry: currentPrice,
      target,
      stopLoss,
      size,
      sizeUsd,
      riskPercent,
      invalidation,
      confidence,
      warnings,
      pretradeStatus: "pending",
    };

    // Save plan to disk
    savePlan(plan);

    return {
      success: true,
      plan,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Plan generation failed: ${message}`,
    };
  }
}

// ============================================================================
// WFL-004: Execute Tool
// ============================================================================

/**
 * Execute a validated trade plan
 */
export async function handleExecute(params: {
  planId: string;
}): Promise<ExecutionResult> {
  const { planId } = params;

  if (!planId || planId.trim().length === 0) {
    return { success: false, error: "planId is required" };
  }

  // Load the plan
  const plan = loadPlan(planId);
  if (!plan) {
    return { success: false, error: `Plan not found: ${planId}` };
  }

  // Verify pretrade check passed
  if (plan.pretradeStatus !== "passed") {
    return {
      success: false,
      planId,
      error: `Pretrade check not passed. Status: ${plan.pretradeStatus || "not checked"}. Call donut_pretrade_check first.`,
      recoveryInstructions: "Call donut_pretrade_check with this planId before executing.",
    };
  }

  const executionId = uuidv4();
  const executionData: Record<string, unknown> = {
    executionId,
    planId,
    plan,
    startedAt: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
  };

  try {
    // Route to appropriate venue based on chain
    let swapResult: {
      success: boolean;
      status?: string;
      transactionSignature?: string;
      txHash?: string;
      error?: string;
      outputAmount?: string;
      actualOutput?: string;
    };

    if (plan.chain === "solana") {
      // Import and use Solana swap
      const { handleSwap } = await import("./swap.js");

      // For longs, we buy the token with SOL/USDC
      // For shorts on spot, we sell the token for SOL/USDC
      if (plan.direction === "long") {
        swapResult = await handleSwap({
          fromToken: "SOL",
          toToken: plan.token,
          amount: plan.sizeUsd / 150, // Rough SOL conversion
          slippage: 1.0, // 1% slippage for execution
        });
      } else {
        // Short = sell
        swapResult = await handleSwap({
          fromToken: plan.token,
          toToken: "SOL",
          amount: plan.size,
          slippage: 1.0,
        });
      }
    } else if (plan.chain === "base") {
      // Import and use Base swap
      const { handleBaseSwap } = await import("./base-swap.js");

      if (plan.direction === "long") {
        swapResult = await handleBaseSwap({
          fromToken: "ETH",
          toToken: plan.token,
          amount: plan.sizeUsd / 3500, // Rough ETH conversion
          slippage: 1.0,
        });
      } else {
        swapResult = await handleBaseSwap({
          fromToken: plan.token,
          toToken: "ETH",
          amount: plan.size,
          slippage: 1.0,
        });
      }
    } else {
      return {
        success: false,
        executionId,
        planId,
        status: "failed",
        error: `Unsupported chain: ${plan.chain}. Supported: solana, base`,
      };
    }

    // Handle failure with retry (per PRD: retry once then fail)
    if (!swapResult.success && executionData.retryCount === 0) {
      executionData.retryCount = 1;
      executionData.status = "retrying";
      saveExecution(executionId, executionData);

      // Wait 2 seconds and retry
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Retry the swap
      if (plan.chain === "solana") {
        const { handleSwap } = await import("./swap.js");
        swapResult =
          plan.direction === "long"
            ? await handleSwap({
                fromToken: "SOL",
                toToken: plan.token,
                amount: plan.sizeUsd / 150,
                slippage: 1.5, // Increase slippage on retry
              })
            : await handleSwap({
                fromToken: plan.token,
                toToken: "SOL",
                amount: plan.size,
                slippage: 1.5,
              });
      } else {
        const { handleBaseSwap } = await import("./base-swap.js");
        swapResult =
          plan.direction === "long"
            ? await handleBaseSwap({
                fromToken: "ETH",
                toToken: plan.token,
                amount: plan.sizeUsd / 3500,
                slippage: 1.5,
              })
            : await handleBaseSwap({
                fromToken: plan.token,
                toToken: "ETH",
                amount: plan.size,
                slippage: 1.5,
              });
      }
    }

    // Final status
    if (swapResult.success) {
      executionData.status = "confirmed";
      executionData.txSignature =
        swapResult.transactionSignature || swapResult.txHash;
      executionData.avgPrice = plan.entry; // Use plan entry as approximation
      executionData.fills = [
        {
          price: plan.entry,
          size: plan.size,
          timestamp: new Date().toISOString(),
        },
      ];
      executionData.fees = plan.sizeUsd * 0.003; // Estimate 0.3% fees
      executionData.completedAt = new Date().toISOString();

      saveExecution(executionId, executionData);

      // Log execution for cooldown and position limit tracking
      const { logExecution } = await import("./policy.js");
      logExecution({
        planId,
        timestamp: new Date().toISOString(),
        token: plan.token,
        direction: plan.direction,
        riskPercent: plan.riskPercent,
        sizeUsd: plan.sizeUsd,
      });

      return {
        success: true,
        executionId,
        planId,
        status: "confirmed",
        fills: executionData.fills as Array<{
          price: number;
          size: number;
          timestamp: string;
        }>,
        avgPrice: executionData.avgPrice as number,
        fees: executionData.fees as number,
        txSignature: executionData.txSignature as string,
      };
    } else {
      executionData.status = "failed";
      executionData.error = swapResult.error;
      executionData.completedAt = new Date().toISOString();
      saveExecution(executionId, executionData);

      return {
        success: false,
        executionId,
        planId,
        status: "failed",
        error: swapResult.error,
        recoveryInstructions:
          "Check wallet balance and network status. You may retry by calling donut_execute again with the same planId.",
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    executionData.status = "failed";
    executionData.error = message;
    executionData.completedAt = new Date().toISOString();
    saveExecution(executionId, executionData);

    return {
      success: false,
      executionId,
      planId,
      status: "failed",
      error: `Execution failed: ${message}`,
      recoveryInstructions:
        "Check wallet configuration and network connectivity.",
    };
  }
}

// ============================================================================
// WFL-005: Report Tool
// ============================================================================

/**
 * Generate posttrade analysis report
 */
export async function handleReport(params: {
  executionId: string;
}): Promise<ReportResult> {
  const { executionId } = params;

  if (!executionId || executionId.trim().length === 0) {
    return { success: false, error: "executionId is required" };
  }

  // Load execution data
  const executionData = loadExecution(executionId);
  if (!executionData) {
    return { success: false, executionId, error: `Execution not found: ${executionId}` };
  }

  // Load the associated plan
  const planId = executionData.planId as string;
  const plan = loadPlan(planId);
  if (!plan) {
    return {
      success: false,
      executionId,
      error: `Associated plan not found: ${planId}`,
    };
  }

  // Get current price for PnL calculation
  let currentPrice = plan.entry;
  try {
    if (plan.chain === "solana") {
      const quote = await handleQuote({
        fromToken: "SOL",
        toToken: plan.token,
        amount: 1,
      });
      if (quote.success && quote.expectedOutput) {
        currentPrice = 1 / parseFloat(quote.expectedOutput);
      }
    } else if (plan.chain === "base") {
      const quote = await handleBaseQuote({
        fromToken: "ETH",
        toToken: plan.token,
        amount: 0.01,
      });
      if (quote.success && quote.toToken?.expectedOutput) {
        currentPrice = 0.01 / parseFloat(quote.toToken.expectedOutput);
      }
    }
  } catch {
    // Use plan entry if current price fetch fails
    currentPrice = plan.entry;
  }

  // Calculate metrics
  const avgPrice = (executionData.avgPrice as number) || plan.entry;
  const slippage = avgPrice - plan.entry;
  const slippagePercent = plan.entry > 0 ? (slippage / plan.entry) * 100 : 0;

  // Calculate PnL
  let pnlIfClosed = 0;
  let pnlPercent = 0;
  if (currentPrice && plan.size > 0) {
    if (plan.direction === "long") {
      pnlIfClosed = (currentPrice - avgPrice) * plan.size;
    } else {
      pnlIfClosed = (avgPrice - currentPrice) * plan.size;
    }
    pnlPercent = avgPrice > 0 ? (pnlIfClosed / (avgPrice * plan.size)) * 100 : 0;
  }

  // Calculate holding period
  const startTime = new Date(executionData.completedAt as string || executionData.startedAt as string);
  const now = new Date();
  const holdingMs = now.getTime() - startTime.getTime();
  const holdingHours = Math.floor(holdingMs / (1000 * 60 * 60));
  const holdingMinutes = Math.floor((holdingMs % (1000 * 60 * 60)) / (1000 * 60));
  const holdingPeriod =
    holdingHours > 0
      ? `${holdingHours}h ${holdingMinutes}m`
      : `${holdingMinutes}m`;

  return {
    success: true,
    executionId,
    report: {
      plan,
      execution: {
        status: executionData.status as string,
        avgPrice,
        fees: (executionData.fees as number) || 0,
        timestamp: (executionData.completedAt as string) || (executionData.startedAt as string),
      },
      slippage: Math.round(slippage * 1000000) / 1000000,
      slippagePercent: Math.round(slippagePercent * 100) / 100,
      pnlIfClosed: Math.round(pnlIfClosed * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      holdingPeriod,
      currentPrice: Math.round(currentPrice * 1000000) / 1000000,
    },
  };
}

// ============================================================================
// Exports for server.ts
// ============================================================================

export {
  loadPlan,
  savePlan,
  loadExecution,
  saveExecution,
  ensureDirectories,
};
