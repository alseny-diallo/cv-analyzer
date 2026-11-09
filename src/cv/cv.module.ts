import { Module } from '@nestjs/common';
import { AnthropicLlmClient, LlmClient } from '../llm/llm.client';
import { GeminiLlmClient } from '../llm/gemini-llm.client';
import { CvController } from './cv.controller';
import { CvService } from './cv.service';

/**
 * Choix du fournisseur LLM via la variable d'environnement LLM_PROVIDER :
 *   - gemini    → Gemini (gratuit via AI Studio, GEMINI_API_KEY)
 *   - anthropic → Claude (payant, ANTHROPIC_API_KEY)
 */
function createLlmClient(): LlmClient {
  const provider = process.env.LLM_PROVIDER ?? 'gemini';
  switch (provider) {
    case 'gemini':
      return new GeminiLlmClient();
    case 'anthropic':
      return new AnthropicLlmClient();
    default:
      throw new Error(`LLM_PROVIDER inconnu : "${provider}" (valeurs possibles : gemini, anthropic)`);
  }
}

@Module({
  controllers: [CvController],
  providers: [CvService, { provide: LlmClient, useFactory: createLlmClient }],
})
export class CvModule {}
