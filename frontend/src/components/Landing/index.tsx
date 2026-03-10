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
  DownOutlined,
  PlusOutlined,
  SearchOutlined,
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
  onApplyAgeToAll: (ageCode: string) => void;
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
  onApplyAgeToAll,
  onToggleSuggestion,
  comment,
  onCommentChange,
}: OwnProps) => {
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [lastAgeChangeCode, setLastAgeChangeCode] = useState<string | null>(null);

  const observedCodes = new Set(observedSigns.map((h) => h.code));
  const allDisabledCodes = new Set(notObservedSigns.map((h) => h.code));

  const browserSigns = observedSigns.filter((h) => h.source === 'browser');

  const handleAgeChange = (code: string, ageCode: string) => {
    onAgeChange(code, ageCode);
    setLastAgeChangeCode(observedSigns.length > 1 ? code : null);
  };

  const handleApplyToAll = (ageCode: string) => {
    onApplyAgeToAll(ageCode);
    setLastAgeChangeCode(null);
  };

  const renderAgeSelect = (hpo: SelectedHpo) => (
    <span className={styles.ageGroup}>
      <Select
        className={styles.ageSelectInline}
        size="small"
        value={hpo.age_code}
        onChange={(value) => handleAgeChange(hpo.code, value)}
        data-cy="SelectAge"
      >
        {ageOptions.map((age) => (
          <Select.Option key={age.value} value={age.value}>
            {age.name}
          </Select.Option>
        ))}
      </Select>
      {lastAgeChangeCode === hpo.code && (
        <Button
          type="link"
          size="small"
          className={styles.applyAllBtn}
          onClick={() => handleApplyToAll(hpo.age_code)}
        >
          {intl.get('prescription.clinical.signs.age.apply.all')}
        </Button>
      )}
    </span>
  );

  const checkedSuggestions = suggestions.filter((s) => observedCodes.has(s.code));
  const uncheckedSuggestions = suggestions.filter((s) => !observedCodes.has(s.code));
  const sortedSuggestions = [...checkedSuggestions, ...uncheckedSuggestions];

  const shouldCollapse = sortedSuggestions.length > COLLAPSED_LIMIT + 2;
  const visibleSuggestions =
    shouldCollapse && !suggestionsExpanded
      ? sortedSuggestions.slice(0, Math.max(COLLAPSED_LIMIT, checkedSuggestions.length))
      : sortedSuggestions;
  const hiddenCount = sortedSuggestions.length - visibleSuggestions.length;

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
          type="primary"
          className={styles.browseBtn}
          onClick={onOpenObservedModal}
          icon={<SearchOutlined />}
          data-cy="OpenObservedHpoTreeModal"
        >
          {intl.get('prescription.clinical.signs.browse.hpo')}
        </Button>

        {/* Items selected from the HPO browser — displayed as checked items */}
        {browserSigns.length > 0 && (
          <>
            <Divider className={styles.divider} orientation="left" plain>
              {intl.get('prescription.clinical.signs.from.browser')} ({browserSigns.length})
            </Divider>
            {browserSigns.map((hpo) => (
              <div key={hpo.code} className={`${styles.suggestionRow} ${styles.suggestionRowChecked}`}>
                <Checkbox
                  checked
                  onChange={() => onRemoveObserved(hpo.code)}
                >
                  <Text>
                    {hpo.name} <Text type="secondary">({hpo.code})</Text>
                  </Text>
                </Checkbox>
                {renderAgeSelect(hpo)}
              </div>
            ))}
          </>
        )}

        {/* Suggestions for this analysis — inline with age selector */}
        {/* INTEGRATION: `suggestions` comes from usePrescriptionFormConfig().clinical_signs.default_list */}
        {suggestions.length > 0 && (
          <>
            <Divider className={styles.divider} orientation="left" plain>
              {intl.get('prescription.clinical.signs.suggestions')}
            </Divider>
            {visibleSuggestions.map((s) => {
              const isChecked = observedCodes.has(s.code);
              const isDisabled = allDisabledCodes.has(s.code);
              const hpo = isChecked ? observedSigns.find((h) => h.code === s.code) : null;
              return (
                <div key={s.code} className={`${styles.suggestionRow} ${isChecked ? styles.suggestionRowChecked : ''}`}>
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
                  {isChecked && hpo && renderAgeSelect(hpo)}
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
        {notObservedSigns.length > 0 && (
          <Divider className={styles.divider} orientation="left" plain>
            {intl.get('prescription.clinical.signs.not.observed.section')} ({notObservedSigns.length})
          </Divider>
        )}

        <div className={styles.notObservedRow}>
          <Button
            className={styles.notObservedBtn}
            onClick={onOpenNotObservedModal}
            icon={<PlusOutlined />}
            data-cy="OpenNotObservedHpoTreeModal"
          >
            {intl.get('prescription.clinical.signs.not.observed.btn')}
          </Button>
          <Text type="secondary">{intl.get('prescription.clinical.signs.not.observed.optional')}</Text>
        </div>

        {notObservedSigns.length > 0 && (
          <>
            {notObservedSigns.map((hpo) => (
              <div key={hpo.code} className={styles.suggestionRow}>
                <Checkbox
                  checked
                  onChange={() => onRemoveNotObserved(hpo.code)}
                >
                  <Text>
                    {hpo.name} <Text type="secondary">({hpo.code})</Text>
                  </Text>
                </Checkbox>
              </div>
            ))}
          </>
        )}
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
