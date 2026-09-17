import { LawSearchResult } from '../api/useLawSearch';

export type LegifranceReference = {
  label: string;
  url: string;
};

/**
 * Légifrance splits its corpus in two URL families: "codes" for code articles,
 * and "loda" for everything else (lois, décrets, ordonnances, arrêtés).
 * Verified against real Albert API responses: metadata._doc_id is a LEGIARTI
 * id that resolves at https://www.legifrance.gouv.fr/{codes|loda}/article_lc/{id}.
 */
export const extractLegifranceReference = (
  result: LawSearchResult,
): LegifranceReference => {
  const { content, metadata } = result.chunk;
  // The first line of the chunk content is already the clean citation,
  // e.g. "LOI n° 2016-1321 du 7 octobre 2016 pour une République numérique (1) - Article 8"
  const label = content.split('\n')[0];

  const docId = metadata?.['_doc_id'];
  const category = metadata?.category;
  const base = category === 'CODE' ? 'codes' : 'loda';
  const url =
    typeof docId === 'string'
      ? `https://www.legifrance.gouv.fr/${base}/article_lc/${docId}`
      : '';

  return { label, url };
};
