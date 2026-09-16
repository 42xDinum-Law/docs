// Shape returned by the law-article search once parsed, and stored as the
// inline content's props once an article has been picked.
export type LawArticleResult = {
  lawTitle: string;
  lawText: string;
  lawSourceUrl: string;
  lawDate: string;
  lawStatus: string;
};

/**
 * Raw shape returned by the law-article search API (a Légifrance-backed
 * semantic/chunk search). Only a subset of these fields is actually used —
 * see `parseLawApiResult` — the rest (eg. `method`, `score`, `chunk.id`,
 * `collection_id`, `_chunk_id`, `_chunk_hash`, `created`) is kept here only
 * because the API returns it.
 */
export type LawApiResult = {
  method: string;
  score: number;
  chunk: {
    object: string;
    id: number;
    collection_id: number;
    document_id: number;
    content: string;
    metadata: {
      category: string;
      status: string;
      start_date: string;
      end_date: string;
      number: string;
      _doc_id: string;
      _chunk_id: string;
      _chunk_hash: string;
    };
    created: number;
  };
};

// Légifrance status codes to their human-readable French label. Unknown
// codes fall back to the raw value so new statuses don't break the UI.
const STATUS_LABELS: Record<string, string> = {
  VIGUEUR: 'En vigueur',
  ABROGE: 'Abrogé',
  MODIFIE: 'Modifié',
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
 * Rebuilds a Légifrance permalink from a `_doc_id` (eg. `LEGIARTI...`,
 * `JORFARTI...`, `LEGITEXT...`, `JORFTEXT...`). Légifrance uses a different
 * URL scheme per id prefix, so this can't be a single template.
 */
export const buildLegifranceUrl = (docId?: string): string => {
  if (!docId) {
    return 'https://www.legifrance.gouv.fr';
  }

  // Articles de code et lois consolidées (ex: LEGIARTI000033205136)
  if (docId.startsWith('LEGIARTI')) {
    return `https://www.legifrance.gouv.fr/codes/article_lc/${docId}`;
  }

  // Articles du Journal Officiel initial (ex: JORFARTI000033205136)
  if (docId.startsWith('JORFARTI')) {
    return `https://www.legifrance.gouv.fr/jorf/article_jo/${docId}`;
  }

  // Textes complets (LEGITEXT / JORFTEXT)
  if (docId.startsWith('LEGITEXT') || docId.startsWith('JORFTEXT')) {
    return `https://www.legifrance.gouv.fr/loda/id/${docId}`;
  }

  // Repli vers la recherche générale
  return `https://www.legifrance.gouv.fr/search/all?tab_selection=all&searchField=ALL&query=${encodeURIComponent(docId)}`;
};

/**
 * Extracts the article's title from a chunk's `content`: everything before
 * the first newline (eg. "Code civil - Article 1101" or "LOI n° 2016-1321
 * ... - Article 8"). The rest of `content` is the article text (and, for
 * some sources, section headers).
 */
export const extractLawTitle = (content: string): string => {
  const newlineIndex = content.indexOf('\n');
  return (newlineIndex === -1 ? content : content.slice(0, newlineIndex)).trim();
};

/**
 * Parses a raw API result into the shape the LawArticle feature displays.
 */
export const parseLawApiResult = (result: LawApiResult): LawArticleResult => {
  const { content, metadata } = result.chunk;
  const newlineIndex = content.indexOf('\n');
  const text = newlineIndex === -1 ? '' : content.slice(newlineIndex + 1);

  return {
    lawTitle: extractLawTitle(content),
    lawText: text.trim(),
    lawSourceUrl: buildLegifranceUrl(metadata._doc_id),
    lawDate: metadata.start_date,
    lawStatus: STATUS_LABELS[metadata.status] ?? metadata.status,
  };
};

/**
 * Demo dataset standing in for the real law-article search API (a
 * Légifrance-backed semantic/chunk search), shaped exactly like its
 * response so `parseLawApiResult` above is the only place that needs to
 * change once this is swapped for a real request.
 */
const LAW_API_RESULTS: LawApiResult[] = [
  {
    method: 'semantic',
    score: 0.91,
    chunk: {
      object: 'chunk',
      id: 0,
      collection_id: 139226,
      document_id: 1,
      content:
        "Code civil - Article 1101\nLivre III : Des différentes manières dont on acquiert la propriété - Titre III : Des sources d'obligations - Sous-titre Ier : Le contrat\nLe contrat est un accord de volontés entre deux ou plusieurs personnes destiné à créer, modifier, transmettre ou éteindre des obligations.",
      metadata: {
        category: 'CODE',
        status: 'VIGUEUR',
        start_date: '2016-10-01',
        end_date: '2999-01-01',
        number: '1101',
        _doc_id: 'LEGIARTI000032040637',
        _chunk_id: 'LEGIARTI000032040637_1',
        _chunk_hash: 'a1b2c3d4e5f6a7b8',
      },
      created: 1729000000,
    },
  },
  {
    method: 'semantic',
    score: 0.89,
    chunk: {
      object: 'chunk',
      id: 0,
      collection_id: 139226,
      document_id: 2,
      content:
        "Code civil - Article 1103\nLivre III : Des différentes manières dont on acquiert la propriété - Titre III : Des sources d'obligations - Sous-titre Ier : Le contrat\nLes contrats légalement formés tiennent lieu de loi à ceux qui les ont faits.",
      metadata: {
        category: 'CODE',
        status: 'VIGUEUR',
        start_date: '2016-10-01',
        end_date: '2999-01-01',
        number: '1103',
        _doc_id: 'LEGIARTI000032040627',
        _chunk_id: 'LEGIARTI000032040627_1',
        _chunk_hash: 'b2c3d4e5f6a7b8c9',
      },
      created: 1729000000,
    },
  },
  {
    method: 'semantic',
    score: 0.87,
    chunk: {
      object: 'chunk',
      id: 0,
      collection_id: 139226,
      document_id: 3,
      content:
        "Code civil - Article 1104\nLivre III : Des différentes manières dont on acquiert la propriété - Titre III : Des sources d'obligations - Sous-titre Ier : Le contrat\nLes contrats doivent être négociés, formés et exécutés de bonne foi.",
      metadata: {
        category: 'CODE',
        status: 'VIGUEUR',
        start_date: '2016-10-01',
        end_date: '2999-01-01',
        number: '1104',
        _doc_id: 'LEGIARTI000032040625',
        _chunk_id: 'LEGIARTI000032040625_1',
        _chunk_hash: 'c3d4e5f6a7b8c9d0',
      },
      created: 1729000000,
    },
  },
  {
    method: 'semantic',
    score: 0.84,
    chunk: {
      object: 'chunk',
      id: 0,
      collection_id: 139226,
      document_id: 4,
      content:
        "Code du travail - Article L1221-1\nPartie législative - Livre II : Le contrat de travail\nLe contrat de travail est soumis aux règles du droit commun. Il peut être établi selon les formes que les parties contractantes décident d'adopter.",
      metadata: {
        category: 'CODE',
        status: 'VIGUEUR',
        start_date: '2008-05-01',
        end_date: '2999-01-01',
        number: 'L1221-1',
        _doc_id: 'LEGIARTI000006900783',
        _chunk_id: 'LEGIARTI000006900783_1',
        _chunk_hash: 'd4e5f6a7b8c9d0e1',
      },
      created: 1729000000,
    },
  },
  {
    method: 'semantic',
    score: 0.82,
    chunk: {
      object: 'chunk',
      id: 0,
      collection_id: 139226,
      document_id: 5,
      content:
        "Code de la consommation - Article L217-3\nLivre II : Formation, exécution et inexécution des contrats - Titre Ier : Conditions de conformité au contrat de vente\nLe vendeur est tenu de livrer un bien conforme au contrat et répond des défauts de conformité existant lors de la délivrance.",
      metadata: {
        category: 'CODE',
        status: 'VIGUEUR',
        start_date: '2016-07-01',
        end_date: '2999-01-01',
        number: 'L217-3',
        _doc_id: 'LEGIARTI000032227500',
        _chunk_id: 'LEGIARTI000032227500_1',
        _chunk_hash: 'e5f6a7b8c9d0e1f2',
      },
      created: 1729000000,
    },
  },
  {
    method: 'semantic',
    score: 0.81349325,
    chunk: {
      object: 'chunk',
      id: 0,
      collection_id: 139226,
      document_id: 3800123,
      content:
        "LOI n° 2016-1321 du 7 octobre 2016 pour une République numérique (1) - Article 8\nLA CIRCULATION DES DONNÉES ET DU SAVOIR - Economie de la donnée - Ouverture de l'accès aux données publiques\nI. - A modifié les dispositions suivantes :\n- Code des relations entre le public et l'administration\n  Art. L311-4\nII. - La publication en ligne prévue aux articles L. 312-1-1 et L. 312-1-3 du code des relations entre le public et l'administration est effectuée :\n1° Six mois après la promulgation de la présente loi, pour les documents mentionnés au 1° de l'article L. 312-1-1 ;\n2° Un an après la promulgation de la présente loi, pour les documents mentionnés au 2° du même article L. 312-1-1 ;\n3° A une date fixée par décret, et au plus tard deux ans après la promulgation de la présente loi, pour l'ensemble des autres documents entrant dans le champ d'application des mêmes articles L. 312-1-1 et L. 312-1-3",
      metadata: {
        category: 'LOI',
        status: 'VIGUEUR',
        start_date: '2016-10-09',
        end_date: '2999-01-01',
        number: '8',
        _doc_id: 'LEGIARTI000033205136',
        _chunk_id: 'LEGIARTI000033205136_1',
        _chunk_hash: '489654bdbb1ee457',
      },
      created: 1774199288,
    },
  },
];

/**
 * Simulates a search-API call against a law-article database.
 *
 * Swap this out for a real request (eg. to Légifrance's API) to go from
 * demo data to a live lookup — it only needs to return `LawApiResult[]`
 * matching the real API's response shape, since `parseLawApiResult` handles
 * turning that into what the rest of the LawArticle feature consumes.
 */
export const searchLawArticles = async (
  query: string,
): Promise<LawArticleResult[]> => {
  // Artificial delay so the search UI's loading state is visible in the demo.
  await new Promise((resolve) => setTimeout(resolve, 200));

  const articles = LAW_API_RESULTS.map(parseLawApiResult);

  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return articles;
  }

  return articles.filter(
    (article) =>
      article.lawTitle.toLowerCase().includes(normalizedQuery) ||
      article.lawText.toLowerCase().includes(normalizedQuery),
  );
};
