import { useCallback, useEffect, useRef, useState } from 'react';
import { Input, Spin, Tree } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { HpoTreeApi, HpoRootsResponse, HpoSearchNode, HpoSearchResponse, HpoTreeNode } from '../../api/hpoTreeApi';
import { TreeNode } from './types';
import { intl } from './intl';

import styles from './index.module.css';

interface OwnProps {
  checkedKeys?: string[];
  disabledKeys?: string[];
  onCheckItem?: (key: string, checked: boolean, label: string) => void;
  className?: string;
}

const PA_ROOT = 'HP:0000118';
const DEBOUNCE_MS = 600;
const MIN_SEARCH_LENGTH = 3;

const getHpoId = (pathKey: string): string => {
  const idx = pathKey.lastIndexOf('/');
  return idx >= 0 ? pathKey.substring(idx + 1) : pathKey;
};

const formatCount = (n: number) => {
  const label = n > 1
    ? intl.get('component.phenotypeTree.count.plural')
    : intl.get('component.phenotypeTree.count.singular');
  return `${n} ${label}`;
};

const toTreeNode = (hpo: HpoTreeNode, disabled: Set<string>, bold = false): TreeNode => ({
  title: bold
    ? (<span><strong>{hpo.label}</strong> <span className={styles.hpoId}>({hpo.id})</span></span>) as unknown as string
    : `${hpo.label} (${hpo.id})`,
  key: hpo.id,
  isLeaf: hpo.is_leaf,
  children: [],
  disabled: disabled.has(hpo.id),
});

const highlightLabel = (label: string, id: string, query: string): React.ReactNode => {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = label.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className={styles.highlight}>{part}</mark>
          : part,
      )}
      <span className={styles.hpoId}> ({id})</span>
    </span>
  );
};

function buildSearchTree(
  data: HpoSearchResponse,
  query: string,
  disabled: Set<string>,
): { tree: TreeNode[]; expanded: string[]; hpoIdToPathKeys: Map<string, string[]> } {
  const matchedIds = new Set(data.matched_ids);
  const expandedIds = new Set(data.expanded_ids);

  const childrenOf = new Map<string, HpoSearchNode[]>();
  for (const node of Object.values(data.nodes)) {
    for (const pid of node.parent_ids ?? []) {
      let list = childrenOf.get(pid);
      if (!list) { list = []; childrenOf.set(pid, list); }
      list.push(node);
    }
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  const expandedPathKeys: string[] = [];
  const hpoIdToPathKeys = new Map<string, string[]>();

  const build = (id: string, parentPathKey: string): TreeNode | null => {
    const nd = data.nodes[id];
    if (!nd) return null;

    const pathKey = parentPathKey ? `${parentPathKey}/${id}` : id;

    let list = hpoIdToPathKeys.get(id);
    if (!list) { list = []; hpoIdToPathKeys.set(id, list); }
    list.push(pathKey);

    if (expandedIds.has(id)) expandedPathKeys.push(pathKey);

    const kids = expandedIds.has(id)
      ? (childrenOf.get(id) ?? [])
          .map((c) => build(c.id, pathKey))
          .filter((n): n is TreeNode => n !== null)
      : [];

    return {
      title: (matchedIds.has(id) ? highlightLabel(nd.label, id, query) : `${nd.label} (${id})`) as string,
      key: pathKey,
      isLeaf: kids.length === 0,
      children: kids,
      disabled: disabled.has(id),
    };
  };

  const root = build(PA_ROOT, '');
  return {
    tree: root?.children ?? [],
    expanded: expandedPathKeys,
    hpoIdToPathKeys,
  };
}

const PhenotypeTree = ({
  checkedKeys = [],
  disabledKeys = [],
  onCheckItem,
  className = '',
}: OwnProps) => {
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [searchMode, setSearchMode] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const hpoIdToPathKeysRef = useRef(new Map<string, string[]>());
  const rootsCacheRef = useRef<HpoRootsResponse | null>(null);
  const labelCacheRef = useRef(new Map<string, string>());
  const disabledRef = useRef(new Set(disabledKeys));
  disabledRef.current = new Set(disabledKeys);

  const applyRootsFromCache = useCallback(() => {
    const data = rootsCacheRef.current;
    if (!data) return;
    setTotalCount(data.total_count);
    setMatchCount(null);
    setSearchMode(false);
    setTreeNodes(data.children.map((c) => toTreeNode(c, disabledRef.current, true)));
    setExpandedKeys([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    HpoTreeApi.fetchRoots().then((data) => {
      rootsCacheRef.current = data;
      data.children.forEach((c) => labelCacheRef.current.set(c.id, c.label));
      applyRootsFromCache();
    }).catch(() => {});
  }, [applyRootsFromCache]);

  const handleToggleItem = useCallback((pathKey: string) => {
    const hpoId = searchMode ? getHpoId(pathKey) : pathKey;
    if (disabledRef.current.has(hpoId)) return;
    const label = labelCacheRef.current.get(hpoId) ?? hpoId;
    onCheckItem?.(hpoId, !checkedKeys.includes(hpoId), label);
  }, [searchMode, checkedKeys, onCheckItem]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    const q = value.trim();

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const myId = ++requestIdRef.current;

    if (q.length >= MIN_SEARCH_LENGTH) {
      setLoading(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        HpoTreeApi.search(q, ctrl.signal).then((data) => {
          if (requestIdRef.current !== myId) return;
          Object.values(data.nodes).forEach((n) => labelCacheRef.current.set(n.id, n.label));
          const result = buildSearchTree(data, q, disabledRef.current);
          hpoIdToPathKeysRef.current = result.hpoIdToPathKeys;
          setMatchCount(data.match_count);
          setSearchMode(true);
          setTreeNodes(result.tree);
          setExpandedKeys(result.expanded);
          setLoading(false);
        }).catch(() => {});
      }, DEBOUNCE_MS);
    } else {
      applyRootsFromCache();
    }
  }, [applyRootsFromCache]);

  const onLoadData = useCallback((treeNode: any): Promise<void> =>
    new Promise((resolve, reject) => {
      HpoTreeApi.fetchChildren(treeNode.key as string).then((data) => {
        data.children.forEach((c) => labelCacheRef.current.set(c.id, c.label));
        setTreeNodes((prev) => {
          const insert = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((n) => {
              if (n.key === treeNode.key)
                return { ...n, children: data.children.map((c) => toTreeNode(c, disabledRef.current)) };
              if (n.children?.length)
                return { ...n, children: insert(n.children) };
              return n;
            });
          return insert(prev);
        });
        resolve();
      }).catch(reject);
    }), []);

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <div className={styles.header}>{formatCount(matchCount ?? totalCount)}</div>
      <div className={styles.searchWrapper}>
        <Input
          placeholder={intl.get('component.phenotypeTree.search.placeholder')}
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          allowClear
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value ?? '')}
        />
      </div>
      <div className={styles.body}>
        <Spin spinning={loading}>
          <Tree
            loadData={searchMode ? undefined : onLoadData}
            checkStrictly
            checkable
            checkedKeys={
              searchMode
                ? checkedKeys.flatMap((id) => hpoIdToPathKeysRef.current.get(id) ?? [])
                : checkedKeys
            }
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as string[])}
            onCheck={(_, { node }) => handleToggleItem(node.key.toString())}
            onSelect={(_, { node }) => handleToggleItem(node.key.toString())}
            treeData={treeNodes}
          />
        </Spin>
      </div>
    </div>
  );
};

export default PhenotypeTree;
