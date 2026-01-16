/**
 * Confidence Calibration Tracker - Track prediction accuracy to calibrate confidence
 *
 * Tracks predictions with confidence scores and compares them to actual outcomes.
 * Calculates calibration curves and reports over/under confidence bias.
 *
 * Persists calibration data to .sessions/calibration.json
 *
 * Part of Phase 3: Intelligence Layer
 */

import { z } from "zod";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

export const PredictionSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string(),
  symbol: z.string(),
  predictedDirection: z.enum(["up", "down", "neutral"]),
  confidence: z.number().min(0).max(1),
  timeHorizon: z.string(), // e.g., "1h", "4h", "1d"
  context: z.string().optional(),
  actualOutcome: z.enum(["up", "down", "neutral"]).optional(),
  outcomeTimestamp: z.string().optional(),
  wasCorrect: z.boolean().optional(),
});

export type Prediction = z.infer<typeof PredictionSchema>;

export const CalibrationDataSchema = z.object({
  predictions: z.array(PredictionSchema),
  lastUpdated: z.string(),
  version: z.number(),
});

export type CalibrationData = z.infer<typeof CalibrationDataSchema>;

export interface CalibrationBucket {
  confidenceRange: string; // e.g., "0.8-0.9"
  minConfidence: number;
  maxConfidence: number;
  totalPredictions: number;
  correctPredictions: number;
  actualAccuracy: number;
  expectedAccuracy: number; // midpoint of confidence range
  calibrationError: number; // actualAccuracy - expectedAccuracy
}

export interface CalibrationReport {
  buckets: CalibrationBucket[];
  overallAccuracy: number;
  totalPredictions: number;
  resolvedPredictions: number;
  meanCalibrationError: number;
  bias: "overconfident" | "underconfident" | "well-calibrated";
  biasScore: number; // positive = overconfident, negative = underconfident
  timestamp: string;
}

// ============================================================================
// Calibration Tracker Class
// ============================================================================

export class CalibrationTracker {
  private data: CalibrationData;
  private dataPath: string;

  constructor(sessionDir: string = ".sessions") {
    this.dataPath = join(sessionDir, "calibration.json");
    this.data = this.loadData();
  }

  /**
   * Load calibration data from disk
   */
  private loadData(): CalibrationData {
    try {
      if (existsSync(this.dataPath)) {
        const raw = readFileSync(this.dataPath, "utf-8");
        const parsed = CalibrationDataSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          return parsed.data;
        }
      }
    } catch {
      // Ignore errors, start fresh
    }

    return {
      predictions: [],
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
  }

  /**
   * Save calibration data to disk
   */
  private saveData(): void {
    const dir = this.dataPath.replace(/\/[^/]+$/, "");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.data.lastUpdated = new Date().toISOString();
    writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
  }

  /**
   * Record a new prediction
   */
  recordPrediction(
    symbol: string,
    predictedDirection: "up" | "down" | "neutral",
    confidence: number,
    timeHorizon: string,
    context?: string
  ): Prediction {
    const prediction: Prediction = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      symbol,
      predictedDirection,
      confidence: Math.max(0, Math.min(1, confidence)),
      timeHorizon,
      context,
    };

    this.data.predictions.push(prediction);
    this.saveData();

