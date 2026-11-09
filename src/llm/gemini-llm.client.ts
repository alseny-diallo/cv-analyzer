import { FinishReason, GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { LlmClient, StructuredRequest, StructuredResponse } from './llm.client';

/**
 * Client LLM qui utilise l'API Gemini de Google (offre gratuite via Google AI Studio).
 *
 * Prérequis :
 *   1. Créer une clé gratuite sur https://aistudio.google.com/apikey
 *   2. Ajouter dans .env :  GEMINI_API_KEY=ta-clé
 *
 * Comme Claude, Gemini lit le PDF directement. Le JSON Schema est passé dans
 * `responseJsonSchema` : Gemini est alors contraint de produire un JSON conforme.
 *
 * Attention : sur l'offre gratuite, Google peut utiliser les contenus envoyés pour améliorer
 * ses produits, et des humains peuvent les lire (hors EEE, Suisse et Royaume-Uni).
 * Ne pas y envoyer de vrais CV de candidats.
 */
@Injectable()
export class GeminiLlmClient extends LlmClient {
  private readonly logger = new Logger(GeminiLlmClient.name);
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor() {
    super();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY manquante. Crée une clé gratuite sur https://aistudio.google.com/apikey');
    }
    // Délai max de 60 s par tentative, et 3 tentatives au total (erreurs réseau, 429, 5xx).
    this.ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000, retryOptions: { attempts: 3 } } });
    this.model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
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
    // On ne journalise que des métadonnées, jamais le contenu du CV (données personnelles).
    this.logger.log(
      `model=${response.modelVersion ?? this.model} in=${usage?.promptTokenCount} out=${usage?.candidatesTokenCount} ` +
        `thinking=${usage?.thoughtsTokenCount ?? 0} stop=${finishReason}`,
    );

    // MAX_TOKENS = JSON coupé en plein milieu ; SAFETY, RECITATION… = réponse bloquée par Google.
    if (finishReason !== FinishReason.STOP) {
      throw new Error(`Réponse Gemini incomplète ou bloquée (finishReason=${finishReason})`);
    }
    const text = response.text;
    if (!text) {
      throw new Error("Gemini n'a pas renvoyé de contenu");
    }
    try {
      return { input: JSON.parse(text), model: response.modelVersion ?? this.model };
    } catch {
      throw new Error("Gemini n'a pas renvoyé de JSON valide");
    }
  }
}
