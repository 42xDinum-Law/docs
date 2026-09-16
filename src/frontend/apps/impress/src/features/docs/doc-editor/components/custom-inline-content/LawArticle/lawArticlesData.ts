// Shape returned by the (mocked) law-article search, and stored as the
// inline content's props once an article has been picked.
export type LawArticleResult = {
  lawTitle: string;
  lawText: string;
  lawSourceUrl: string;
  lawDate: string;
  lawStatus: string;
};

/**
 * Returns just the first sentence of `text` (up to and including the first
 * ., ! or ?), or `text` itself if it has no sentence-ending punctuation.
 * Used to keep search-result previews short without mid-word ellipsis.
 */
export const getFirstSentence = (text: string): string => {
  const match = /^.*?[.!?](?=\s|$)/.exec(text);
  return match ? match[0] : text;
};

/**
 * Demo dataset standing in for a real law-article API (eg. Légifrance),
 * following the same "public demo source" pattern as ApiSearchBlock.
 */
const LAW_ARTICLES: LawArticleResult[] = [
  {
    lawTitle: 'Code civil - Article 1101',
    lawText:
      'Le contrat est un accord de volontés entre deux ou plusieurs personnes destiné à créer, modifier, transmettre ou éteindre des obligations.',
    lawSourceUrl:
      'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032040637',
    lawDate: '2016-10-01',
    lawStatus: 'En vigueur',
  },
  {
    lawTitle: 'Code civil - Article 1103',
    lawText:
      'Les contrats légalement formés tiennent lieu de loi à ceux qui les ont faits.',
    lawSourceUrl:
      'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032040627',
    lawDate: '2016-10-01',
    lawStatus: 'En vigueur',
  },
  {
    lawTitle: 'Code civil - Article 1104',
    lawText:
      'Les contrats doivent être négociés, formés et exécutés de bonne foi.',
    lawSourceUrl:
      'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032040625',
    lawDate: '2016-10-01',
    lawStatus: 'En vigueur',
  },
  {
    lawTitle: 'Code du travail - Article L1221-1',
    lawText:
      'Le contrat de travail est soumis aux règles du droit commun. Il peut être établi selon les formes que les parties contractantes décident d’adopter.',
    lawSourceUrl:
      'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006900783',
    lawDate: '2008-05-01',
    lawStatus: 'En vigueur',
  },
  {
    lawTitle: 'Code de la consommation - Article L217-3',
    lawText:
      'Le vendeur est tenu de livrer un bien conforme au contrat et répond des défauts de conformité existant lors de la délivrance.',
    lawSourceUrl:
      'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032227500',
    lawDate: '2016-07-01',
    lawStatus: 'En vigueur',
  },
  {
    lawTitle: 'RGPD - Article 5',
    lawText:
      'Les données à caractère personnel doivent être traitées de façon licite, loyale et transparente au regard de la personne concernée.',
    lawSourceUrl: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    lawDate: '2018-05-25',
    lawStatus: 'En vigueur',
  },
];

/**
 * Simulates a search-API call against a law-article database.
 *
 * Swap this out for a real request (eg. to Légifrance's API) to go from
 * demo data to a live lookup — the rest of the LawArticle feature only
 * depends on this function's signature.
 */
export const searchLawArticles = async (
  query: string,
): Promise<LawArticleResult[]> => {
  // Artificial delay so the search UI's loading state is visible in the demo.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return LAW_ARTICLES;
  }

  return LAW_ARTICLES.filter(
    (article) =>
      article.lawTitle.toLowerCase().includes(normalizedQuery) ||
      article.lawText.toLowerCase().includes(normalizedQuery),
  );
};
