// INTEGRATION: This file is the POC equivalent of ClinicalSignsSelect.
// In clin, this logic lives in:
//   src/components/Prescription/components/ClinicalSignsSelect/index.tsx
//   src/components/Prescription/components/ClinicalSignsSelect/ObservedSignsList.tsx
//   src/components/Prescription/components/ClinicalSignsSelect/NotObservedSignsList.tsx
//
// Key changes for integration:
// - Replace local state with Ant Design Form + Form.List (as clin currently does)
// - Replace `suggestions` prop with `usePrescriptionFormConfig().clinical_signs.default_list`
// - Replace `intl.get('...')` calls with react-intl-universal
// - Replace `onOpenObservedModal` / `onOpenNotObservedModal` with local modal state
// - The "Parcourir l'arbre HPO" button replaces the current PhenotypeSearch autocomplete
//   (keep PhenotypeSearch as a secondary inline option if desired)

import { useState } from 'react';
import {
  CloseOutlined,
  DownOutlined,
  PlusOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { Button, Checkbox, Divider, Input, Select, Space, Typography } from 'antd';

// INTEGRATION: Replace with `import intl from 'react-intl-universal';`
import { intl } from '../PhenotypeTree/intl';

import type { HpoSuggestion, SelectedHpo } from '../../App';

import styles from './index.module.css';

const { Text } = Typography;

const COLLAPSED_LIMIT = 5;

interface OwnProps {
  observedSigns: SelectedHpo[];
  notObservedSigns: SelectedHpo[];
  suggestions: HpoSuggestion[];
  ageOptions: { value: string; name: string }[];
  onOpenObservedModal: () => void;
  onOpenNotObservedModal: () => void;
  onRemoveObserved: (code: string) => void;
  onRemoveNotObserved: (code: string) => void;
  onAgeChange: (code: string, ageCode: string) => void;
  onToggleSuggestion: (suggestion: HpoSuggestion, checked: boolean) => void;
  comment: string;
  onCommentChange: (value: string) => void;
}

const Landing = ({
  observedSigns,
  notObservedSigns,
  suggestions,
  ageOptions,
  onOpenObservedModal,
  onOpenNotObservedModal,
  onRemoveObserved,
  onRemoveNotObserved,
  onAgeChange,
  onToggleSuggestion,
  comment,
  onCommentChange,
}: OwnProps) => {
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);

  const observedCodes = new Set(observedSigns.map((h) => h.code));
  const allDisabledCodes = new Set(notObservedSigns.map((h) => h.code));

  const shouldCollapse = suggestions.length > COLLAPSED_LIMIT + 2;
  const visibleSuggestions =
    shouldCollapse && !suggestionsExpanded
      ? suggestions.slice(0, COLLAPSED_LIMIT)
      : suggestions;
  const hiddenCount = suggestions.length - COLLAPSED_LIMIT;
  return (
    <div className={styles.page}>
      <Typography.Title level={4} className={styles.title}>{intl.get('prescription.clinical.signs.title')}</Typography.Title>

      {/* ── Observed signs ── */}
      <div className={styles.section}>
        <Space size={2}>
          {/* INTEGRATION: Use <ProLabel requiredMark title={intl.get('prescription.clinical.signs.observed.label')} /> */}
          <Text strong>* {intl.get('prescription.clinical.signs.observed.label')}</Text>
        </Space>

        <Button
          type="link"
          className={styles.addBtn}
          onClick={onOpenObservedModal}
          icon={<PlusOutlined />}
          data-cy="OpenObservedHpoTreeModal"
        >
          {intl.get('prescription.clinical.signs.browse.hpo')}
        </Button>

        {/* Selected signs (from tree + checked suggestions) */}
        {observedSigns.length > 0 && (
          <>
            <Divider className={styles.divider} orientation="left" plain>
              {intl.get('prescription.clinical.signs.selected')} ({observedSigns.length})
            </Divider>
            <div className={styles.columnHeaders}>
              <Text type="secondary" className={styles.columnLabel}>{intl.get('prescription.clinical.signs.column.sign')}</Text>
              <Text type="secondary" className={styles.columnLabel}>{intl.get('prescription.clinical.signs.column.onset.age')}</Text>
            </div>
            {observedSigns.map((hpo) => (
              <div key={hpo.code} className={styles.signRow}>
                <Input className={styles.signInput} readOnly value={`${hpo.name} (${hpo.code})`} />
                {/* INTEGRATION: Use formConfig.clinical_signs.onset_age for options */}
                <Select
                  className={styles.ageSelect}
                  value={hpo.age_code}
                  onChange={(value) => onAgeChange(hpo.code, value)}
                  data-cy="SelectAge"
                >
                  {ageOptions.map((age) => (
                    <Select.Option key={age.value} value={age.value}>
                      {age.name}
                    </Select.Option>
                  ))}
                </Select>
                <CloseOutlined
                  className={styles.removeIcon}
                  onClick={() => onRemoveObserved(hpo.code)}
                />
              </div>
            ))}
          </>
        )}

        {/* Suggestions for this analysis */}
        {/* INTEGRATION: `suggestions` comes from usePrescriptionFormConfig().clinical_signs.default_list */}
        {suggestions.length > 0 && (
          <>
            <Divider className={styles.divider} orientation="left" plain>
              {intl.get('prescription.clinical.signs.suggestions')}
            </Divider>
            {visibleSuggestions.map((s) => {
              const isChecked = observedCodes.has(s.code);
              const isDisabled = allDisabledCodes.has(s.code);
              return (
                <div key={s.code} className={styles.suggestionRow}>
                  <Checkbox
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={(e) => onToggleSuggestion(s, e.target.checked)}
                    data-cy={`Suggested${s.code}`}
                  >
                    <Text>
                      {s.name} <Text type="secondary">({s.code})</Text>
                    </Text>
                  </Checkbox>
                </div>
              );
            })}
            {shouldCollapse && (
              <Button
                type="link"
                size="small"
                className={styles.expandBtn}
                onClick={() => setSuggestionsExpanded(!suggestionsExpanded)}
                icon={suggestionsExpanded ? <UpOutlined /> : <DownOutlined />}
              >
                {suggestionsExpanded
                  ? intl.get('prescription.clinical.signs.suggestions.collapse')
                  : intl.get('prescription.clinical.signs.suggestions.expand').replace('{count}', String(hiddenCount))}
              </Button>
            )}
          </>
        )}
      </div>

      {/* ── Not-observed signs ── */}
      <div className={styles.section}>
        <Space size={2}>
          {/* INTEGRATION: Use <ProLabel title={intl.get('prescription.clinical.signs.not.observed.label')} /> */}
          <Text strong>
            {intl.get('prescription.clinical.signs.not.observed.label')}
          </Text>
          <Text type="secondary">{intl.get('prescription.clinical.signs.not.observed.optional')}</Text>
        </Space>

        {notObservedSigns.map((hpo) => (
          <div key={hpo.code} className={styles.signRow}>
            <Input className={styles.signInput} readOnly value={`${hpo.name} (${hpo.code})`} />
            <CloseOutlined
              className={styles.removeIcon}
              onClick={() => onRemoveNotObserved(hpo.code)}
            />
          </div>
        ))}

        <Button
          type="link"
          className={styles.addBtn}
          onClick={onOpenNotObservedModal}
          icon={<PlusOutlined />}
          data-cy="OpenNotObservedHpoTreeModal"
        >
          {intl.get('prescription.clinical.signs.browse.hpo')}
        </Button>
      </div>

      {/* ── Comment ── */}
      <div className={styles.section}>
        {/* INTEGRATION: Use <ProLabel title={intl.get('prescription.clinical.signs.comment')} colon /> */}
        <Text strong>{intl.get('prescription.clinical.signs.comment')} :</Text>
        <Input.TextArea
          className={styles.commentArea}
          rows={3}
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
        />
      </div>
    </div>
  );
};

export default Landing;
