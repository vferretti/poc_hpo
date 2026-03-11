// INTEGRATION: Replace `fetch()` calls with `sendRequestWithRpt()` from 'api'.
// Use the HPO_TREE_API_URL env variable for the base URL:
//   import EnvironmentVariables from 'utils/EnvVariables';
//   const HPO_TREE_SERVICE_URL = EnvironmentVariables.configFor('HPO_TREE_API_URL');
// Then adapt each method, e.g.:
//   const fetchRoots = () => sendRequestWithRpt<HpoRootsResponse>({
//     method: 'GET',
//     url: `${HPO_TREE_SERVICE_URL}/api/roots`,
//   });
// Note: sendRequestWithRpt returns { data, error } — unwrap accordingly.

export interface HpoTreeNode {
  id: string;
  label: string;
  is_leaf: boolean;
  child_count: number;
}

export interface HpoRootsResponse {
  root: HpoTreeNode;
  children: HpoTreeNode[];
  total_count: number;
  auto_translate_count?: number;
  fr_total_count?: number;
}

export interface HpoChildrenResponse {
  parent_id: string;
  children: HpoTreeNode[];
}

export interface HpoSearchNode extends HpoTreeNode {
  parent_ids: string[];
}

export interface HpoSearchResponse {
  query: string;
  match_count: number;
  matched_ids: string[];
  expanded_ids: string[];
  nodes: Record<string, HpoSearchNode>;
}

export type Lang = 'fr' | 'en';

export const HpoTreeApi = {
  fetchRoots: async (lang: Lang = 'fr', signal?: AbortSignal): Promise<HpoRootsResponse> => {
    const resp = await fetch(`/api/roots?lang=${lang}`, { signal });
    if (!resp.ok) throw new Error('Failed to fetch roots');
    return resp.json();
  },

  fetchChildren: async (nodeId: string, lang: Lang = 'fr', signal?: AbortSignal): Promise<HpoChildrenResponse> => {
    const resp = await fetch(`/api/children/${encodeURIComponent(nodeId)}?lang=${lang}`, { signal });
    if (!resp.ok) throw new Error(`Failed to fetch children for ${nodeId}`);
    return resp.json();
  },

  search: async (query: string, lang: Lang = 'fr', signal?: AbortSignal): Promise<HpoSearchResponse> => {
    const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}&lang=${lang}`, { signal });
    if (!resp.ok) throw new Error('Search failed');
    return resp.json();
  },
};
