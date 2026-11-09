import { FinishReason, GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { LlmClient, StructuredRequest, StructuredResponse } from './llm.client';

/**
 * LLM client for Google's Gemini API (free tier via Google AI Studio).
 *
 * Prerequisites:
 *   1. Create a free key at https://aistudio.google.com/apikey
 *   2. In .env:  LLM_PROVIDER=gemini and LLM_API_KEY=your-key
 *
 * Like Claude, Gemini reads the PDF directly. The JSON Schema is passed in
 * `responseJsonSchema`, which constrains Gemini to produce matching JSON.
 *
 * Warning: on the free tier, Google may use submitted content to improve its products,
 * and humans may read it (outside the EEA, Switzerland and the UK).
 * Do not send real candidates' resumes.
 */
@Injectable()
export class GeminiLlmClient extends LlmClient {
  private readonly logger = new Logger(GeminiLlmClient.name);
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor() {
    super();
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error('LLM_API_KEY is missing. For Gemini, create a free key at https://aistudio.google.com/apikey');
    }
    // 60 s timeout per attempt, and 3 attempts in total (network errors, 429, 5xx).
    this.ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000, retryOptions: { attempts: 3 } } });
    this.model = process.env.LLM_MODEL || 'gemini-3.5-flash-lite';
  }

  async extractStructured(req: StructuredRequest): Promise<StructuredResponse> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType: 'application/pdf', data: req.pdfBase64 } }, { text: req.instruction }],
        },
      ],
      config: {
        systemInstruction: req.system,
        responseMimeType: 'application/json',
        responseJsonSchema: req.tool.inputSchema,
      },
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    const usage = response.usageMetadata;
    // Only log metadata, never the resume content (personal data).
    this.logger.log(
      `model=${response.modelVersion ?? this.model} in=${usage?.promptTokenCount} out=${usage?.candidatesTokenCount} ` +
        `thinking=${usage?.thoughtsTokenCount ?? 0} stop=${finishReason}`,
    );

    // MAX_TOKENS = JSON cut off mid-way; SAFETY, RECITATION… = response blocked by Google.
    if (finishReason !== FinishReason.STOP) {
      throw new Error(`Gemini response incomplete or blocked (finishReason=${finishReason})`);
    }
    const text = response.text;
    if (!text) {
      throw new Error('Gemini returned no content');
    }
    try {
      return { input: JSON.parse(text), model: response.modelVersion ?? this.model };
    } catch {
      throw new Error('Gemini did not return valid JSON');
    }
  }
}
