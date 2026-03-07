import { useEffect, useState } from 'react';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, Empty, List, Modal, Typography } from 'antd';
import PhenotypeTree from './PhenotypeTree.tsx';

import './PhenotypeModal.css';

interface OwnProps {
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  onApply: (selectedNodes: { id: string; name: string }[]) => void;
  disabledKeys?: string[];
}

const formatCount = (n: number) => `${n} élément${n > 1 ? 's' : ''}`;

interface SelectedItem {
  id: string;
  name: string;
}

const PhenotypeModal = ({
  visible = false,
  onApply,
  onVisibleChange,
  disabledKeys = [],
}: OwnProps) => {
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [isVisible, setIsVisible] = useState(visible);
  const [treeKey, setTreeKey] = useState(0);

  const checkedKeys = selectedItems.map((item) => item.id);

  useEffect(() => {
    if (visible !== isVisible) {
      setIsVisible(visible);
      if (visible) {
        setTreeKey((k) => k + 1);
        setSelectedItems([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible !== isVisible) onVisibleChange && onVisibleChange(isVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const handleCancel = () => {
    setIsVisible(false);
    setSelectedItems([]);
  };

  const handleApply = () => {
    setIsVisible(false);
    const result = selectedItems.filter((item) => !disabledKeys.includes(item.id));
    onApply(result);
    setSelectedItems([]);
  };

  const handleCheckItem = (key: string, checked: boolean, label: string) => {
    if (disabledKeys.includes(key)) return;
    if (checked) {
      setSelectedItems((prev) => [...prev, { id: key, name: label }]);
    } else {
      setSelectedItems((prev) => prev.filter((item) => item.id !== key));
    }
  };

  const newSelections = selectedItems.filter((item) => !disabledKeys.includes(item.id));

  return (
    <Modal
      open={isVisible}
      title="Navigateur de phénotype observé (HPO)"
      width="80vw"
      className="phenotype-tree-modal"
      footer={[
        <Button key="back" onClick={handleCancel}>
          Annuler
        </Button>,
        <Button
          key="apply"
          type="primary"
          onClick={handleApply}
          disabled={newSelections.length === 0}
        >
          Appliquer
        </Button>,
      ]}
      onCancel={handleCancel}
    >
      <div className="hpo-transfer-container">
        {/* Left panel - Tree */}
        <div className="hpo-panel hpo-panel-left">
          <PhenotypeTree
            key={treeKey}
            onCheckItem={handleCheckItem}
            checkedKeys={checkedKeys}
            disabledKeys={disabledKeys}
          />
        </div>

        {/* Right panel - Selection */}
        <div className="hpo-panel hpo-panel-right">
          <div className="hpo-panel-header">{formatCount(newSelections.length)}</div>
          <div className="hpo-panel-body">
            {newSelections.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Sélectionnez des éléments dans le volet de gauche afin de les ajouter à votre requête."
                className="hpo-empty-state"
              />
            ) : (
              <List
                size="small"
                dataSource={newSelections}
                renderItem={(item) => (
                  <List.Item key={item.id} className="hpo-target-item">
                    <Typography.Text ellipsis style={{ flex: 1 }}>
                      {item.name} <span className="hpo-id">({item.id})</span>
                    </Typography.Text>
                    <DeleteOutlined
                      className="hpo-delete-icon"
                      onClick={() =>
                        setSelectedItems((prev) => prev.filter((s) => s.id !== item.id))
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PhenotypeModal;
