import { StyleSchema } from '@blocknote/core';
import { ReactCustomInlineContentRenderProps } from '@blocknote/react';
import { Button, CustomTabs, TabData } from '@gouvfr-lasuite/ui-components';
import { Popover } from '@mantine/core';
import type { KeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';
import { useDebouncedCallback } from 'use-debounce';

import { Box, Card, Icon, InfiniteScroll, Loading, Text } from '@/components';
import { DocsBlockNoteEditor } from '@/docs/doc-editor/types';
import { useResponsiveStore } from '@/stores';

import { LawInlineContentType } from './LawInlineContent';
import {
  LawArticleResult,
  LawSuggestion,
  buildLegifranceUrl,
  fetchLawArticleContent,
  isArticleId,
  suggestLawArticles,
} from './lawArticlesData';

const inputStyle = css`
  background-color: transparent;
  border: none;
  outline: none;
  color: var(--c--globals--colors--gray-700);
  font-size: var(--c--globals--font--sizes--md);
  width: 100%;
  font-family: 'Inter';
`;

type ReactLawArticleSearch = ReactCustomInlineContentRenderProps<
  LawInlineContentType,
  StyleSchema
>;

type InsertMode = 'title' | 'full' | 'titleDate';

// Tab ids: how `LawSuggestion`s are bucketed, mirroring Légifrance's own
// search UI, which only has 3 distinct icons in this scope (Codes / other
// LEGI texts / JORF) rather than one per fine-grained nature.
const TAB_ALL = 'all';
const TAB_CODES = 'codes';
const TAB_LEGI = 'legi';
const TAB_JORF = 'jorf';

const matchesTab = (tabId: string, suggestion: LawSuggestion): boolean => {
  switch (tabId) {
    case TAB_CODES:
      return suggestion.nature === 'code';
    case TAB_LEGI:
      return suggestion.origin === 'LEGI' && suggestion.nature !== 'code';
    case TAB_JORF:
      return suggestion.origin === 'JORF';
    default:
      return true;
  }
};

/**
 * Search UI shown while a law-article inline content is active: an inline
 * text input (opened automatically on mount) backed by a popover listing
 * Légifrance `/suggest` results, grouped in tabs, with infinite scroll.
 * Selecting a result fetches its canonical content (for article-level
 * suggestions) and inserts it as plain editable text (see `insertResult`),
 * removing this node; dismissing the search removes it too, optionally
 * restoring the typed text.
 */
export const LawSearchPage = ({
  contentRef,
  updateInlineContent,
  editor,
}: ReactLawArticleSearch) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const dropdownId = useId();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [suggestions, setSuggestions] = useState<LawSuggestion[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectErrorId, setSelectErrorId] = useState<string | null>(null);
  const [popoverOpened, setPopoverOpened] = useState(false);
  const debounceSearch = useDebouncedCallback(setDebouncedSearch, 300);
  const { isDesktop } = useResponsiveStore();
  const isEditable = editor.isEditable;

  /**
   * createReactInlineContentSpec adds the focus automatically after the
   * inline content, so we defer focusing the input and opening the popover
   * to after mount, same as the interlinking search page.
   */
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
      setPopoverOpened(true);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSearchError(false);
    setPage(1);

    suggestLawArticles(debouncedSearch, 1)
      .then(({ suggestions: results, hasMore: more }) => {
        if (!cancelled) {
          setSuggestions(results);
          setHasMore(more);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
          setHasMore(false);
          setLoading(false);
          setSearchError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const loadMore = () => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    const nextPage = page + 1;
    setIsLoadingMore(true);

    suggestLawArticles(debouncedSearch, nextPage)
      .then(({ suggestions: more, hasMore: moreHasMore }) => {
        setSuggestions((prev) => {
          const seenIds = new Set(prev.map((suggestion) => suggestion.id));
          return [
            ...prev,
            ...more.filter((suggestion) => !seenIds.has(suggestion.id)),
          ];
        });
        setPage(nextPage);
        setHasMore(moreHasMore);
      })
      .catch(() => setHasMore(false))
      .finally(() => setIsLoadingMore(false));
  };

  /**
   * Cancels the search: marks this inline content `disabled` (see
   * LawInlineContent's render) so it renders as nothing, and optionally
   * re-inserts the typed text as plain content (eg. on Escape, so a "/law "
   * the user meant as text isn't silently swallowed).
   */
  const closeSearch = (insertContent: string) => {
    if (!isEditable) {
      return;
    }

    updateInlineContent({
      type: 'lawArticleInline',
      props: {
        disabled: true,
      },
    });

    editor.focus();

    if (insertContent) {
      contentRef(null);
      editor.focus();
      (editor as DocsBlockNoteEditor).insertInlineContent([insertContent]);
    }
  };

  // Commits the chosen article: removes this search node and inserts the
  // article as plain, normally editable text instead of a non-editable
  // chip. In "title" mode the title is inserted linked to its source (when
  // available); in "full" mode the title (bold) and full text are inserted
  // as "Title : text", with no link; in "titleDate" mode the title, its
  // date and the article text are inserted as a gray callout block, with
  // the title and date linked to the source.
  const insertResult = (article: LawArticleResult, mode: InsertMode) => {
    contentRef(null);
    editor.focus();

    if (mode === 'full') {
      (editor as DocsBlockNoteEditor).insertInlineContent([
        { type: 'text', text: article.lawTitle, styles: { bold: true } },
        { type: 'text', text: ` : ${article.lawText}`, styles: {} },
      ]);
      return;
    }

    if (mode === 'titleDate') {
      const titleDateContent = [
        { type: 'text' as const, text: article.lawTitle, styles: { bold: true } },
        ...(article.lawDate
          ? [
              {
                type: 'text' as const,
                text: ` (${article.lawDate})`,
                styles: { italic: true, textColor: 'gray' as const },
              },
            ]
          : []),
      ];

      const titleDateNodes = article.lawSourceUrl
        ? [
            {
              type: 'link' as const,
              href: article.lawSourceUrl,
              content: titleDateContent,
            },
          ]
        : titleDateContent;

      (editor as DocsBlockNoteEditor).insertBlocks(
        [
          {
            type: 'callout',
            props: { backgroundColor: 'gray', emoji: '⚖️' },
            content: [
              ...titleDateNodes,
              { type: 'text', text: `\n${article.lawText}`, styles: {} },
            ],
          },
        ],
        editor.getTextCursorPosition().block,
        'after',
      );
      return;
    }

    (editor as DocsBlockNoteEditor).insertInlineContent(
      article.lawSourceUrl
        ? [
            {
              type: 'link',
              href: article.lawSourceUrl,
              content: [{ type: 'text', text: article.lawTitle, styles: {} }],
            },
          ]
        : [article.lawTitle],
    );
  };

  const selectArticle = (suggestion: LawSuggestion, mode: InsertMode) => {
    if (!isEditable) {
      return;
    }

    // Whole texts/codes have no single citable body: only a linked title
    // can be inserted for them, straight from the suggestion itself.
    if (!isArticleId(suggestion.id)) {
      updateInlineContent({
        type: 'lawArticleInline',
        props: { disabled: true },
      });
      insertResult(
        {
          lawTitle: suggestion.label,
          lawText: '',
          lawSourceUrl: buildLegifranceUrl(suggestion.id),
          lawDate: '',
          lawStatus: '',
        },
        'title',
      );
      return;
    }

    setSelectingId(suggestion.id);
    setSelectErrorId(null);

    fetchLawArticleContent(suggestion)
      .then((article) => {
        updateInlineContent({
          type: 'lawArticleInline',
          props: { disabled: true },
        });
        insertResult(article, mode);
      })
      .catch(() => {
        setSelectErrorId(suggestion.id);
      })
      .finally(() => {
        setSelectingId(null);
      });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Give the user back their typed text as plain "/search" content
      // instead of discarding it.
      e.preventDefault();
      closeSearch(`/${search}`);
    } else if (e.key === 'Backspace' && search.length === 0) {
      // Backspacing on an empty search removes the inline content entirely,
      // like deleting the "/" that triggered the slash menu.
      e.preventDefault();
      closeSearch('');
    } else if (e.key === 'Enter' && suggestions.length > 0) {
      // Enter picks the top result as a linked title, mirroring the
      // slash-menu convention.
      e.preventDefault();
      selectArticle(suggestions[0], 'title');
    }
  };

  const renderResults = (filteredSuggestions: LawSuggestion[]) => (
    <>
      {loading && <Loading $padding="sm" $height="auto" />}

      {!loading && searchError && (
        <Box $padding="sm">
          <Text
            $size="sm"
            $color="var(--c--contextuals--content--semantic--error--primary)"
          >
            {t('Law article search failed, please try again')}
          </Text>
        </Box>
      )}

      {!loading && !searchError && filteredSuggestions.length === 0 && (
        <Box $padding="sm">
          <Text
            $size="sm"
            $color="var(--c--contextuals--content--semantic--neutral--tertiary)"
          >
            {t('No law article found')}
          </Text>
        </Box>
      )}

      {!loading && filteredSuggestions.length > 0 && (
        <InfiniteScrollResults
          suggestions={filteredSuggestions}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMore={loadMore}
          selectingId={selectingId}
          selectErrorId={selectErrorId}
          onSelect={selectArticle}
        />
      )}
    </>
  );

  const tabs: TabData[] = [
    { id: TAB_ALL, label: t('All'), content: renderResults(suggestions) },
    {
      id: TAB_CODES,
      label: t('Codes'),
      icon: 'menu_book',
      content: renderResults(
        suggestions.filter((suggestion) => matchesTab(TAB_CODES, suggestion)),
      ),
    },
    {
      id: TAB_LEGI,
      label: t('Legal texts'),
      icon: 'article',
      content: renderResults(
        suggestions.filter((suggestion) => matchesTab(TAB_LEGI, suggestion)),
      ),
    },
    {
      id: TAB_JORF,
      label: t('Official journal'),
      icon: 'newspaper',
      content: renderResults(
        suggestions.filter((suggestion) => matchesTab(TAB_JORF, suggestion)),
      ),
    },
  ];

  return (
    <Box as="span" $position="relative">
      <Popover
        position="bottom"
        opened={popoverOpened}
        withinPortal={true}
        hideDetached={false}
      >
        <Popover.Target>
          <Box
            as="span"
            className="inline-content"
            $background="var(--c--contextuals--background--semantic--overlay--primary)"
            $color="var(--c--contextuals--content--semantic--neutral--primary)"
            $direction="row"
            $radius="3px"
            $padding="2px"
            $display="inline-flex"
            tabIndex={-1}
          >
            {' '}
            <Box as="span" aria-hidden="true" $height="25px">
              <Icon
                iconName="balance"
                variant="symbols-outlined"
                $size="16px"
              />
            </Box>
            <Box
              as="input"
              name="law-article-search-input"
              role="combobox"
              aria-label={t('Search for a law article')}
              aria-expanded={popoverOpened}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-controls={dropdownId}
              $padding={{ left: '3px' }}
              placeholder={t('search a law article...')}
              $css={inputStyle}
              ref={inputRef}
              $display="inline-flex"
              onInput={(e) => {
                const value = (e.target as HTMLInputElement).value;
                setSearch(value);
                debounceSearch(value);
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </Box>
        </Popover.Target>
        <Popover.Dropdown>
          <Box
            $minWidth={isDesktop ? '330px' : '220px'}
            $maxWidth="420px"
            $width="fit-content"
            $zIndex="10"
            $css={css`
              position: relative;

              .mantine-Popover-dropdown[data-position='bottom'] & {
                top: -10px;
              }
              .mantine-Popover-dropdown[data-position='top'] & {
                top: 10px;
              }
            `}
          >
            <Box ref={modalRef} id={dropdownId} aria-label={t('Search results')}>
              <Card
                $css={css`
                  box-shadow: 0 0 6px 0 rgba(0, 0, 145, 0.1);
                  border: 1px solid
                    var(--c--contextuals--border--surface--primary);
                  background: var(
                    --c--contextuals--background--surface--primary
                  );
                  max-height: 340px;
                  overflow-y: auto;
                  overflow-x: hidden;
                `}
                $margin="sm"
                $padding="none"
              >
                <CustomTabs tabs={tabs} />
              </Card>
            </Box>
          </Box>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
};

type InfiniteScrollResultsProps = {
  suggestions: LawSuggestion[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  selectingId: string | null;
  selectErrorId: string | null;
  onSelect: (suggestion: LawSuggestion, mode: InsertMode) => void;
};

const NATURE_LABELS: Record<string, string> = {
  code: 'Code',
  loi: 'Loi',
  decret: 'Décret',
  ordonnance: 'Ordonnance',
  arrete: 'Arrêté',
};

const InfiniteScrollResults = ({
  suggestions,
  hasMore,
  isLoadingMore,
  loadMore,
  selectingId,
  selectErrorId,
  onSelect,
}: InfiniteScrollResultsProps) => {
  const { t } = useTranslation();

  return (
    <InfiniteScroll
      hasMore={hasMore}
      isLoading={isLoadingMore}
      next={loadMore}
      $css="max-height: 260px; overflow-y: auto;"
    >
      {suggestions.map((suggestion) => {
        const isSelecting = selectingId === suggestion.id;
        const hasSelectError = selectErrorId === suggestion.id;
        const isArticle = isArticleId(suggestion.id);

        return (
          <Box
            key={suggestion.id}
            $direction="row"
            $align="flex-start"
            $justify="space-between"
            $gap="0.4rem"
            $width="100%"
            $padding="sm"
            $css={css`
              text-align: left;
              min-width: 0;
              max-width: 100%;
              box-sizing: border-box;

              &:hover,
              &:focus-within {
                background-color: var(
                  --c--contextuals--background--semantic--contextual--primary
                );
              }

              &:hover .law-article-result-actions,
              &:focus-within .law-article-result-actions {
                opacity: 1;
                pointer-events: auto;
              }
            `}
          >
            <Box
              $direction="column"
              $align="flex-start"
              $gap="0.2rem"
              $css={css`
                min-width: 0;
                flex: 1;
              `}
            >
              <Text $size="sm" $weight="600">
                {suggestion.label}
              </Text>
              <Text
                $size="xs"
                $color="var(--c--contextuals--content--semantic--neutral--tertiary)"
              >
                {NATURE_LABELS[suggestion.nature] ?? suggestion.nature}
              </Text>
              {hasSelectError && (
                <Text
                  $size="xs"
                  $color="var(--c--contextuals--content--semantic--error--primary)"
                >
                  {t('Failed to fetch this article, please try again')}
                </Text>
              )}
            </Box>

            {isSelecting ? (
              <Loading $padding="none" $height="auto" />
            ) : (
              <Box
                className="law-article-result-actions"
                $direction="row"
                $gap="0.2rem"
                $css={css`
                  flex-shrink: 0;
                  opacity: 0;
                  pointer-events: none;
                  transition: opacity 0.15s ease;
                `}
              >
                <Button
                  size="nano"
                  variant="tertiary"
                  color="neutral"
                  aria-label={t('Insert as a linked title')}
                  title={t('Insert as a linked title')}
                  onClick={() => onSelect(suggestion, 'title')}
                  icon={<Icon iconName="link" $size="16px" />}
                />
                {isArticle && (
                  <>
                    <Button
                      size="nano"
                      variant="tertiary"
                      color="neutral"
                      aria-label={t('Insert as a linked title with date')}
                      title={t('Insert as a linked title with date')}
                      onClick={() => onSelect(suggestion, 'titleDate')}
                      icon={<Icon iconName="crop_square" $size="16px" />}
                    />
                    <Button
                      size="nano"
                      variant="tertiary"
                      color="neutral"
                      aria-label={t('Insert as full text')}
                      title={t('Insert as full text')}
                      onClick={() => onSelect(suggestion, 'full')}
                      icon={<Icon iconName="notes" $size="16px" />}
                    />
                  </>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </InfiniteScroll>
  );
};
