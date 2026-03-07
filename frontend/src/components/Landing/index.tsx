import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Input, Select, Space, Typography } from 'antd';
import type { SelectedHpo } from '../../App.tsx';

import './Landing.css';

interface OwnProps {
  selectedHpos: SelectedHpo[];
  ageOptions: { value: string; name: string }[];
  onOpenTree: () => void;
  onRemove: (code: string) => void;
  onAgeChange: (code: string, ageCode: string) => void;
}

const Landing = ({ selectedHpos, ageOptions, onOpenTree, onRemove, onAgeChange }: OwnProps) => (
  <div className="landing-page">
    <Typography.Title level={4}>Signes cliniques</Typography.Title>

    <Space direction="vertical" size={2} style={{ width: '100%' }}>
      <Typography.Text strong>Signes cliniques observés :</Typography.Text>

      {selectedHpos.map((hpo) => (
        <div key={hpo.code} className="hpo-sign-row">
          <Input
            className="hpo-sign-input"
            readOnly
            value={`${hpo.name} (${hpo.code})`}
          />
          <Select
            className="hpo-age-select"
            value={hpo.age_code}
            onChange={(value) => onAgeChange(hpo.code, value)}
          >
            {ageOptions.map((age) => (
              <Select.Option key={age.value} value={age.value}>
                {age.name}
              </Select.Option>
            ))}
          </Select>
          <CloseOutlined
            className="hpo-remove-icon"
            onClick={() => onRemove(hpo.code)}
          />
        </div>
      ))}

      <Button
        type="link"
        className="hpo-add-btn"
        onClick={onOpenTree}
        icon={<PlusOutlined />}
      >
        Parcourir l'arbre HPO pour ajouter un ou plusieurs signes cliniques observés
      </Button>
    </Space>
  </div>
);

export default Landing;
