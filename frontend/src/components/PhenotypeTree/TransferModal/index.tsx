import { useEffect, useState } from 'react';

import { DeleteOutlined } from '@ant-design/icons';
// INTEGRATION: Replace `Empty` below with `import Empty from '@ferlab/ui/core/components/Empty';`
// and remove Empty from the antd import.
import { Button, Empty, List, Modal, Typography } from 'antd';

// INTEGRATION: Replace with `import intl from 'react-intl-universal';`
import { intl } from '../intl';

import PhenotypeTree, { AutoTranslateStats } from '..';

import styles from './index.module.css';

interface OwnProps {
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  onApply: (selectedNodes: { id: string; name: string }[]) => void;
  disabledKeys?: string[];
}

interface SelectedItem {
  id: string;
  name: string;
}

const formatCount = (n: number) => {
  const label =
    n > 1
      ? intl.get('component.phenotypeTree.count.plural')
      : intl.get('component.phenotypeTree.count.singular');
  return `${n} ${label}`;
};

const PhenotypeModal = ({
  visible = false,
  onApply,
  onVisibleChange,
  disabledKeys = [],
}: OwnProps) => {
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [isVisible, setIsVisible] = useState(visible);
  const [treeKey, setTreeKey] = useState(0);
  const [autoTranslateStats, setAutoTranslateStats] = useState<AutoTranslateStats | null>(null);

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
      setSelectedItems((prev) => [...prev, { id: key, name: label.replace(/ \*$/, '') }]);
    } else {
      setSelectedItems((prev) => prev.filter((item) => item.id !== key));
    }
  };

  const newSelections = selectedItems.filter((item) => !disabledKeys.includes(item.id));

  return (
    <Modal
      open={isVisible}
      title={intl.get('component.phenotypeTree.modal.title')}
      width="80vw"
      className={styles.modal}
      footer={
        <div className={styles.footer}>
          {autoTranslateStats && (
            <Typography.Text type="secondary" className={styles.autoTranslateNote}>
              {intl.get('component.phenotypeTree.modal.autoTranslateNote').replace('{autoCount}', String(autoTranslateStats.autoCount)).replace('{totalCount}', String(autoTranslateStats.totalCount))}
            </Typography.Text>
          )}
          <div className={styles.footerButtons}>
            <Button key="back" onClick={handleCancel}>
              {intl.get('component.phenotypeTree.modal.cancelText')}
            </Button>
            <Button
              key="apply"
              type="primary"
              onClick={handleApply}
              disabled={newSelections.length === 0}
            >
              {intl.get('component.phenotypeTree.modal.okText')}
            </Button>
          </div>
        </div>
      }
      onCancel={handleCancel}
    >
      <div className={styles.container}>
        <div className={styles.panelLeft}>
          <PhenotypeTree
            key={treeKey}
            onCheckItem={handleCheckItem}
            checkedKeys={checkedKeys}
            disabledKeys={disabledKeys}
            onAutoTranslateStats={setAutoTranslateStats}
          />
        </div>

        <div className={styles.panelRight}>
          <div className={styles.panelHeader}>{formatCount(newSelections.length)}</div>
          <div className={styles.panelBody}>
            {newSelections.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={intl.get('component.phenotypeTree.modal.emptySelection')}
                className={styles.emptyState}
              />
            ) : (
              <List
                size="small"
                dataSource={newSelections}
                renderItem={(item) => (
                  <List.Item key={item.id} className={styles.targetItem}>
                    <Typography.Text ellipsis style={{ flex: 1 }}>
                      {item.name} <span className={styles.hpoId}>({item.id})</span>
                    </Typography.Text>
                    <DeleteOutlined
                      className={styles.deleteIcon}
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
