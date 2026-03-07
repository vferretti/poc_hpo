export type TreeNode = {
  title: string;
  key: string;
  children?: TreeNode[];
  disabled?: boolean;
  isLeaf: boolean;
};
