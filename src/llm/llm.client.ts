import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';

export interface StructuredRequest {
  system: string;
  pdfBase64: string;
  instruction: string;
  tool: { name: string; description: string; inputSchema: Record<string, unknown> };
}

export interface StructuredResponse {
  input: unknown;
  model: string;
}

/**
 * Abstraction over the LLM provider.
 * The rest of the application only depends on this class, so it can be
 * replaced by a fake client in tests.
 */
export abstract class LlmClient {
  abstract extractStructured(req: StructuredRequest): Promise<StructuredResponse>;
}

@Injectable()
export class AnthropicLlmClient extends LlmClient {
  private readonly logger = new Logger(AnthropicLlmClient.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    super();
    // The key is read from LLM_API_KEY: never hard-coded.
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error('LLM_API_KEY is missing. For Claude, create a key at https://platform.claude.com');
    }
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
    this.model = process.env.LLM_MODEL || 'claude-haiku-5-5';
  }

  async extractStructured(req: StructuredRequest): Promise<StructuredResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: req.system,
      tools: [
        {
          name: req.tool.name,
          description: req.tool.description,
          input_schema: req.tool.inputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      // Force the tool call: the response is always a structured object.
      tool_choice: { type: 'tool', name: req.tool.name, disable_parallel_tool_use: true },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: req.pdfBase64 } },
            { type: 'text', text: req.instruction },
          ],
        },
      ],
    });

    // Only log metadata, never the resume content (personal data).
    this.logger.log(
      `model=${response.model} in=${response.usage.input_tokens} out=${response.usage.output_tokens} stop=${response.stop_reason}`,
    );

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('The model did not return a structured result');
    }
    return { input: toolUse.input, model: response.model };
  }
}
