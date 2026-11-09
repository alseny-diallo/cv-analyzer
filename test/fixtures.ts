import { CvAnalysis } from '../src/cv/cv.schema';

/** A valid analysis, overridable per test. */
export const validAnalysis = (overrides: Partial<CvAnalysis> = {}): CvAnalysis => ({
  fullName: 'Awa Ndiaye',
  email: 'awa@example.com',
  phone: null,
  location: 'Dakar',
  yearsOfExperience: 3,
  skills: ['TypeScript', 'NestJS'],
  languages: ['French'],
  experiences: [{ title: 'Developer', company: 'Acme', startDate: '2022', endDate: 'Present', highlights: [] }],
  education: [],
  jobMatch: null,
  confidence: 0.9,
  warnings: [],
  ...overrides,
});
