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

export const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_JOB_DESCRIPTION_CHARS = 10_000;

@Controller('cv')
export class CvController {
  constructor(private readonly cvService: CvService) {}

  /**
   * POST /cv/analyze  (multipart/form-data)
   *  - file: the resume as a PDF (required)
   *  - jobDescription: text of the job posting (optional)
   */
  @Post('analyze')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES } }))
  async analyze(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('jobDescription') jobDescription?: string,
  ): Promise<CvAnalysisResult> {
    if (!file) throw new BadRequestException('The "file" field (PDF) is required.');
    if (file.size > MAX_PDF_BYTES) throw new PayloadTooLargeException('PDF is too large (5 MB max).');
    // Check the file signature, not just the extension or the declared content type.
    if (file.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException('The file is not a valid PDF.');
    }

    const job = jobDescription?.trim();
    if (job && job.length > MAX_JOB_DESCRIPTION_CHARS) {
      throw new BadRequestException(`The job description exceeds ${MAX_JOB_DESCRIPTION_CHARS} characters.`);
    }

    return this.cvService.analyze(file.buffer, job || undefined);
  }
}
