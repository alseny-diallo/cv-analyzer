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
 * Abstraction autour du fournisseur de LLM.
 * Le reste de l'application ne dépend que de cette classe, ce qui permet
 * de la remplacer par un faux client dans les tests.
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
    // La clé est lue depuis ANTHROPIC_API_KEY : jamais dans le code.
    this.client = new Anthropic({ maxRetries: 2, timeout: 60_000 });
    this.model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5';
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
      // On force l'appel de l'outil : la réponse est forcément un objet structuré.
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

    // On ne journalise que des métadonnées, jamais le contenu du CV (données personnelles).
    this.logger.log(
      `model=${response.model} in=${response.usage.input_tokens} out=${response.usage.output_tokens} stop=${response.stop_reason}`,
    );

    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Le modèle n’a pas renvoyé de résultat structuré');
    }
    return { input: toolUse.input, model: response.model };
  }
}