    return prediction;
  }

  /**
   * Record the actual outcome for a prediction
   */
  recordOutcome(
    predictionId: string,
    actualOutcome: "up" | "down" | "neutral"
  ): Prediction | null {
    const prediction = this.data.predictions.find((p) => p.id === predictionId);
    if (!prediction) {
      return null;
    }

    prediction.actualOutcome = actualOutcome;
    prediction.outcomeTimestamp = new Date().toISOString();
    prediction.wasCorrect = prediction.predictedDirection === actualOutcome;

    this.saveData();
    return prediction;
  }

  /**
   * Get all predictions
   */
  getPredictions(): Prediction[] {
    return [...this.data.predictions];
  }

  /**
   * Get resolved predictions (those with outcomes)
   */
  getResolvedPredictions(): Prediction[] {
    return this.data.predictions.filter(
      (p) => p.actualOutcome !== undefined
    );
  }

  /**
   * Get pending predictions (awaiting outcomes)
   */
  getPendingPredictions(): Prediction[] {
    return this.data.predictions.filter(
      (p) => p.actualOutcome === undefined
    );
  }

  /**
   * Calculate calibration curve
   *
   * Groups predictions into confidence buckets and compares
   * expected accuracy (confidence) vs actual accuracy.
   */
  calculateCalibrationCurve(numBuckets: number = 10): CalibrationBucket[] {
    const resolved = this.getResolvedPredictions();
    const buckets: CalibrationBucket[] = [];
    const bucketSize = 1 / numBuckets;

    for (let i = 0; i < numBuckets; i++) {
      const minConfidence = i * bucketSize;
      const maxConfidence = (i + 1) * bucketSize;
      const expectedAccuracy = (minConfidence + maxConfidence) / 2;

      const bucketPredictions = resolved.filter(
        (p) => p.confidence >= minConfidence && p.confidence < maxConfidence
      );

      const totalPredictions = bucketPredictions.length;
      const correctPredictions = bucketPredictions.filter(
        (p) => p.wasCorrect
      ).length;
      const actualAccuracy =
        totalPredictions > 0 ? correctPredictions / totalPredictions : 0;

      buckets.push({
        confidenceRange: `${(minConfidence * 100).toFixed(0)}-${(maxConfidence * 100).toFixed(0)}%`,
        minConfidence,
        maxConfidence,
        totalPredictions,
        correctPredictions,
        actualAccuracy,
        expectedAccuracy,
        calibrationError: actualAccuracy - expectedAccuracy,
      });
    }

    return buckets;
  }

  /**
   * Generate full calibration report
   */
  generateReport(): CalibrationReport {
    const resolved = this.getResolvedPredictions();
    const buckets = this.calculateCalibrationCurve();

    const totalPredictions = this.data.predictions.length;
    const resolvedPredictions = resolved.length;
    const correctPredictions = resolved.filter((p) => p.wasCorrect).length;
    const overallAccuracy =
      resolvedPredictions > 0 ? correctPredictions / resolvedPredictions : 0;

    // Calculate mean calibration error (weighted by bucket size)
    const bucketsWithData = buckets.filter((b) => b.totalPredictions > 0);
    const totalWeight = bucketsWithData.reduce(
      (sum, b) => sum + b.totalPredictions,
      0
    );
    const meanCalibrationError =
      totalWeight > 0
        ? bucketsWithData.reduce(
            (sum, b) => sum + b.calibrationError * b.totalPredictions,
            0
          ) / totalWeight
        : 0;

    // Calculate bias score
    // Positive = overconfident (predicted higher accuracy than achieved)
    // Negative = underconfident (achieved higher accuracy than predicted)
    const avgConfidence =
      resolved.length > 0
        ? resolved.reduce((sum, p) => sum + p.confidence, 0) / resolved.length
        : 0;
    const biasScore = avgConfidence - overallAccuracy;

    let bias: "overconfident" | "underconfident" | "well-calibrated";
    if (biasScore > 0.05) {
      bias = "overconfident";
    } else if (biasScore < -0.05) {
      bias = "underconfident";
    } else {
      bias = "well-calibrated";
    }

    return {
      buckets,
      overallAccuracy,
      totalPredictions,
      resolvedPredictions,
      meanCalibrationError,
      bias,
      biasScore,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Format calibration report as readable string
   */
  formatReport(): string {
    const report = this.generateReport();
    const lines: string[] = [];

    lines.push("\n=== Confidence Calibration Report ===");
    lines.push(`Generated: ${report.timestamp}`);
    lines.push("");
    lines.push(`Total Predictions: ${report.totalPredictions}`);
    lines.push(`Resolved: ${report.resolvedPredictions}`);
    lines.push(`Overall Accuracy: ${(report.overallAccuracy * 100).toFixed(1)}%`);
    lines.push(`Calibration Bias: ${report.bias} (score: ${report.biasScore.toFixed(3)})`);
    lines.push("");
    lines.push("Calibration Curve:");
    lines.push("-".repeat(60));
    lines.push(
      "Confidence".padEnd(15) +
      "Count".padStart(8) +
      "Actual".padStart(10) +
      "Expected".padStart(10) +
      "Error".padStart(10)
    );
    lines.push("-".repeat(60));

    for (const bucket of report.buckets) {
      if (bucket.totalPredictions > 0) {
        lines.push(
          bucket.confidenceRange.padEnd(15) +
          bucket.totalPredictions.toString().padStart(8) +
          `${(bucket.actualAccuracy * 100).toFixed(1)}%`.padStart(10) +
          `${(bucket.expectedAccuracy * 100).toFixed(1)}%`.padStart(10) +
          `${(bucket.calibrationError * 100).toFixed(1)}%`.padStart(10)
        );
      }
    }

    lines.push("-".repeat(60));
    lines.push("");

    if (report.bias === "overconfident") {
      lines.push("Note: You tend to be overconfident. Consider lowering confidence scores.");
    } else if (report.bias === "underconfident") {
      lines.push("Note: You tend to be underconfident. Your predictions are better than you think!");
    } else {
      lines.push("Note: Your confidence calibration is good. Keep it up!");
    }

    return lines.join("\n");
  }

  /**
   * Clear all calibration data
   */
  clear(): void {
    this.data = {
      predictions: [],
      lastUpdated: new Date().toISOString(),
      version: 1,
    };
    this.saveData();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let calibrationTrackerInstance: CalibrationTracker | null = null;

export function getCalibrationTracker(
  sessionDir?: string
): CalibrationTracker {
  if (!calibrationTrackerInstance) {
    calibrationTrackerInstance = new CalibrationTracker(sessionDir);
  }
  return calibrationTrackerInstance;
}

export function initializeCalibrationTracker(
  sessionDir: string
): CalibrationTracker {
  calibrationTrackerInstance = new CalibrationTracker(sessionDir);
  return calibrationTrackerInstance;
}
