import { APIError, errorCauses, fetchAPI } from '@/api';

// Shape returned by the law-article search once parsed, and stored as the
// inline content's props once an article has been picked.
export type LawArticleResult = {
  lawTitle: string;
  lawText: string;
  lawSourceUrl: string;
  lawDate: string;
  lawStatus: string;
  // AI-generated summary of `lawText` (see `AlbertApiClient._summarize_all`
  // on the backend), capped at ~80 characters for the dropdown preview.
  // Undefined if the backend couldn't generate one.
  lawSummary?: string;
  // Raw Légifrance category from `chunk.metadata.category` (eg. "LOI",
  // "CODE", "DECRET"), used to build the result tabs. Empty if missing.
  lawCategory: string;
};

// Légifrance category codes to their human-readable French label, used for
// the search-result tabs. A category with no entry here falls back to a
// title-cased version of its raw code (see `formatCategoryLabel`).
export const CATEGORY_LABELS: Record<string, string> = {
  LOI: 'Loi',
  CODE: 'Code',
  DECRET: 'Décret',
  ORDONNANCE: 'Ordonnance',
  ARRETE: 'Arrêté',
  ACCORD_FONCTION_PUBLIQUE: 'Accord',
};

// Formats a raw category code (eg. "ACCORD_FONCTION_PUBLIQUE") as a French
// label, falling back to a readable guess for codes not in
// `CATEGORY_LABELS` so new Légifrance categories don't break the tabs.
export const formatCategoryLabel = (category: string): string =>
  CATEGORY_LABELS[category] ??
  category
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Raw shape returned by the `/law-search/` endpoint, which itself proxies
 * the Albert API's search response as-is (see `core.api.viewsets.LawSearchView`
 * on the backend). Only a subset of `chunk.metadata` is actually used — see
 * `parseLawApiResult` — the rest is kept untyped since it's a passthrough.
 */
export type LawApiResult = {
  method: string;
  score: number;
  // AI-generated summary added by the backend (see
  // `AlbertApiClient._summarize_all`); absent/undefined if generation failed.
  summary?: string | null;
  chunk: {
    id: number;
    document_id: number;
    content: string;
    metadata: Record<string, string | number | boolean> | null;
  };
};

type LawSearchApiResponse = {
  object: string;
  data: LawApiResult[];
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

// Reads a string field out of a chunk's opaque metadata, since the API only
// guarantees it's a JSON object of scalars, not this feature's exact shape.
const getMetadataString = (
  metadata: LawApiResult['chunk']['metadata'],
  key: string,
): string | undefined => {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Parses a raw API result into the shape the LawArticle feature displays.
 */
export const parseLawApiResult = (result: LawApiResult): LawArticleResult => {
  const { content, metadata } = result.chunk;
  const newlineIndex = content.indexOf('\n');
  const text = newlineIndex === -1 ? '' : content.slice(newlineIndex + 1);
  const status = getMetadataString(metadata, 'status');

  return {
    lawTitle: extractLawTitle(content),
    lawText: text.trim(),
    lawSourceUrl: buildLegifranceUrl(getMetadataString(metadata, '_doc_id')),
    lawDate: getMetadataString(metadata, 'start_date') ?? '',
    lawStatus: status ? (STATUS_LABELS[status] ?? status) : '',
    lawSummary: result.summary ?? undefined,
    lawCategory: getMetadataString(metadata, 'category') ?? '',
  };
};

/**
 * Searches law articles via the `/law-search/` endpoint, which proxies a
 * Légifrance-backed semantic/chunk search (the Albert API) restricted to
 * in-force (VIGUEUR) texts. Empty queries resolve to no results without
 * hitting the API, since the endpoint requires a non-empty `q`.
 */
export const searchLawArticles = async (
  query: string,
): Promise<LawArticleResult[]> => {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return [];
  }

  const response = await fetchAPI(
    `law-search/?q=${encodeURIComponent(trimmedQuery)}`,
  );

  if (!response.ok) {
    throw new APIError(
      'Failed to search law articles',
      await errorCauses(response),
    );
  }

  const { data } = (await response.json()) as LawSearchApiResponse;

  return data.map(parseLawApiResult);
};
