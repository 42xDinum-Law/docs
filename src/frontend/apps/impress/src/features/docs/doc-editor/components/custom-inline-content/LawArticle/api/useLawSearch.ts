import { useQuery } from '@tanstack/react-query';

import { APIError, errorCauses, fetchAPI } from '@/api';

export type LawSearchChunk = {
  id: number;
  document_id: number;
  content: string;
  metadata: Record<string, string | number | boolean> | null;
};

export type LawSearchResult = {
  method: string;
  score: number;
  chunk: LawSearchChunk;
};

export type LawSearchResponse = {
  object: string;
  data: LawSearchResult[];
};

const searchLaw = async (q: string): Promise<LawSearchResponse> => {
  const response = await fetchAPI(`law-search/?q=${encodeURIComponent(q)}`);

  if (!response.ok) {
    throw new APIError(
      'Failed to search law articles',
      await errorCauses(response),
    );
  }

  return response.json() as Promise<LawSearchResponse>;
};

export const KEY_LAW_SEARCH = 'law-search';

export const useLawSearch = (q: string, queryConfig?: { enabled?: boolean }) => {
  return useQuery<LawSearchResponse, APIError>({
    queryKey: [KEY_LAW_SEARCH, q],
    queryFn: () => searchLaw(q),
    enabled: !!q,
    ...queryConfig,
  });
};
