export interface SearchBlockLike {
  name: string;
  terms: string[];
}

/**
 * Deterministic boolean query builder — no AI involved (see Section 7.1:
 * a documented search string must be auditable as "terms combined with
 * OR/AND", not "an LLM generated something similar").
 *
 * Terms within a block are joined with OR; multi-word terms are quoted.
 * Blocks are joined with AND.
 */
export function buildBooleanQuery(blocks: SearchBlockLike[]): string {
  const blockQueries = blocks
    .filter((b) => b.terms.length > 0)
    .map((b) => {
      const terms = b.terms.map((t) => (t.trim().includes(" ") ? `"${t.trim()}"` : t.trim()));
      return terms.length > 1 ? `(${terms.join(" OR ")})` : terms[0] ?? "";
    })
    .filter(Boolean);

  return blockQueries.join(" AND ");
}
