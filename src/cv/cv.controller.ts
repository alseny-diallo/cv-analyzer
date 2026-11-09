import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CvAnalysisResult } from './cv.schema';
import { CvService } from './cv.service';

export const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 Mo
const MAX_JOB_DESCRIPTION_CHARS = 10_000;

@Controller('cv')
export class CvController {
  constructor(private readonly cvService: CvService) {}

  /**
   * POST /cv/analyze  (multipart/form-data)
   *  - file : le CV au format PDF (obligatoire)
   *  - jobDescription : texte de l'offre d'emploi (optionnel)
   */
  @Post('analyze')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES } }))
  async analyze(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('jobDescription') jobDescription?: string,
  ): Promise<CvAnalysisResult> {
    if (!file) throw new BadRequestException('Le champ "file" (PDF) est obligatoire.');
    if (file.size > MAX_PDF_BYTES) throw new PayloadTooLargeException('PDF trop volumineux (5 Mo max).');
    // On vérifie la signature du fichier, pas seulement l'extension ou le type déclaré.
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException("Le fichier n'est pas un PDF valide.");
    }

    const job = jobDescription?.trim();
    if (job && job.length > MAX_JOB_DESCRIPTION_CHARS) {
      throw new BadRequestException(`L'offre dépasse ${MAX_JOB_DESCRIPTION_CHARS} caractères.`);
    }

    return this.cvService.analyze(file.buffer, job || undefined);
  }
}
