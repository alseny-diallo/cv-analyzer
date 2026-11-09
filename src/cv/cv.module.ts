import { Module } from '@nestjs/common';
import { AnthropicLlmClient, LlmClient } from '../llm/llm.client';
import { GeminiLlmClient } from '../llm/gemini-llm.client';
import { CvController } from './cv.controller';
import { CvService } from './cv.service';

/**
 * Picks the LLM provider from the LLM_PROVIDER environment variable:
 *   - gemini    → Gemini (free tier via AI Studio)
 *   - anthropic → Claude (paid)
 * Every provider reads the same variables: LLM_API_KEY and LLM_MODEL (optional).
 */
function createLlmClient(): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? 'gemini';
  switch (provider) {
    case 'gemini':
      return new GeminiLlmClient();
    case 'anthropic':
      return new AnthropicLlmClient();
    default:
      throw new Error(`Unknown LLM_PROVIDER: "${provider}" (allowed values: gemini, anthropic)`);
  }
}

@Module({
  controllers: [CvController],
  providers: [CvService, { provide: LlmClient, useFactory: createLlmClient }],
})
export class CvModule {}
