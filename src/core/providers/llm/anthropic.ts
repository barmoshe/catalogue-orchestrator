import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { LlmProvider } from "../types.js";

/**
 * Anthropic Claude with FORCED structured output (weatherv1-next pattern): the zod
 * schema becomes a tool `input_schema` via zod-to-json-schema, `tool_choice` forces the
 * tool, and the returned `input` is validated with `schema.safeParse`. On a validation
 * failure the caller re-prompts (see orchestrate/validate). Never returns raw text.
 *
 * Model from CLAUDE_MODEL (default `claude-sonnet-4-6`). Key: ANTHROPIC_API_KEY.
 */
export class AnthropicLlm implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async completeJson<T>(args: {
    schema: import("zod").ZodType<T>;
    schemaName: string;
    schemaDescription?: string;
    system: string;
    user: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<T> {
    const inputSchema = zodToJsonSchema(args.schema, {
      target: "openApi3",
      $refStrategy: "none",
    }) as Anthropic.Tool.InputSchema;

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: args.maxTokens ?? 8192,
      ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
      system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
      tools: [
        {
          name: args.schemaName,
          description: args.schemaDescription ?? "Return the result in this schema.",
          input_schema: inputSchema,
        },
      ],
      tool_choice: { type: "tool", name: args.schemaName },
      messages: [{ role: "user", content: args.user }],
    });

    const toolUse = res.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("anthropic: model did not return the forced tool call");
    }
    const parsed = args.schema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new SchemaValidationError(parsed.error.message, toolUse.input);
    }
    return parsed.data;
  }
}

/** Carries the raw model output so the caller can re-prompt with the zod error. */
export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = "SchemaValidationError";
  }
}
