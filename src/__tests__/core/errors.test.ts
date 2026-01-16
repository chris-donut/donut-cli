/**
 * Tests for error utilities
 */

import {
  DonutError,
  ConfigError,
  ApiError,
  ValidationError,
  SessionError,
  AgentError,
  RiskError,
  NotImplementedError,
  getErrorMessage,
  isRetriableError,
  withRetry,
  isDonutError,
  isApiError,
} from "../../core/errors.js";

describe("Custom Error Classes", () => {
  describe("DonutError", () => {
    it("should create a basic error with default values", () => {
      const error = new DonutError("Test error");
      expect(error.message).toBe("Test error");
      expect(error.code).toBe("UNKNOWN_ERROR");
      expect(error.isRetriable).toBe(false);
      expect(error.name).toBe("DonutError");
    });

    it("should create an error with custom options", () => {
      const error = new DonutError("Test error", {
        code: "CUSTOM_CODE",
        context: { foo: "bar" },
        isRetriable: true,
      });
      expect(error.code).toBe("CUSTOM_CODE");
      expect(error.context).toEqual({ foo: "bar" });
      expect(error.isRetriable).toBe(true);
    });

    it("should preserve cause error", () => {
      const cause = new Error("Original error");
      const error = new DonutError("Wrapped error", { cause });
      expect(error.cause).toBe(cause);
    });
  });

  describe("ConfigError", () => {
    it("should create a config error", () => {
      const error = new ConfigError("Invalid config");
      expect(error.name).toBe("ConfigError");
      expect(error.code).toBe("CONFIG_ERROR");
      expect(error.isRetriable).toBe(false);
    });
  });

  describe("ApiError", () => {
    it("should create an API error with status code", () => {
      const error = new ApiError("API failed", {
        statusCode: 500,
        endpoint: "/api/test",
      });
      expect(error.name).toBe("ApiError");
      expect(error.statusCode).toBe(500);
      expect(error.endpoint).toBe("/api/test");
    });

    it("should be retriable for 5xx errors", () => {
      const error = new ApiError("Server error", { statusCode: 500 });
      expect(error.isRetriable).toBe(true);
    });

    it("should be retriable for 429 rate limit", () => {
      const error = new ApiError("Rate limited", { statusCode: 429 });
      expect(error.isRetriable).toBe(true);
    });

    it("should not be retriable for 4xx errors (except 429)", () => {
      const error = new ApiError("Bad request", { statusCode: 400 });
      expect(error.isRetriable).toBe(false);
    });
  });

  describe("ValidationError", () => {
    it("should create a validation error with field info", () => {
      const error = new ValidationError("Invalid value", {
        field: "amount",
        value: -100,
      });
      expect(error.name).toBe("ValidationError");
      expect(error.field).toBe("amount");
      expect(error.value).toBe(-100);
      expect(error.isRetriable).toBe(false);
    });
  });

  describe("SessionError", () => {
    it("should create a session error with session ID", () => {
      const error = new SessionError("Session not found", {
        sessionId: "abc123",
      });
      expect(error.name).toBe("SessionError");
      expect(error.sessionId).toBe("abc123");
    });
  });

  describe("AgentError", () => {
    it("should create an agent error", () => {
      const error = new AgentError("Agent failed", {
        agentType: "STRATEGY_BUILDER",
      });
      expect(error.name).toBe("AgentError");
      expect(error.agentType).toBe("STRATEGY_BUILDER");
      expect(error.isRetriable).toBe(true); // Default for agent errors
    });
  });

  describe("RiskError", () => {
    it("should create a risk error with limit info", () => {
      const error = new RiskError("Position limit exceeded", {
        riskType: "POSITION_SIZE",
        limit: 1000,
        actual: 1500,
      });
      expect(error.name).toBe("RiskError");
      expect(error.riskType).toBe("POSITION_SIZE");
      expect(error.limit).toBe(1000);
      expect(error.actual).toBe(1500);
    });
  });

  describe("NotImplementedError", () => {
    it("should create a not implemented error", () => {
      const error = new NotImplementedError("Twitter API");
      expect(error.name).toBe("NotImplementedError");
      expect(error.feature).toBe("Twitter API");
      expect(error.message).toBe("Feature not implemented: Twitter API");
    });
  });
});

describe("Error Utility Functions", () => {
  describe("getErrorMessage", () => {
    it("should extract message from Error instance", () => {
      const error = new Error("Test message");
      expect(getErrorMessage(error)).toBe("Test message");
    });

    it("should convert non-Error to string", () => {
      expect(getErrorMessage("string error")).toBe("string error");
      expect(getErrorMessage(42)).toBe("42");
      expect(getErrorMessage({ foo: "bar" })).toBe("[object Object]");
    });
  });

  describe("isRetriableError", () => {
    it("should return true for retriable DonutError", () => {
      const error = new DonutError("Test", { isRetriable: true });
      expect(isRetriableError(error)).toBe(true);
    });

    it("should return false for non-retriable DonutError", () => {
      const error = new DonutError("Test", { isRetriable: false });
      expect(isRetriableError(error)).toBe(false);
    });

    it("should return false for non-DonutError", () => {
      expect(isRetriableError(new Error("Test"))).toBe(false);
      expect(isRetriableError("string")).toBe(false);
    });
  });

  describe("withRetry", () => {
    it("should succeed on first attempt", async () => {
      const fn = jest.fn().mockResolvedValue("success");
      const result = await withRetry(fn);
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on retriable error", async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new ApiError("Error", { statusCode: 500 }))
        .mockResolvedValue("success");

      const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("should not retry on non-retriable error", async () => {
      const fn = jest.fn().mockRejectedValue(new ValidationError("Invalid"));

      await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(
        "Invalid"
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should call onRetry callback", async () => {
      const onRetry = jest.fn();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new ApiError("Error", { statusCode: 500 }))
        .mockResolvedValue("success");

      await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, onRetry });
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(ApiError));
    });

    it("should throw after max attempts", async () => {
      const fn = jest
        .fn()
        .mockRejectedValue(new ApiError("Error", { statusCode: 500 }));

      await expect(
        withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })
      ).rejects.toThrow("Error");
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});

describe("Type Guards", () => {
  it("isDonutError should identify DonutError instances", () => {
    expect(isDonutError(new DonutError("Test"))).toBe(true);
    expect(isDonutError(new ConfigError("Test"))).toBe(true);
    expect(isDonutError(new Error("Test"))).toBe(false);
    expect(isDonutError("string")).toBe(false);
  });

  it("isApiError should identify ApiError instances", () => {
    expect(isApiError(new ApiError("Test"))).toBe(true);
    expect(isApiError(new DonutError("Test"))).toBe(false);
    expect(isApiError(new Error("Test"))).toBe(false);
  });
});
