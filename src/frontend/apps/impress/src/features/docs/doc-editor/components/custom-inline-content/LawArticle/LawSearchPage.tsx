import { StyleSchema } from '@blocknote/core';
import { ReactCustomInlineContentRenderProps } from '@blocknote/react';
import { Popover } from '@mantine/core';
import type { KeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';
import { useDebouncedCallback } from 'use-debounce';

import { Box, Card, Icon, Text } from '@/components';
import { DocsBlockNoteEditor } from '@/docs/doc-editor/types';
import { useResponsiveStore } from '@/stores';

import { LawInlineContentType } from './LawInlineContent';
import {
  LawArticleResult,
  getFirstSentence,
  searchLawArticles,
} from './lawArticlesData';

// Formats a `YYYY-MM-DD` law date (eg. "2016-10-01") as a French date (eg.
// "1 octobre 2016"). Falls back to the raw value if it doesn't parse.
const formatLawDate = (isoDate: string): string => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

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

/**
 * Search UI shown while a law-article inline content is active: an inline
 * text input (opened automatically on mount) backed by a popover listing
 * results from `searchLawArticles`. Selecting a result inserts it as plain
 * editable text (see `selectArticle`) and removes this node; dismissing the
 * search removes it too, optionally restoring the typed text.
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
  const [results, setResults] = useState<LawArticleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
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

    searchLawArticles(debouncedSearch)
      .then((articles) => {
        if (!cancelled) {
          setResults(articles);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setLoading(false);
          setSearchError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

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
  const selectArticle = (
    article: LawArticleResult,
    mode: 'title' | 'full' | 'titleDate',
  ) => {
    if (!isEditable) {
      return;
    }

    updateInlineContent({
      type: 'lawArticleInline',
      props: {
        disabled: true,
      },
    });

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
                text: ` (${formatLawDate(article.lawDate)})`,
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
    } else if (e.key === 'Enter' && results.length > 0) {
      // Enter picks the top result as a linked title, mirroring the
      // slash-menu convention.
      e.preventDefault();
      selectArticle(results[0], 'title');
    }
  };

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
            <Box
              ref={modalRef}
              id={dropdownId}
              role="listbox"
              aria-label={t('Search results')}
            >
              <Card
                $css={css`
                  box-shadow: 0 0 6px 0 rgba(0, 0, 145, 0.1);
                  border: 1px solid
                    var(--c--contextuals--border--surface--primary);
                  background: var(
                    --c--contextuals--background--surface--primary
                  );
                  max-height: 280px;
                  overflow-y: auto;
                  overflow-x: hidden;
                `}
                $margin="sm"
                $padding="none"
              >
                {loading && (
                  <Box $padding="sm">
                    <Text
                      $size="sm"
                      $color="var(--c--contextuals--content--semantic--neutral--tertiary)"
                    >
                      {t('Searching...')}
                    </Text>
                  </Box>
                )}

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

                {!loading && !searchError && results.length === 0 && (
                  <Box $padding="sm">
                    <Text
                      $size="sm"
                      $color="var(--c--contextuals--content--semantic--neutral--tertiary)"
                    >
                      {t('No law article found')}
                    </Text>
                  </Box>
                )}

                {!loading &&
                  results.map((article, index) => (
                    <Box
                      key={article.lawSourceUrl}
                      role="option"
                      aria-selected={index === 0}
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
                          {article.lawTitle}
                        </Text>
                        <Text
                          $size="xs"
                          $color="var(--c--contextuals--content--semantic--neutral--tertiary)"
                          $css={css`
                            width: 100%;
                            white-space: normal;
                            overflow-wrap: break-word;
                            display: -webkit-box;
                            -webkit-line-clamp: 2;
                            -webkit-box-orient: vertical;
                            overflow: hidden;
                          `}
                        >
                          {getFirstSentence(article.lawText)}
                        </Text>
                      </Box>
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
                        {(['title', 'titleDate', 'full'] as const).map(
                          (mode) => (
                            <Box
                              key={mode}
                              as="button"
                              type="button"
                              title={
                                mode === 'title'
                                  ? t('Insert as a linked title')
                                  : mode === 'full'
                                    ? t('Insert as full text')
                                    : t('Insert as a linked title with date')
                              }
                              aria-label={
                                mode === 'title'
                                  ? t('Insert as a linked title')
                                  : mode === 'full'
                                    ? t('Insert as full text')
                                    : t('Insert as a linked title with date')
                              }
                              onClick={() => selectArticle(article, mode)}
                              $padding="3px"
                              $css={css`
                                display: inline-flex;
                                border: 1px solid
                                  var(
                                    --c--contextuals--border--surface--primary
                                  );
                                border-radius: 4px;
                                cursor: pointer;
                                background: var(
                                  --c--contextuals--background--surface--primary
                                );
                              `}
                            >
                              <Icon
                                iconName={
                                  mode === 'title'
                                    ? 'link'
                                    : mode === 'full'
                                      ? 'notes'
                                      : 'crop_square'
                                }
                                $size="16px"
                              />
                            </Box>
                          ),
                        )}
                      </Box>
                    </Box>
                  ))}
              </Card>
            </Box>
          </Box>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
};
