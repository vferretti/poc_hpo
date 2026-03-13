// INTEGRATION: Copy this file as-is to src/components/PhenotypeTree/types.ts.

export type TreeNode = {
  title: string | React.ReactNode;
  key: string;
  children?: TreeNode[];
  disabled?: boolean;
  isLeaf: boolean;
};
