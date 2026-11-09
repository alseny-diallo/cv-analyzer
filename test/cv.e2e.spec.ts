import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { validAnalysis } from './fixtures';
import { LlmClient } from '../src/llm/llm.client';

describe('POST /cv/analyze (e2e)', () => {
  let app: INestApplication;
  const fakeLlm = { extractStructured: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LlmClient)
      .useValue(fakeLlm)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => fakeLlm.extractStructured.mockReset());

  it('analyse un PDF et transmet l’offre au modèle', async () => {
    fakeLlm.extractStructured.mockResolvedValue({ input: validAnalysis(), model: 'test-model' });

    const res = await request(app.getHttpServer())
      .post('/cv/analyze')
      .field('jobDescription', 'Développeur Node.js et IA')
      .attach('file', Buffer.from('%PDF-1.7 contenu'), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(200);

    expect(res.body.analysis.fullName).toBe('Awa Ndiaye');
    expect(fakeLlm.extractStructured.mock.calls[0][0].instruction).toContain('Développeur Node.js et IA');
  });

  it('refuse une requête sans fichier', () =>
    request(app.getHttpServer()).post('/cv/analyze').expect(400));

  it("refuse un fichier qui n'est pas un PDF, même renommé en .pdf", async () => {
    await request(app.getHttpServer())
      .post('/cv/analyze')
      .attach('file', Buffer.from('MZ binaire'), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(400);
    expect(fakeLlm.extractStructured).not.toHaveBeenCalled();
  });

  it('refuse un fichier de plus de 5 Mo', () =>
    request(app.getHttpServer())
      .post('/cv/analyze')
      .attach('file', Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)]), 'gros.pdf')
      .expect(413));
});
