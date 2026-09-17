import { StyleSchema } from '@blocknote/core';
import { createReactInlineContentSpec } from '@blocknote/react';
import { TFunction } from 'i18next';

import BookIcon from '@/assets/icons/ui-kit/book.svg';
import { DocsBlockNoteEditor } from '@/docs/doc-editor/types';

import { LawSearchPage } from './LawSearchPage';

export type LawArticleInlineContentType = {
  type: 'lawArticleInline';
  propSchema: {
    disabled?: {
      default: false;
      values: [true, false];
    };
    trigger?: {
      default: '/';
      values: readonly ['/'];
    };
  };
  content: 'none';
};

export const LawArticleInlineContent = createReactInlineContentSpec<
  LawArticleInlineContentType,
  StyleSchema
>(
  {
    type: 'lawArticleInline',
    propSchema: {
      disabled: {
        default: false,
        values: [true, false],
      },
      trigger: {
        default: '/',
        values: ['/'],
      },
    },
    content: 'none',
  },
  {
    /**
     * Unlike the interlinking inline content, there is no "linked" state to
     * persist: once a result is inserted (as text, a link or a quote block),
     * this inline content is simply disabled and removed from the doc.
     */
    render: (props) => {
      if (props.inlineContent.props.disabled) {
        return null;
      }

      return <LawSearchPage {...props} />;
    },
  },
);

export const getLawArticleMenuItems = (
  editor: DocsBlockNoteEditor,
  t: TFunction<'translation', undefined>,
  group: string,
) => [
  {
    key: 'law-article',
    title: t('Search a law article'),
    onItemClick: () => {
      editor.insertInlineContent([
        {
          type: 'lawArticleInline',
          props: {
            trigger: '/',
          },
        },
      ]);
    },
    aliases: ['loi', 'article', 'legifrance', 'law'],
    group,
    icon: <BookIcon />,
    subtext: t('Search and insert a Légifrance law article'),
  },
];
