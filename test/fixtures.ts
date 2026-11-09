import { CvAnalysis } from '../src/cv/cv.schema';

/** Une analyse valide, modifiable au cas par cas dans les tests. */
export const validAnalysis = (overrides: Partial<CvAnalysis> = {}): CvAnalysis => ({
  fullName: 'Awa Ndiaye',
  email: 'awa@example.com',
  phone: null,
  location: 'Dakar',
  yearsOfExperience: 3,
  skills: ['TypeScript', 'NestJS'],
  languages: ['Français'],
  experiences: [{ title: 'Développeuse', company: 'Acme', startDate: '2022', endDate: 'Présent', highlights: [] }],
  education: [],
  jobMatch: null,
  confidence: 0.9,
  warnings: [],
  ...overrides,
});
