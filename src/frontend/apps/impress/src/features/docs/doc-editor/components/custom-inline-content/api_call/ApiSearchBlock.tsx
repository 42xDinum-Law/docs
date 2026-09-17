import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { createReactBlockSpec } from "@blocknote/react";
import type { TFunction } from "i18next";
import { useState } from "react";

import { Icon } from "@/components";

import type { DocsBlockNoteEditor } from "../../../types";

type ApiSource = "users" | "dog";

// Public demo APIs the block can query. `needsQuery` toggles the input field
// (JSONPlaceholder needs a numeric user id, Dog CEO takes no parameter).
const API_SOURCES: Record<
  ApiSource,
  { label: string; needsQuery: boolean; placeholder?: string }
> = {
  users: {
    label: "Utilisateurs (JSONPlaceholder)",
    needsQuery: true,
    placeholder: "ID utilisateur (1 à 10)...",
  },
  dog: {
    label: "Image de chien (Dog CEO)",
    needsQuery: false,
  },
};

// BlockNote block that lets a user pick a public demo API, run a query, and
// persist the result in the block props so it's saved with the document.
export const ApiSearchBlock = createReactBlockSpec(
  {
    type: "apiSearch",
    propSchema: {
      apiSource: { default: "users" as ApiSource, values: ["users", "dog"] },
      searchQuery: { default: "" },
      resultName: { default: "" },
      resultEmail: { default: "" },
      resultImageUrl: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const [query, setQuery] = useState(block.props.searchQuery);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");

      const apiSource = block.props.apiSource as ApiSource;
      const sourceConfig = API_SOURCES[apiSource];

      // Clears previous results so switching source or re-querying never
      // shows stale data from the other API shape.
      const resetResults = () => ({
        resultName: "",
        resultEmail: "",
        resultImageUrl: "",
      });

      const onSourceChange = (nextSource: ApiSource) => {
        setError("");
        editor.updateBlock(block, {
          props: { ...block.props, apiSource: nextSource, ...resetResults() },
        });
      };

      const triggerApiCall = async () => {
        if (sourceConfig.needsQuery && !query) return;

        setLoading(true);
        setError("");

        try {
          if (apiSource === "users") {
            // JSONPlaceholder exposes users by numeric id (1-10); anything
            // else 404s and is surfaced as the "not found" error below.
            const response = await fetch(
              `https://jsonplaceholder.typicode.com/users/${encodeURIComponent(query)}`,
            );

            if (!response.ok) throw new Error("Erreur de requête ou utilisateur non trouvé.");

            const data = await response.json();

            editor.updateBlock(block, {
              props: {
                ...block.props,
                searchQuery: query,
                ...resetResults(),
                resultName: data.name,
                resultEmail: data.email,
              }
            });
          } else {
            // Dog CEO ignores the query and always returns a random image.
            const response = await fetch("https://dog.ceo/api/breeds/image/random");

            if (!response.ok) throw new Error("Erreur de requête à l'API.");

            const data = await response.json();

            editor.updateBlock(block, {
              props: {
                ...block.props,
                searchQuery: query,
                ...resetResults(),
                resultImageUrl: data.message,
              }
            });
          }
        } catch (err: any) {
          setError(err.message);
          editor.updateBlock(block, { props: { ...block.props, searchQuery: query, ...resetResults() } });
        } finally {
          setLoading(false);
        }
      };

      return (
        <div style={{
          border: "1px solid #e2e8f0",
          padding: "16px",
          borderRadius: "8px",
          backgroundColor: "#f8fafc",
          margin: "8px 0"
        }}>
          {/* Badge de statut */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "11px", fontWeight: "bold" }}>
            <span style={{ color: "#64748b" }}>
              🌐 API PUBLIQUE ({sourceConfig.label})
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {/* Sélection de la source d'API */}
            <select
              value={apiSource}
              onChange={(e) => onSourceChange(e.target.value as ApiSource)}
              style={{ border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "4px" }}
            >
              {Object.entries(API_SOURCES).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>

            {/* Barre de recherche principale */}
            <div style={{ display: "flex", gap: "8px" }}>
              {sourceConfig.needsQuery && (
                <input
                  type="number"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={sourceConfig.placeholder}
                  style={{ border: "1px solid #cbd5e1", padding: "6px 12px", borderRadius: "4px", width: "100%" }}
                  onKeyDown={(e) => e.key === 'Enter' && triggerApiCall()}
                />
              )}
              <button
                onClick={triggerApiCall}
                style={{
                  padding: "6px 12px",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                Exécuter
              </button>
            </div>
          </div>

          {loading && <p style={{ fontSize: "14px", color: "#64748b", marginTop: "8px" }}>Appel en cours...</p>}
          {error && <p style={{ fontSize: "14px", color: "#ef4444", marginTop: "8px" }}>❌ {error}</p>}

          {block.props.resultName && (
            <div style={{ marginTop: "12px", backgroundColor: "white", padding: "10px", borderRadius: "4px", border: "1px solid #e2e8f0" }}>
              <p style={{ margin: 0, fontWeight: "bold", color: "#1e293b" }}>👤 {block.props.resultName}</p>
              <p style={{ margin: "4px 0 0 0", fontSize: "14px", color: "#64748b" }}>✉️ {block.props.resultEmail}</p>
            </div>
          )}

          {block.props.resultImageUrl && (
            <div style={{ marginTop: "12px" }}>
              <img
                src={block.props.resultImageUrl}
                alt="Chien aléatoire"
                style={{ maxWidth: "100%", borderRadius: "4px" }}
              />
            </div>
          )}
        </div>
      );
    },
  }
);

// Registers the block in BlockNote's slash ("/") menu so it can be inserted
// into a document.
export const getApiSearchSlashMenuItems = (
  editor: DocsBlockNoteEditor,
  t: TFunction<'translation', undefined>,
  group: string,
) => [
  {
    key: 'apiSearch',
    title: t('API search'),
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, {
        type: 'apiSearch',
      });
    },
    aliases: ['api', 'search', 'recherche'],
    group,
    icon: <Icon iconName="search" $size="18px" />,
    subtext: t('Add an API search block'),
  },
];
