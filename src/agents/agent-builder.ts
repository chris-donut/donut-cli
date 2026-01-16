/**
 * Agent Builder - Fluent Interface for Agent Configuration
 *
 * Provides a builder pattern for creating agents with clear,
 * readable configuration. Supports both sync and async building.
 *
 * @example
 * ```typescript
 * const agent = await AgentBuilder
 *   .create(OrchestratorAgent, terminalConfig, sessionManager)
 *   .withMaxIterations(30)
 *   .withModel("opus")
 *   .build();
 * ```
 */

import {
  TerminalConfig,
  AgentType,
} from "../core/types.js";
import { AgentDependencies } from "../core/dependencies.js";
import { SessionManager } from "../core/session.js";
import { AgentConfig, BaseAgent } from "./base-agent.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Constructor type for agents extending BaseAgent
 */
export type AgentConstructor<T extends BaseAgent> = new (config: AgentConfig) => T;

/**
 * Model options for agent configuration
 */
export type ModelOption = "sonnet" | "opus" | "haiku";

/**
 * Builder configuration accumulated during building
 */
export interface BuilderConfig {
  maxIterations?: number;
  model?: ModelOption;
  tools?: string[];
  dependencies?: Partial<AgentDependencies>;
}

// ============================================================================
// Agent Builder
// ============================================================================

/**
 * Fluent builder for creating configured agents
 *
 * Benefits:
 * - Clear, readable configuration
 * - Type-safe options
 * - Separates construction from initialization
 * - Supports async initialization patterns
 */
export class AgentBuilder<T extends BaseAgent> {
  private terminalConfig: TerminalConfig;
  private sessionManager: SessionManager;
  private AgentClass: AgentConstructor<T>;
  private builderConfig: BuilderConfig = {};

  private constructor(
    AgentClass: AgentConstructor<T>,
    terminalConfig: TerminalConfig,
    sessionManager: SessionManager
  ) {
    this.AgentClass = AgentClass;
    this.terminalConfig = terminalConfig;
    this.sessionManager = sessionManager;
  }

  /**
   * Create a new builder for an agent type
   */
  static create<T extends BaseAgent>(
    AgentClass: AgentConstructor<T>,
    terminalConfig: TerminalConfig,
    sessionManager: SessionManager
  ): AgentBuilder<T> {
    return new AgentBuilder(AgentClass, terminalConfig, sessionManager);
  }

  /**
   * Configure maximum iterations before graceful degradation
   */
  withMaxIterations(maxIterations: number): this {
    this.builderConfig.maxIterations = maxIterations;
    return this;
  }

  /**
   * Configure the model to use
   */
  withModel(model: ModelOption): this {
    this.builderConfig.model = model;
    return this;
  }

  /**
   * Configure allowed tools for this agent
   */
  withTools(tools: string[]): this {
    this.builderConfig.tools = tools;
    return this;
  }

  /**
   * Configure custom dependencies (for testing or custom implementations)
   */
  withDependencies(dependencies: Partial<AgentDependencies>): this {
    this.builderConfig.dependencies = {
      ...this.builderConfig.dependencies,
      ...dependencies,
    };
    return this;
  }

  /**
   * Get the accumulated configuration
   */
  getConfig(): BuilderConfig {
    return { ...this.builderConfig };
  }

  /**
   * Build the agent synchronously
   */
  build(): T {
    const config: AgentConfig = {
      terminalConfig: this.terminalConfig,
      sessionManager: this.sessionManager,
      maxIterations: this.builderConfig.maxIterations,
      dependencies: this.builderConfig.dependencies,
    };

    // Apply model to terminal config if specified
    if (this.builderConfig.model) {
      config.terminalConfig = {
        ...config.terminalConfig,
        model: this.builderConfig.model,
      };
    }

    return new this.AgentClass(config);
  }

  /**
   * Build the agent asynchronously with initialization
   * Use this when agents need async setup (e.g., loading MCP servers)
   */
  async buildAsync(): Promise<T> {
    const agent = this.build();

    // Future: Add async initialization here
    // await agent.initialize?.();

    return agent;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick agent creation without full builder
 *
 * @example
 * ```typescript
 * const agent = createAgent(OrchestratorAgent, terminalConfig, sessionManager, {
 *   maxIterations: 30,
 * });
 * ```
 */
export function createAgent<T extends BaseAgent>(
  AgentClass: AgentConstructor<T>,
  terminalConfig: TerminalConfig,
  sessionManager: SessionManager,
  options?: {
    maxIterations?: number;
    model?: ModelOption;
    dependencies?: Partial<AgentDependencies>;
  }
): T {
  let builder = AgentBuilder.create(AgentClass, terminalConfig, sessionManager);

  if (options?.maxIterations) {
    builder = builder.withMaxIterations(options.maxIterations);
  }

  if (options?.model) {
    builder = builder.withModel(options.model);
  }

  if (options?.dependencies) {
    builder = builder.withDependencies(options.dependencies);
  }

  return builder.build();
}

/**
 * Async agent creation with initialization
 */
export async function createAgentAsync<T extends BaseAgent>(
  AgentClass: AgentConstructor<T>,
  terminalConfig: TerminalConfig,
  sessionManager: SessionManager,
  options?: {
    maxIterations?: number;
    model?: ModelOption;
    dependencies?: Partial<AgentDependencies>;
  }
): Promise<T> {
  let builder = AgentBuilder.create(AgentClass, terminalConfig, sessionManager);

  if (options?.maxIterations) {
    builder = builder.withMaxIterations(options.maxIterations);
  }

  if (options?.model) {
    builder = builder.withModel(options.model);
  }

  if (options?.dependencies) {
    builder = builder.withDependencies(options.dependencies);
  }

  return builder.buildAsync();
}
