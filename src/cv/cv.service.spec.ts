import { BadGatewayException } from '@nestjs/common';
import { LlmClient, StructuredRequest, StructuredResponse } from '../llm/llm.client';
import { validAnalysis } from '../../test/fixtures';
import { CvService } from './cv.service';

class FakeLlm extends LlmClient {
  lastRequest?: StructuredRequest;
  constructor(private readonly respond: () => Promise<StructuredResponse>) {
    super();
  }
  extractStructured(req: StructuredRequest) {
    this.lastRequest = req;
    return this.respond();
  }
}

const pdf = Buffer.from('%PDF-1.4 fake');
const ok = (input: unknown) => async () => ({ input, model: 'test-model' });

describe('CvService', () => {
  it('returns a validated analysis without review when everything is clear', async () => {
    const service = new CvService(new FakeLlm(ok(validAnalysis())));
    const result = await service.analyze(pdf);

    expect(result.analysis.fullName).toBe('Awa Ndiaye');
    expect(result.needsHumanReview).toBe(false);
    expect(result.model).toBe('test-model');
  });

  it('sends the PDF as base64 and a tool schema without $schema', async () => {
    const llm = new FakeLlm(ok(validAnalysis()));
    await new CvService(llm).analyze(pdf);

    expect(llm.lastRequest?.pdfBase64).toBe(pdf.toString('base64'));
    expect(llm.lastRequest?.tool.inputSchema).toMatchObject({ type: 'object' });
    expect(llm.lastRequest?.tool.inputSchema).not.toHaveProperty('$schema');
  });

  it('rejects model output that does not match the schema', async () => {
    const service = new CvService(new FakeLlm(ok({ fullName: 42 })));
    await expect(service.analyze(pdf)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('turns an API error into a 502 without exposing the details', async () => {
    const service = new CvService(
      new FakeLlm(async () => {
        throw new Error('401 invalid x-api-key');
      }),
    );
    await expect(service.analyze(pdf)).rejects.toThrow('The analysis service is unavailable');
  });

  it('requires human review when confidence is low or the model reports an issue', async () => {
    const service = new CvService(
      new FakeLlm(ok(validAnalysis({ confidence: 0.4, warnings: ['Suspicious instructions in the document'] }))),
    );
    const result = await service.analyze(pdf);

    expect(result.needsHumanReview).toBe(true);
    expect(result.reviewReasons.join(' ')).toContain('Low confidence');
    expect(result.reviewReasons.join(' ')).toContain('Suspicious instructions');
  });

  it('ignores a jobMatch returned when no job description was provided', async () => {
    const service = new CvService(
      new FakeLlm(ok(validAnalysis({ jobMatch: { score: 100, strengths: [], gaps: [] } }))),
    );
    const result = await service.analyze(pdf);
    expect(result.analysis.jobMatch).toBeNull();
  });

  it('requires review of an extreme match score', async () => {
    const service = new CvService(
      new FakeLlm(ok(validAnalysis({ jobMatch: { score: 95, strengths: ['NestJS'], gaps: [] } }))),
    );
    const result = await service.analyze(pdf, 'NestJS developer');

    expect(result.needsHumanReview).toBe(true);
    expect(result.reviewReasons.join(' ')).toContain('match score');
  });
});
