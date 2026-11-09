import { validAnalysis } from '../../test/fixtures';
import { GeminiLlmClient } from './gemini-llm.client';
import { StructuredRequest } from './llm.client';

// On remplace le SDK : les tests n'appellent jamais Google.
const generateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ models: { generateContent } })),
  FinishReason: { STOP: 'STOP', MAX_TOKENS: 'MAX_TOKENS' },
}));

const request: StructuredRequest = {
  system: 'SYSTEM',
  pdfBase64: Buffer.from('%PDF-1.4 cv').toString('base64'),
  instruction: 'Analyse ce CV.',
  tool: { name: 'save_cv_analysis', description: 'desc', inputSchema: { type: 'object', properties: {} } },
};

const geminiReply = (text: string | undefined, finishReason = 'STOP') => ({
  text,
  modelVersion: 'gemini-3.5-flash-lite',
  candidates: [{ finishReason }],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 300 },
});

describe('GeminiLlmClient', () => {
  beforeEach(() => {
    generateContent.mockReset();
    process.env.GEMINI_API_KEY = 'cle-de-test';
  });
  afterEach(() => delete process.env.GEMINI_API_KEY);

  it('refuse de démarrer sans GEMINI_API_KEY', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => new GeminiLlmClient()).toThrow('GEMINI_API_KEY manquante');
  });

  it('envoie le PDF et le schéma, puis renvoie le JSON du modèle', async () => {
    generateContent.mockResolvedValue(geminiReply(JSON.stringify(validAnalysis())));

    const result = await new GeminiLlmClient().extractStructured(request);

    expect(result).toEqual({ input: validAnalysis(), model: 'gemini-3.5-flash-lite' });
    const params = generateContent.mock.calls[0][0];
    expect(params.contents[0].parts[0].inlineData).toEqual({ mimeType: 'application/pdf', data: request.pdfBase64 });
    expect(params.config.responseJsonSchema).toEqual({ type: 'object', properties: {} });
    expect(params.config.systemInstruction).toBe('SYSTEM');
  });

  it('rejette une réponse coupée par la limite de tokens', async () => {
    generateContent.mockResolvedValue(geminiReply('{"fullName": "Aw', 'MAX_TOKENS'));
    await expect(new GeminiLlmClient().extractStructured(request)).rejects.toThrow('MAX_TOKENS');
  });

  it('rejette une réponse qui n’est pas du JSON', async () => {
    generateContent.mockResolvedValue(geminiReply('Voici le résultat : ...'));
    await expect(new GeminiLlmClient().extractStructured(request)).rejects.toThrow('JSON valide');
  });
});
