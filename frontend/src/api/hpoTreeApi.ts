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

export const HpoTreeApi = {
  fetchRoots: async (signal?: AbortSignal): Promise<HpoRootsResponse> => {
    const resp = await fetch('/api/roots', { signal });
    if (!resp.ok) throw new Error('Failed to fetch roots');
    return resp.json();
  },

  fetchChildren: async (nodeId: string, signal?: AbortSignal): Promise<HpoChildrenResponse> => {
    const resp = await fetch(`/api/children/${encodeURIComponent(nodeId)}`, { signal });
    if (!resp.ok) throw new Error(`Failed to fetch children for ${nodeId}`);
    return resp.json();
  },

  search: async (query: string, signal?: AbortSignal): Promise<HpoSearchResponse> => {
    const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });
    if (!resp.ok) throw new Error('Search failed');
    return resp.json();
  },
};
