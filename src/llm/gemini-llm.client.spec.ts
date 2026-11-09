import { validAnalysis } from '../../test/fixtures';
import { GeminiLlmClient } from './gemini-llm.client';
import { StructuredRequest } from './llm.client';

// Replace the SDK: tests never call Google.
const generateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(() => ({ models: { generateContent } })),
  FinishReason: { STOP: 'STOP', MAX_TOKENS: 'MAX_TOKENS' },
}));

const request: StructuredRequest = {
  system: 'SYSTEM',
  pdfBase64: Buffer.from('%PDF-1.4 cv').toString('base64'),
  instruction: 'Analyze this resume.',
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
    process.env.LLM_API_KEY = 'test-key';
  });
  afterEach(() => delete process.env.LLM_API_KEY);

  it('refuses to start without LLM_API_KEY', () => {
    delete process.env.LLM_API_KEY;
    expect(() => new GeminiLlmClient()).toThrow('LLM_API_KEY is missing');
  });

  it('sends the PDF and the schema, then returns the model JSON', async () => {
    generateContent.mockResolvedValue(geminiReply(JSON.stringify(validAnalysis())));

    const result = await new GeminiLlmClient().extractStructured(request);

    expect(result).toEqual({ input: validAnalysis(), model: 'gemini-3.5-flash-lite' });
    const params = generateContent.mock.calls[0][0];
    expect(params.contents[0].parts[0].inlineData).toEqual({ mimeType: 'application/pdf', data: request.pdfBase64 });
    expect(params.config.responseJsonSchema).toEqual({ type: 'object', properties: {} });
    expect(params.config.systemInstruction).toBe('SYSTEM');
  });

  it('rejects a response cut off by the token limit', async () => {
    generateContent.mockResolvedValue(geminiReply('{"fullName": "Aw', 'MAX_TOKENS'));
    await expect(new GeminiLlmClient().extractStructured(request)).rejects.toThrow('MAX_TOKENS');
  });

  it('rejects a response that is not JSON', async () => {
    generateContent.mockResolvedValue(geminiReply('Here is the result: ...'));
    await expect(new GeminiLlmClient().extractStructured(request)).rejects.toThrow('valid JSON');
  });
});
