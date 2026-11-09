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
  it('renvoie une analyse validée sans relecture quand tout est clair', async () => {
    const service = new CvService(new FakeLlm(ok(validAnalysis())));
    const result = await service.analyze(pdf);

    expect(result.analysis.fullName).toBe('Awa Ndiaye');
    expect(result.needsHumanReview).toBe(false);
    expect(result.model).toBe('test-model');
  });

  it("envoie le PDF en base64 et un schéma d'outil sans $schema", async () => {
    const llm = new FakeLlm(ok(validAnalysis()));
    await new CvService(llm).analyze(pdf);

    expect(llm.lastRequest?.pdfBase64).toBe(pdf.toString('base64'));
    expect(llm.lastRequest?.tool.inputSchema).toMatchObject({ type: 'object' });
    expect(llm.lastRequest?.tool.inputSchema).not.toHaveProperty('$schema');
  });

  it('rejette une sortie du modèle qui ne respecte pas le schéma', async () => {
    const service = new CvService(new FakeLlm(ok({ fullName: 42 })));
    await expect(service.analyze(pdf)).rejects.toBeInstanceOf(BadGatewayException);
  });

  it("transforme une erreur de l'API en 502 sans exposer le détail", async () => {
    const service = new CvService(
      new FakeLlm(async () => {
        throw new Error('401 invalid x-api-key');
      }),
    );
    await expect(service.analyze(pdf)).rejects.toThrow("Le service d'analyse est indisponible");
  });

  it('demande une relecture humaine si la confiance est faible ou si le modèle signale un problème', async () => {
    const service = new CvService(
      new FakeLlm(ok(validAnalysis({ confidence: 0.4, warnings: ['Instructions suspectes dans le document'] }))),
    );
    const result = await service.analyze(pdf);

    expect(result.needsHumanReview).toBe(true);
    expect(result.reviewReasons.join(' ')).toContain('Confiance faible');
    expect(result.reviewReasons.join(' ')).toContain('Instructions suspectes');
  });

  it("ignore un jobMatch renvoyé alors qu'aucune offre n'a été fournie", async () => {
    const service = new CvService(
      new FakeLlm(ok(validAnalysis({ jobMatch: { score: 100, strengths: [], gaps: [] } }))),
    );
    const result = await service.analyze(pdf);
    expect(result.analysis.jobMatch).toBeNull();
  });

  it("fait relire un score d'adéquation extrême", async () => {
    const service = new CvService(
      new FakeLlm(ok(validAnalysis({ jobMatch: { score: 95, strengths: ['NestJS'], gaps: [] } }))),
    );
    const result = await service.analyze(pdf, 'Développeur NestJS');

    expect(result.needsHumanReview).toBe(true);
    expect(result.reviewReasons.join(' ')).toContain('Score');
  });
});
