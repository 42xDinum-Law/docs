import { APIError, errorCauses, fetchAPI } from '@/api';

// Shape returned once a suggestion's canonical content has been fetched and
// parsed, and stored as the inline content's props once an article has been
// picked.
export type LawArticleResult = {
  lawTitle: string;
  lawText: string;
  lawSourceUrl: string;
  lawDate: string;
  lawStatus: string;
};

/**
 * A single `/suggest` result: identifies an official Légifrance text, either
 * a specific article (`LEGIARTI…`/`JORFARTI…`, see `isArticleId`) or a whole
 * text/code (`LEGITEXT…`/`JORFTEXT…`). Only whole articles can be resolved to
 * citable content via `fetchLawArticleContent`.
 */
export type LawSuggestion = {
  id: string;
  label: string;
  origin: string;
  nature: string;
};

type LawSuggestApiResponse = {
  results: LawSuggestion[];
};

/**
 * Raw shape returned by `consult/getArticle`/`consult/getArticleByCid`
 * (proxied as-is by `/law-article/`, see `core.api.viewsets.LawArticleView`).
 * Only a subset of fields is used — see `parseLegifranceArticle` — the rest
 * is kept untyped since it's a passthrough.
 */
type LegifranceArticleApiResponse = {
  article: {
    id: string;
    texte: string;
    num: string;
    etat: string;
    dateDebut: number;
    textTitles?: { id: string; titre: string; etat: string }[];
  };
};

const LEGIFRANCE_SUGGEST_PAGE_SIZE = 10;

// Légifrance status codes to their human-readable French label. Unknown
// codes fall back to the raw value so new statuses don't break the UI.
const STATUS_LABELS: Record<string, string> = {
  VIGUEUR: 'En vigueur',
  ABROGE: 'Abrogé',
  MODIFIE: 'Modifié',
};

/**
 * Rebuilds a Légifrance permalink from an id (eg. `LEGIARTI...`,
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
 * Whether `id` identifies a single article (`LEGIARTI…`/`JORFARTI…`) rather
 * than a whole text/code (`LEGITEXT…`/`JORFTEXT…`). Only article ids can be
 * resolved to citable content via `consult/getArticle(ByCid)` — `/suggest`
 * returns both kinds mixed together.
 */
export const isArticleId = (id: string): boolean =>
  id.startsWith('LEGIARTI') || id.startsWith('JORFARTI');

/**
 * Formats a Légifrance date (epoch milliseconds, as returned by
 * `consult/getArticle`) as a French date (eg. "1 octobre 2016"). Falls back
 * to an empty string if it doesn't parse.
 */
export const formatLawDate = (epochMs: number): string => {
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

/**
 * Parses a raw `consult/getArticle`/`getArticleByCid` response into the
 * shape the LawArticle feature displays. The title is built from the
 * containing text's current title (the `textTitles` entry marked `VIGUEUR`,
 * falling back to the last one) plus the article number, eg.
 * "Code civil - Article 1101".
 */
export const parseLegifranceArticle = (
  result: LegifranceArticleApiResponse,
): LawArticleResult => {
  const { article } = result;
  const textTitles = article.textTitles ?? [];
  const textTitle =
    textTitles.find((title) => title.etat === 'VIGUEUR') ??
    textTitles[textTitles.length - 1];

  return {
    lawTitle: textTitle
      ? `${textTitle.titre} - Article ${article.num}`
      : `Article ${article.num}`,
    lawText: article.texte.trim(),
    lawSourceUrl: buildLegifranceUrl(article.id),
    lawDate: formatLawDate(article.dateDebut),
    lawStatus: article.etat ? (STATUS_LABELS[article.etat] ?? article.etat) : '',
  };
};

/**
 * Suggests Légifrance texts (LEGI/JORF) matching `query` via the
 * `/law-suggest/` endpoint, for the dropdown's typeahead. Empty queries
 * resolve to no results without hitting the API, since the endpoint
 * requires a non-empty `q`.
 *
 * `hasMore` is a heuristic (a full page came back, there's *probably* more)
 * rather than a real total from the API: Légifrance's `totalResultNumber`
 * has been observed to be unreliable (`0` even with 10 results returned).
 */
export const suggestLawArticles = async (
  query: string,
  page: number,
): Promise<{ suggestions: LawSuggestion[]; hasMore: boolean }> => {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return { suggestions: [], hasMore: false };
  }

  const response = await fetchAPI(
    `law-suggest/?q=${encodeURIComponent(trimmedQuery)}&page=${page}`,
  );

  if (!response.ok) {
    throw new APIError(
      'Failed to suggest law articles',
      await errorCauses(response),
    );
  }

  const { results } = (await response.json()) as LawSuggestApiResponse;

  return {
    suggestions: results,
    hasMore: results.length === LEGIFRANCE_SUGGEST_PAGE_SIZE,
  };
};

/**
 * Fetches an article's canonical content via the `/law-article/` endpoint,
 * to cite it verbatim. Only valid for article ids (see `isArticleId`) — a
 * whole text/code has no single citable body.
 */
export const fetchLawArticleContent = async (
  suggestion: Pick<LawSuggestion, 'id'>,
): Promise<LawArticleResult> => {
  const response = await fetchAPI(
    `law-article/?id=${encodeURIComponent(suggestion.id)}`,
  );

  if (!response.ok) {
    throw new APIError(
      'Failed to fetch law article content',
      await errorCauses(response),
    );
  }

  const result = (await response.json()) as LegifranceArticleApiResponse;

  return parseLegifranceArticle(result);
};
