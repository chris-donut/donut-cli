/**
 * Jupiter Swap Execution
 *
 * Integrates with Jupiter Aggregator API v6 for Solana token swaps.
 * Implements transaction safety guards and clear status reporting.
 */

import {
  Connection,
  VersionedTransaction,
} from "@solana/web3.js";
import { getWalletForSigning, getWalletPublicKey } from "./wallet.js";

// Jupiter API v6 endpoint
const JUPITER_API = "https://api.jup.ag";
const SOLANA_RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Common token addresses
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Jupiter API response types
interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

export interface QuoteParams {
  fromToken: string;
  toToken: string;
  amount: number;
  slippage?: number; // in percentage, e.g., 0.5 for 0.5%
}

export interface QuoteResult {
  success: boolean;
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  expectedOutput: string;
  minimumOutput: string;
  priceImpact: string;
  route: string;
  slippage: number;
  error?: string;
}

export interface SwapParams extends QuoteParams {
  // Additional swap-specific params can go here
}

export interface SwapResult {
  success: boolean;
  status: "signed" | "submitted" | "confirmed" | "failed" | "pending";
  transactionSignature?: string;
  inputAmount?: string;
  outputAmount?: string;
  actualOutput?: string;
  quotedOutput?: string;
  error?: string;
  recoveryInstructions?: string;
}

/**
 * Resolve token symbol to mint address
 */
function resolveTokenMint(token: string): string {
  const normalized = token.toUpperCase();

  // Common token mappings
  const tokenMap: Record<string, string> = {
    SOL: SOL_MINT,
    WSOL: SOL_MINT,
    USDC: USDC_MINT,
  };

  // If it looks like a mint address, use it directly
  if (token.length >= 32 && !token.includes("/")) {
    return token;
  }

  return tokenMap[normalized] || token;
}

/**
 * Get a quote for a swap without executing
 */
export async function handleQuote(params: QuoteParams): Promise<QuoteResult> {
  const { fromToken, toToken, amount, slippage = 0.5 } = params;

  const inputMint = resolveTokenMint(fromToken);
  const outputMint = resolveTokenMint(toToken);
  const slippageBps = Math.round(slippage * 100); // Convert percentage to basis points

  try {
    // Jupiter expects amount in smallest unit (lamports for SOL)
    // For simplicity, assume 9 decimals for SOL, 6 for USDC
    const decimals = inputMint === SOL_MINT ? 9 : 6;
    const amountInSmallestUnit = Math.round(amount * Math.pow(10, decimals));

    const quoteUrl = new URL(`${JUPITER_API}/quote`);
    quoteUrl.searchParams.set("inputMint", inputMint);
    quoteUrl.searchParams.set("outputMint", outputMint);
    quoteUrl.searchParams.set("amount", amountInSmallestUnit.toString());
    quoteUrl.searchParams.set("slippageBps", slippageBps.toString());

    const response = await fetch(quoteUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        inputMint,
        outputMint,
        inputAmount: amount.toString(),
        outputAmount: "0",
        expectedOutput: "0",
        minimumOutput: "0",
        priceImpact: "0",
        route: "",
        slippage,
        error: `Jupiter API error: ${errorText}`,
      };
    }

    const quote = (await response.json()) as JupiterQuoteResponse;

    // Parse output amounts
    const outDecimals = outputMint === USDC_MINT ? 6 : 9;
    const expectedOut = parseFloat(quote.outAmount) / Math.pow(10, outDecimals);
    const minOut = parseFloat(quote.otherAmountThreshold) / Math.pow(10, outDecimals);

    return {
      success: true,
      inputMint,
      outputMint,
      inputAmount: amount.toString(),
      outputAmount: expectedOut.toFixed(6),
      expectedOutput: expectedOut.toFixed(6),
      minimumOutput: minOut.toFixed(6),
      priceImpact: quote.priceImpactPct || "0",
      route: quote.routePlan?.map((r) => r.swapInfo?.label).join(" → ") || "Direct",
      slippage,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      inputMint,
      outputMint,
      inputAmount: amount.toString(),
      outputAmount: "0",
      expectedOutput: "0",
      minimumOutput: "0",
      priceImpact: "0",
      route: "",
      slippage,
      error: `Quote failed: ${message}`,
    };
  }
}

