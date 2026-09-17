import fetchMock from 'fetch-mock';
import { beforeEach, describe, expect, it } from 'vitest';

import { APIError } from '@/api';

import {
  fetchLawArticleContent,
  isArticleId,
  suggestLawArticles,
} from '../lawArticlesData';

const makeSuggestion = (id: string) => ({
  id,
  label: `Label ${id}`,
  origin: 'LEGI',
  nature: 'loi',
});

describe('isArticleId', () => {
  it('returns true for LEGIARTI/JORFARTI ids', () => {
    expect(isArticleId('LEGIARTI000033205136')).toBe(true);
    expect(isArticleId('JORFARTI000033202984')).toBe(true);
  });

  it('returns false for whole-text ids', () => {
    expect(isArticleId('LEGITEXT000006074220')).toBe(false);
    expect(isArticleId('JORFTEXT000019277729')).toBe(false);
  });
});

describe('suggestLawArticles', () => {
  beforeEach(() => {
    fetchMock.hardReset();
    fetchMock.mockGlobal();
  });

  it('does not call the API for an empty query', async () => {
    const result = await suggestLawArticles('   ', 1);

    expect(result).toEqual({ suggestions: [], hasMore: false });
    expect(fetchMock.callHistory.calls().length).toBe(0);
  });

  it('reports hasMore when a full page comes back', async () => {
    const results = Array.from({ length: 10 }, (_, i) => makeSuggestion(`id-${i}`));
    fetchMock.route(
      'http://test.jest/api/v1.0/law-suggest/?q=environnement&page=1',
      { results },
    );

    const result = await suggestLawArticles('environnement', 1);

    expect(result.suggestions).toEqual(results);
    expect(result.hasMore).toBe(true);
  });

  it('reports no more results when less than a full page comes back', async () => {
    fetchMock.route(
      'http://test.jest/api/v1.0/law-suggest/?q=route&page=1',
      { results: [makeSuggestion('id-0')] },
    );

    const result = await suggestLawArticles('route', 1);

    expect(result.hasMore).toBe(false);
  });

  it('throws an APIError on a non-ok response', async () => {
    fetchMock.route(
      'http://test.jest/api/v1.0/law-suggest/?q=route&page=1',
      500,
    );

    await expect(suggestLawArticles('route', 1)).rejects.toBeInstanceOf(
      APIError,
    );
  });
});

describe('fetchLawArticleContent', () => {
  beforeEach(() => {
    fetchMock.hardReset();
    fetchMock.mockGlobal();
  });

  it('parses a getArticle response into a LawArticleResult', async () => {
    fetchMock.route(
      'http://test.jest/api/v1.0/law-article/?id=LEGIARTI000033205136',
      {
        article: {
          id: 'LEGIARTI000033205136',
          texte: '  Some article text.  ',
          num: '8',
          etat: 'VIGUEUR',
          dateDebut: 1475971200000,
          textTitles: [
            {
              id: 'JORFTEXT000033202746',
              titre: 'LOI n° 2016-1321 du 7 octobre 2016',
              etat: '',
            },
            {
              id: 'LEGITEXT000033205014',
              titre: 'LOI n°2016-1321 du 7 octobre 2016',
              etat: 'VIGUEUR',
            },
          ],
        },
      },
    );

    const result = await fetchLawArticleContent({ id: 'LEGIARTI000033205136' });

    expect(result).toEqual({
      lawTitle: 'LOI n°2016-1321 du 7 octobre 2016 - Article 8',
      lawText: 'Some article text.',
      lawSourceUrl:
        'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033205136',
      lawDate: '9 octobre 2016',
      lawStatus: 'En vigueur',
    });
  });

  it('falls back to "Article <num>" when there is no textTitles entry', async () => {
    fetchMock.route(
      'http://test.jest/api/v1.0/law-article/?id=LEGIARTI000033205136',
      {
        article: {
          id: 'LEGIARTI000033205136',
          texte: 'Text',
          num: '8',
          etat: 'ABROGE',
          dateDebut: 1475971200000,
        },
      },
    );

    const result = await fetchLawArticleContent({ id: 'LEGIARTI000033205136' });

    expect(result.lawTitle).toBe('Article 8');
    expect(result.lawStatus).toBe('Abrogé');
  });

  it('throws an APIError on a non-ok response', async () => {
    fetchMock.route(
      'http://test.jest/api/v1.0/law-article/?id=LEGIARTI000033205136',
      500,
    );

    await expect(
      fetchLawArticleContent({ id: 'LEGIARTI000033205136' }),
    ).rejects.toBeInstanceOf(APIError);
  });
});
