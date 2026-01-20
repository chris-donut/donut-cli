/**
 * Base Chain Swap Execution via 0x API
 *
 * Provides token swap functionality on Base chain using 0x aggregator.
 * Implements same interface as Jupiter swaps for consistency.
 */

import {
  parseUnits,
  formatUnits,
  type Address,
  type Hash,
  erc20Abi,
} from "viem";
import {
  getBaseAccountForSigning,
  createBaseWalletClient,
  getBasePublicClient,
  getBaseWalletAddress,
} from "./base-wallet.js";

// 0x API endpoint for Base
const ZERO_X_API_URL = "https://base.api.0x.org";
const ZERO_X_API_KEY = process.env.ZERO_X_API_KEY || "";

// Common Base token addresses
const BASE_TOKENS: Record<string, { address: Address; decimals: number }> = {
  ETH: { address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address, decimals: 18 },
  WETH: { address: "0x4200000000000000000000000000000000000006" as Address, decimals: 18 },
  USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address, decimals: 6 },
  USDbC: { address: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA" as Address, decimals: 6 },
  DAI: { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" as Address, decimals: 18 },
  cbETH: { address: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" as Address, decimals: 18 },
};

// 0x Exchange Proxy on Base
const ZERO_X_EXCHANGE_PROXY = "0xDef1C0ded9bec7F1a1670819833240f027b25EfF" as Address;

// Type for 0x quote response
interface ZeroXQuoteResponse {
  buyAmount: string;
  sellAmount: string;
  price: string;
  guaranteedPrice?: string;
  to: string;
  data: string;
  value: string;
  gas: string;
  gasPrice: string;
  estimatedPriceImpact?: string;
  sources?: Array<{ name: string; proportion: string }>;
}

export interface BaseQuoteParams {
  fromToken: string;
  toToken: string;
  amount: number;
  slippage?: number;
}

export interface BaseQuoteResult {
  success: boolean;
  fromToken: {
    symbol: string;
    address: string;
    amount: string;
  };
  toToken: {
    symbol: string;
    address: string;
    expectedOutput: string;
    minimumOutput: string;
  };
  priceImpact: string;
  gasEstimate: {
    gasLimit: string;
    gasPriceGwei: string;
    estimatedCostEth: string;
  };
  route: string[];
  error?: string;
}

export interface BaseSwapResult {
  success: boolean;
  status: "signed" | "submitted" | "confirmed" | "failed" | "pending";
  transactionHash?: string;
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountOut?: string;
  explorerUrl?: string;
  recoveryInstructions?: string;
  error?: string;
}

/**
 * Resolve token symbol to address
 */
function resolveTokenAddress(tokenInput: string): { address: Address; decimals: number; symbol: string } | null {
  // Check if it's already an address
  if (tokenInput.startsWith("0x") && tokenInput.length === 42) {
    return { address: tokenInput as Address, decimals: 18, symbol: tokenInput.slice(0, 10) };
  }

  // Check known tokens
  const upperToken = tokenInput.toUpperCase();
  if (BASE_TOKENS[upperToken]) {
    return { ...BASE_TOKENS[upperToken], symbol: upperToken };
  }

  return null;
}

/**
 * Get a swap quote from 0x API
 */
export async function handleBaseQuote(params: BaseQuoteParams): Promise<BaseQuoteResult> {
  const walletAddress = getBaseWalletAddress();
  if (!walletAddress) {
    return {
      success: false,
      fromToken: { symbol: params.fromToken, address: "", amount: "" },
      toToken: { symbol: params.toToken, address: "", expectedOutput: "", minimumOutput: "" },
      priceImpact: "0",
      gasEstimate: { gasLimit: "0", gasPriceGwei: "0", estimatedCostEth: "0" },
      route: [],
      error: "BASE_PRIVATE_KEY not configured",
    };
  }

  const fromToken = resolveTokenAddress(params.fromToken);
  const toToken = resolveTokenAddress(params.toToken);

  if (!fromToken) {
    return {
      success: false,
      fromToken: { symbol: params.fromToken, address: "", amount: "" },
      toToken: { symbol: params.toToken, address: "", expectedOutput: "", minimumOutput: "" },
      priceImpact: "0",
      gasEstimate: { gasLimit: "0", gasPriceGwei: "0", estimatedCostEth: "0" },
      route: [],
      error: `Unknown token: ${params.fromToken}. Use address or known symbol (ETH, WETH, USDC, DAI, cbETH)`,
    };
  }

  if (!toToken) {
    return {
      success: false,
      fromToken: { symbol: params.fromToken, address: "", amount: "" },
      toToken: { symbol: params.toToken, address: "", expectedOutput: "", minimumOutput: "" },
      priceImpact: "0",
      gasEstimate: { gasLimit: "0", gasPriceGwei: "0", estimatedCostEth: "0" },
      route: [],
      error: `Unknown token: ${params.toToken}. Use address or known symbol (ETH, WETH, USDC, DAI, cbETH)`,
    };
  }

  const slippageBps = Math.round((params.slippage || 0.5) * 100); // Convert % to bps
  const sellAmount = parseUnits(params.amount.toString(), fromToken.decimals).toString();

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (ZERO_X_API_KEY) {
      headers["0x-api-key"] = ZERO_X_API_KEY;
    }

    const quoteUrl = new URL(`${ZERO_X_API_URL}/swap/v1/quote`);
    quoteUrl.searchParams.set("sellToken", fromToken.address);
    quoteUrl.searchParams.set("buyToken", toToken.address);
    quoteUrl.searchParams.set("sellAmount", sellAmount);
    quoteUrl.searchParams.set("slippagePercentage", (slippageBps / 10000).toString());
    quoteUrl.searchParams.set("takerAddress", walletAddress);

    const response = await fetch(quoteUrl.toString(), { headers });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        fromToken: { symbol: fromToken.symbol, address: fromToken.address, amount: params.amount.toString() },
        toToken: { symbol: toToken.symbol, address: toToken.address, expectedOutput: "", minimumOutput: "" },
        priceImpact: "0",
        gasEstimate: { gasLimit: "0", gasPriceGwei: "0", estimatedCostEth: "0" },
        route: [],
        error: `0x API error: ${errorText}`,
      };
    }

    const quote = (await response.json()) as ZeroXQuoteResponse;

    const expectedOutput = formatUnits(BigInt(quote.buyAmount), toToken.decimals);
    const minimumOutput = formatUnits(
      quote.guaranteedPrice
        ? BigInt(Math.floor(Number(quote.buyAmount) * (1 - slippageBps / 10000)))
        : BigInt(quote.buyAmount),
      toToken.decimals
    );

    const gasEstimate = quote.gas ? BigInt(quote.gas) : BigInt(200000);
    const gasPriceWei = quote.gasPrice ? BigInt(quote.gasPrice) : BigInt(1000000000);
    const estimatedCostWei = gasEstimate * gasPriceWei;

    return {
      success: true,
      fromToken: {
        symbol: fromToken.symbol,
        address: fromToken.address,
        amount: params.amount.toString(),
      },
      toToken: {
        symbol: toToken.symbol,
        address: toToken.address,
        expectedOutput,
        minimumOutput,
      },
      priceImpact: quote.estimatedPriceImpact || "< 0.01%",
      gasEstimate: {
        gasLimit: gasEstimate.toString(),
        gasPriceGwei: formatUnits(gasPriceWei, 9),
        estimatedCostEth: formatUnits(estimatedCostWei, 18),
      },
      route: quote.sources?.filter((s) => Number(s.proportion) > 0).map((s) => s.name) || ["0x"],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      fromToken: { symbol: fromToken.symbol, address: fromToken.address, amount: params.amount.toString() },
      toToken: { symbol: toToken.symbol, address: toToken.address, expectedOutput: "", minimumOutput: "" },
      priceImpact: "0",
      gasEstimate: { gasLimit: "0", gasPriceGwei: "0", estimatedCostEth: "0" },
      route: [],
      error: `Quote failed: ${message}`,
    };
  }
}