/**
 * Execute a swap transaction
 */
export async function handleSwap(params: SwapParams): Promise<SwapResult> {
  const { fromToken, toToken, amount, slippage = 0.5 } = params;

  // First get wallet
  const wallet = getWalletForSigning();
  const publicKey = getWalletPublicKey();

  if (!wallet || !publicKey) {
    return {
      success: false,
      status: "failed",
      error: "Wallet not configured. Set SOLANA_PRIVATE_KEY in .env",
    };
  }

  const inputMint = resolveTokenMint(fromToken);
  const outputMint = resolveTokenMint(toToken);
  const slippageBps = Math.round(slippage * 100);

  try {
    // Step 1: Get quote
    const decimals = inputMint === SOL_MINT ? 9 : 6;
    const amountInSmallestUnit = Math.round(amount * Math.pow(10, decimals));

    const quoteUrl = new URL(`${JUPITER_API}/quote`);
    quoteUrl.searchParams.set("inputMint", inputMint);
    quoteUrl.searchParams.set("outputMint", outputMint);
    quoteUrl.searchParams.set("amount", amountInSmallestUnit.toString());
    quoteUrl.searchParams.set("slippageBps", slippageBps.toString());

    const quoteResponse = await fetch(quoteUrl.toString());
    if (!quoteResponse.ok) {
      return {
        success: false,
        status: "failed",
        error: `Quote failed: ${await quoteResponse.text()}`,
      };
    }

    const quote = (await quoteResponse.json()) as JupiterQuoteResponse;

    // Step 2: Get swap transaction
    const swapResponse = await fetch(`${JUPITER_API}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
      }),
    });

    if (!swapResponse.ok) {
      return {
        success: false,
        status: "failed",
        error: `Swap transaction creation failed: ${await swapResponse.text()}`,
      };
    }

    const swapData = (await swapResponse.json()) as JupiterSwapResponse;
    const { swapTransaction } = swapData;

    // Step 3: Deserialize and sign
    const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // Step 4: Pre-flight simulation (safety guard)
    const connection = new Connection(SOLANA_RPC, "confirmed");

    const simulation = await connection.simulateTransaction(transaction, {
      sigVerify: false,
    });

    if (simulation.value.err) {
      return {
        success: false,
        status: "failed",
        error: `Simulation failed: ${JSON.stringify(simulation.value.err)}`,
        recoveryInstructions: "Transaction would fail. Check token balances and try again.",
      };
    }

    // Step 5: Sign and send
    transaction.sign([wallet]);

    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );

    // Step 6: Poll for confirmation (max 60s)
    const startTime = Date.now();
    const timeout = 60000;

    while (Date.now() - startTime < timeout) {
      const status = await connection.getSignatureStatus(signature);

      if (status.value?.confirmationStatus === "confirmed" ||
          status.value?.confirmationStatus === "finalized") {

        const outDecimals = outputMint === USDC_MINT ? 6 : 9;
        const expectedOut = parseFloat(quote.outAmount) / Math.pow(10, outDecimals);

        return {
          success: true,
          status: "confirmed",
          transactionSignature: signature,
          inputAmount: amount.toString(),
          quotedOutput: expectedOut.toFixed(6),
          actualOutput: expectedOut.toFixed(6), // In real impl, parse from tx logs
        };
      }

      if (status.value?.err) {
        return {
          success: false,
          status: "failed",
          transactionSignature: signature,
          error: `Transaction failed: ${JSON.stringify(status.value.err)}`,
          recoveryInstructions: `Check transaction on Solscan: https://solscan.io/tx/${signature}`,
        };
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Timeout - return pending status
    return {
      success: true,
      status: "pending",
      transactionSignature: signature,
      inputAmount: amount.toString(),
      recoveryInstructions: `Transaction may still confirm. Check: https://solscan.io/tx/${signature}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: "failed",
      error: `Swap error: ${message}`,
      recoveryInstructions: "Check wallet balance and try again with a smaller amount.",
    };
  }
}
