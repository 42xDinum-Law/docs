import { StyleSchema } from '@blocknote/core';
import { ReactCustomInlineContentRenderProps } from '@blocknote/react';
import { Popover } from '@mantine/core';
import type { KeyboardEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import BookIcon from '@/assets/icons/ui-kit/book.svg';
import ContentCopyIcon from '@/assets/icons/ui-kit/content_copy.svg';
import FormatTextIcon from '@/assets/icons/ui-kit/format-text.svg';
import LinkIcon from '@/assets/icons/ui-kit/link.svg';
import {
  Box,
  Card,
  QuickSearch,
  QuickSearchGroup,
  QuickSearchItemContent,
  Text,
} from '@/components';
import { QuickSearchData } from '@/components/quick-search';
import { DocsBlockNoteEditor } from '@/docs/doc-editor/types';
import { useResponsiveStore } from '@/stores';

import { LawSearchResult, useLawSearch } from './api/useLawSearch';
import { LawArticleInlineContentType } from './LawArticleInlineContent';
import { extractLegifranceReference } from './utils/extractLegifranceReference';

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
  LawArticleInlineContentType,
  StyleSchema
>;

export const LawSearchPage = ({
  contentRef,
  updateInlineContent,
  editor,
}: ReactLawArticleSearch) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const { isDesktop } = useResponsiveStore();
  const isEditable = editor.isEditable;
  const modalRef = useRef<HTMLDivElement>(null);
  const dropdownId = useId();
  const [popoverOpened, setPopoverOpened] = useState(false);

  const { data, isFetching, isLoading } = useLawSearch(search);
  const loading = isFetching || isLoading;
  const results = data?.data ?? [];

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
      setPopoverOpened(true);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  const closeSearch = () => {
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
  };

  const cancelSearch = () => {
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
  };

  const insertReference = (result: LawSearchResult) => {
    if (!isEditable) {
      return;
    }
    const { label } = extractLegifranceReference(result);
    (editor as DocsBlockNoteEditor).insertInlineContent([label]);
    closeSearch();
  };

  const insertUrl = (result: LawSearchResult) => {
    if (!isEditable) {
      return;
    }
    const { label, url } = extractLegifranceReference(result);
    if (!url) {
      return;
    }
    (editor as DocsBlockNoteEditor).insertInlineContent([
      {
        type: 'link',
        href: url,
        content: [{ type: 'text', text: label, styles: {} }],
      },
    ]);
    closeSearch();
  };

  const insertQuote = (result: LawSearchResult) => {
    if (!isEditable) {
      return;
    }
    const currentBlock = editor.getTextCursorPosition().block;
    editor.insertBlocks(
      [{ type: 'quote', content: result.chunk.content }],
      currentBlock,
      'after',
    );
    closeSearch();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelSearch();
    } else if (e.key === 'Backspace' && search.length === 0) {
      e.preventDefault();
      cancelSearch();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const commandList = modalRef.current?.querySelector('[cmdk-list]');
      const syntheticEvent = new KeyboardEvent('keydown', {
        key: e.key,
        bubbles: true,
        cancelable: true,
      });
      commandList?.dispatchEvent(syntheticEvent);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const selectedItem = modalRef.current?.querySelector(
        '[cmdk-item][data-selected="true"]',
      ) as HTMLElement;

      selectedItem?.click();
      e.preventDefault();
    }
  };

  const lawSearchData: QuickSearchData<LawSearchResult> = {
    groupName: t('Law articles'),
    groupKey: 'law-articles',
    elements: search ? results : [],
    emptyString: !search
      ? t('Type to search a law article...')
      : loading
        ? t('Searching law articles...')
        : t('No law article found'),
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
              <BookIcon width="16px" height="16px" />
            </Box>
            <Box
              as="input"
              name="law-search-input"
              role="combobox"
              aria-label={t('Search a law article')}
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
                setSearch((e.target as HTMLInputElement).value);
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
            />
          </Box>
        </Popover.Target>
        <Popover.Dropdown>
          <Box
            ref={modalRef}
            id={dropdownId}
            role="listbox"
            aria-label={t('Law article search results')}
            $minWidth={isDesktop ? '420px' : '280px'}
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

              & .quick-search-container [cmdk-root] {
                border-radius: inherit;
                background: transparent;
              }
            `}
          >
            <Card
              $css={css`
                box-shadow: 0 0 6px 0 rgba(0, 0, 145, 0.1);
                border: 1px solid var(--c--contextuals--border--surface--primary);
                background: var(--c--contextuals--background--surface--primary);
              `}
              $margin="sm"
              $padding="none"
            >
              <QuickSearch showInput={false} isSelectByDefault>
                <QuickSearchGroup
                  group={lawSearchData}
                  onSelect={insertReference}
                  renderElement={(result) => {
                    const { label } = extractLegifranceReference(result);
                    const excerpt = result.chunk.content
                      .split('\n')
                      .slice(1)
                      .join(' ')
                      .slice(0, 140);

                    const stopAndRun = (
                      e: {
                        preventDefault: () => void;
                        stopPropagation: () => void;
                      },
                      action: () => void,
                    ) => {
                      e.preventDefault();
                      e.stopPropagation();
                      action();
                    };

                    return (
                      <QuickSearchItemContent
                        alwaysShowRight
                        left={
                          <Box $direction="column" $gap="2px" $width="100%">
                            <Text
                              $size="sm"
                              $weight="500"
                              $color="var(--c--contextuals--content--semantic--neutral--primary)"
                            >
                              {label}
                            </Text>
                            {excerpt && (
                              <Text
                                $size="xs"
                                $color="var(--c--contextuals--content--semantic--neutral--tertiary)"
                              >
                                {excerpt}…
                              </Text>
                            )}
                          </Box>
                        }
                        right={
                          <Box $direction="row" $gap="4px">
                            <Box
                              as="button"
                              type="button"
                              aria-label={t('Insert reference text')}
                              title={t('Insert reference text')}
                              onClick={(e) =>
                                stopAndRun(e, () => insertReference(result))
                              }
                            >
                              <FormatTextIcon width="18px" height="18px" />
                            </Box>
                            <Box
                              as="button"
                              type="button"
                              aria-label={t('Insert Légifrance URL')}
                              title={t('Insert Légifrance URL')}
                              disabled={
                                !extractLegifranceReference(result).url
                              }
                              onClick={(e) =>
                                stopAndRun(e, () => insertUrl(result))
                              }
                            >
                              <LinkIcon width="18px" height="18px" />
                            </Box>
                            <Box
                              as="button"
                              type="button"
                              aria-label={t('Insert article text as a quote')}
                              title={t('Insert article text as a quote')}
                              onClick={(e) =>
                                stopAndRun(e, () => insertQuote(result))
                              }
                            >
                              <ContentCopyIcon width="18px" height="18px" />
                            </Box>
                          </Box>
                        }
                      />
                    );
                  }}
                />
              </QuickSearch>
            </Card>
          </Box>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
};