/**
 * Execute a swap on Base via 0x API
 */
export async function handleBaseSwap(params: BaseQuoteParams): Promise<BaseSwapResult> {
  const account = getBaseAccountForSigning();
  const walletClient = createBaseWalletClient();
  const publicClient = getBasePublicClient();

  if (!account || !walletClient) {
    return {
      success: false,
      status: "failed",
      fromToken: params.fromToken,
      toToken: params.toToken,
      amountIn: params.amount.toString(),
      error: "BASE_PRIVATE_KEY not configured",
    };
  }

  const fromToken = resolveTokenAddress(params.fromToken);
  const toToken = resolveTokenAddress(params.toToken);

  if (!fromToken || !toToken) {
    return {
      success: false,
      status: "failed",
      fromToken: params.fromToken,
      toToken: params.toToken,
      amountIn: params.amount.toString(),
      error: `Unknown token. Use address or known symbol (ETH, WETH, USDC, DAI, cbETH)`,
    };
  }

  const slippageBps = Math.round((params.slippage || 0.5) * 100);
  const sellAmount = parseUnits(params.amount.toString(), fromToken.decimals);

  try {
    // Step 1: Check if we need to approve the token
    const isNativeEth = fromToken.address.toLowerCase() === BASE_TOKENS.ETH.address.toLowerCase();

    if (!isNativeEth) {
      // Check allowance
      const allowance = await publicClient.readContract({
        address: fromToken.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, ZERO_X_EXCHANGE_PROXY],
      });

      if (allowance < sellAmount) {
        // Approve token using simulateContract + writeContract pattern
        const { request } = await publicClient.simulateContract({
          address: fromToken.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [ZERO_X_EXCHANGE_PROXY, sellAmount * 2n],
          account: account.address,
        });

        // writeContract with the simulated request - account is bound to walletClient
        const approveHash = await walletClient.writeContract(request as any);

        // Wait for approval
        await publicClient.waitForTransactionReceipt({ hash: approveHash, timeout: 60000 });
      }
    }

    // Step 2: Get swap quote
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (ZERO_X_API_KEY) headers["0x-api-key"] = ZERO_X_API_KEY;

    const quoteUrl = new URL(`${ZERO_X_API_URL}/swap/v1/quote`);
    quoteUrl.searchParams.set("sellToken", fromToken.address);
    quoteUrl.searchParams.set("buyToken", toToken.address);
    quoteUrl.searchParams.set("sellAmount", sellAmount.toString());
    quoteUrl.searchParams.set("slippagePercentage", (slippageBps / 10000).toString());
    quoteUrl.searchParams.set("takerAddress", account.address);

    const response = await fetch(quoteUrl.toString(), { headers });
    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        status: "failed",
        fromToken: fromToken.symbol,
        toToken: toToken.symbol,
        amountIn: params.amount.toString(),
        error: `0x API error: ${errorText}`,
      };
    }

    const quote = (await response.json()) as ZeroXQuoteResponse;

    // Step 3: Execute the swap using sendTransaction
    // Account is already bound to walletClient, so we don't pass it separately
    const txHash: Hash = await walletClient.sendTransaction({
      to: quote.to as Address,
      data: quote.data as `0x${string}`,
      value: isNativeEth ? BigInt(quote.value || sellAmount) : BigInt(quote.value || 0),
      gas: BigInt(quote.gas || 200000),
      chain: null, // Use the chain from walletClient
    } as any);

    // Step 4: Wait for confirmation with timeout
    const timeout = 60000; // 60 seconds

    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout,
      });

      const expectedOutput = formatUnits(BigInt(quote.buyAmount), toToken.decimals);

      if (receipt.status === "success") {
        return {
          success: true,
          status: "confirmed",
          transactionHash: txHash,
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
          amountIn: params.amount.toString(),
          amountOut: expectedOutput,
          explorerUrl: `https://basescan.org/tx/${txHash}`,
        };
      } else {
        return {
          success: false,
          status: "failed",
          transactionHash: txHash,
          fromToken: fromToken.symbol,
          toToken: toToken.symbol,
          amountIn: params.amount.toString(),
          explorerUrl: `https://basescan.org/tx/${txHash}`,
          error: "Transaction reverted",
          recoveryInstructions: `Transaction failed. Check Basescan for details: https://basescan.org/tx/${txHash}`,
        };
      }
    } catch {
      // Transaction submitted but not confirmed within timeout
      return {
        success: true,
        status: "pending",
        transactionHash: txHash,
        fromToken: fromToken.symbol,
        toToken: toToken.symbol,
        amountIn: params.amount.toString(),
        explorerUrl: `https://basescan.org/tx/${txHash}`,
        recoveryInstructions: `Transaction submitted but not yet confirmed. Track status at: https://basescan.org/tx/${txHash}`,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: "failed",
      fromToken: fromToken.symbol,
      toToken: toToken.symbol,
      amountIn: params.amount.toString(),
      error: `Swap failed: ${message}`,
      recoveryInstructions: "Check your wallet balance and try again. If the issue persists, the 0x API may be temporarily unavailable.",
    };
  }
}

/**
 * Detect chain from token address format
 */
export function detectChainFromToken(token: string): "solana" | "base" | "unknown" {
  // Solana addresses are base58 encoded, typically 32-44 characters
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)) {
    return "solana";
  }

  // EVM addresses start with 0x and are 42 characters
  if (/^0x[a-fA-F0-9]{40}$/.test(token)) {
    return "base";
  }

  // Check known token symbols
  const upperToken = token.toUpperCase();
  if (BASE_TOKENS[upperToken]) {
    return "base";
  }

  // Default tokens that exist on both chains
  if (["SOL", "USDC", "USDT"].includes(upperToken)) {
    // Ambiguous - need more context
    return "unknown";
  }

  return "unknown";
}
