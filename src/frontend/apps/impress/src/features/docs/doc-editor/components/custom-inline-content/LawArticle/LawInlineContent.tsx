import { StyleSchema } from '@blocknote/core';
import { createReactInlineContentSpec } from '@blocknote/react';
import { TFunction } from 'i18next';

import { Icon } from '@/components';
import { DocsBlockNoteEditor } from '@/docs/doc-editor/types';

import { LawSearchPage } from './LawSearchPage';

/**
 * "Law article" is a BlockNote custom inline content type: a transient
 * editor-native search UI that lets users look up a law-article database and
 * insert the result as plain (optionally linked) editable text. Once an
 * article is picked, LawSearchPage inserts real text/link content and marks
 * this node `disabled`, so it never persists as a non-editable chip.
 */
export type LawInlineContentType = {
  type: 'lawArticleInline';
  propSchema: {
    disabled?: {
      default: false;
      values: [true, false];
    };
  };
  content: 'none';
};

// createReactInlineContentSpec registers this type with BlockNote: the
// propSchema below declares the persisted fields/defaults, and `render`
// (further down) decides what to display for a given set of props.
export const LawInlineContent = createReactInlineContentSpec<
  LawInlineContentType,
  StyleSchema
>(
  {
    type: 'lawArticleInline',
    propSchema: {
      disabled: {
        default: false,
        values: [true, false],
      },
    },
    content: 'none',
  },
  {
    /**
     * `disabled` is a one-shot flag: LawSearchPage sets it right before it
     * unmounts itself (on selection or cancel), once it has already
     * inserted the final text/link content, to avoid a flash of the
     * search UI while BlockNote removes this node.
     */
    render: (props) => {
      const { disabled } = props.inlineContent.props;

      if (disabled) {
        return null;
      }

      return <LawSearchPage {...props} />;
    },
  },
);

// Entry point wired into the editor's "/" slash menu; picking it inserts an
// empty law-article inline content, which renders as LawSearchPage until
// the user selects an article.
export const getLawArticleSlashMenuItems = (
  editor: DocsBlockNoteEditor,
  t: TFunction<'translation', undefined>,
  group: string,
) => [
  {
    key: 'law-article',
    title: t('Law article'),
    onItemClick: () => {
      editor.insertInlineContent([
        {
          type: 'lawArticleInline',
          props: {},
        },
      ]);
    },
    aliases: ['law', 'article', 'loi', 'legifrance', 'droit'],
    group,
    icon: <Icon iconName="balance" variant="symbols-outlined" $size="18px" />,
    subtext: t('Search and insert a law article'),
  },
];
