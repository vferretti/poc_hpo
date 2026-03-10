// INTEGRATION: This file is the POC demo harness. It simulates the data flow
// that in clin is handled by:
//   - Redux store (prescription slice) for form config
//   - Ant Design Form for form state
//   - ClinicalSignsSelect as the parent controller
//
// In clin, the `suggestions` (default_list) come from:
//   usePrescriptionFormConfig().clinical_signs.default_list
// fetched via GET /form/{analysis_code} (e.g., /form/MITN)
//
// The `ageOptions` come from:
//   usePrescriptionFormConfig().clinical_signs.onset_age
//
// The `disabledKeys` (mutual exclusion between observed/not-observed) are built from:
//   getExistingHpoIdList(form, getName)

import { useState } from 'react';

import Landing from './components/Landing';
import PhenotypeModal from './components/PhenotypeTree/TransferModal';

export interface SelectedHpo {
  code: string;
  name: string;
  observed: boolean;
  age_code: string;
  source: 'suggestion' | 'browser';
}

export interface HpoSuggestion {
  code: string;
  name: string;
}

// INTEGRATION: Replace with usePrescriptionFormConfig().clinical_signs.onset_age
const AGE_OPTIONS = [
  { value: 'unknown', name: 'Inconnu' },
  { value: 'HP:0030674', name: 'Anténatale' },
  { value: 'HP:0003577', name: 'Congénitale' },
  { value: 'HP:0003623', name: 'Néonatale (< 28 jours)' },
  { value: 'HP:0003593', name: 'Enfant en bas âge (>= 28 jours et < 1 an)' },
  { value: 'HP:0011463', name: 'Enfance (>= 1 an et < 5 ans)' },
  { value: 'HP:0003621', name: 'Juvénile (>= 5 ans et < 16 ans)' },
  { value: 'HP:0011462', name: 'Jeune adulte (>= 16 ans et < 40 ans)' },
  { value: 'HP:0003596', name: "Adulte d'âge moyen (>= 40 ans et < 60 ans)" },
  { value: 'HP:0003584', name: 'Adulte sénior (>= 60 ans)' },
];

// INTEGRATION: Replace with usePrescriptionFormConfig().clinical_signs.default_list
// mapped as: default_list.map(term => ({ code: term.value, name: term.name }))
const MOCK_SUGGESTIONS: HpoSuggestion[] = [
  { code: 'HP:0003128', name: 'Acidose lactique' },
  { code: 'HP:0001251', name: 'Ataxie' },
  { code: 'HP:0001638', name: 'Cardiomyopathie' },
  { code: 'HP:0001250', name: "Crise d'épilepsie" },
  { code: 'HP:0006965', name: 'Encéphalopathie nécrosante aiguë' },
  { code: 'HP:0006582', name: 'Épisodes de type syndrome de Reye' },
  { code: 'HP:0001290', name: 'Hypotonie généralisée' },
  { code: 'HP:0006554', name: 'Insuffisance hépatique aiguë' },
  { code: 'HP:0001138', name: 'Neuropathie optique' },
  { code: 'HP:0000590', name: 'Ophtalmoplégie externe progressive' },
  { code: 'HP:0000508', name: 'Ptose' },
  { code: 'HP:0001488', name: 'Ptose bilatérale' },
  { code: 'HP:0001263', name: 'Retard global de développement' },
];

const App = () => {
  const [observedSigns, setObservedSigns] = useState<SelectedHpo[]>([]);
  const [notObservedSigns, setNotObservedSigns] = useState<SelectedHpo[]>([]);
  const [comment, setComment] = useState('');
  const [observedModalVisible, setObservedModalVisible] = useState(false);
  const [notObservedModalVisible, setNotObservedModalVisible] = useState(false);

  const allCodes = [...observedSigns, ...notObservedSigns].map((h) => h.code);

  const handleApplyObserved = (hpos: { id: string; name: string }[]) => {
    setObservedSigns((prev) => {
      const existing = new Set(prev.map((h) => h.code));
      const added: SelectedHpo[] = hpos
        .filter((h) => !existing.has(h.id))
        .map((h) => ({ code: h.id, name: h.name, observed: true, age_code: 'unknown', source: 'browser' as const }));
      return [...prev, ...added];
    });
  };

  const handleApplyNotObserved = (hpos: { id: string; name: string }[]) => {
    setNotObservedSigns((prev) => {
      const existing = new Set(prev.map((h) => h.code));
      const added: SelectedHpo[] = hpos
        .filter((h) => !existing.has(h.id))
        .map((h) => ({ code: h.id, name: h.name, observed: false, age_code: '', source: 'browser' as const }));
      return [...prev, ...added];
    });
  };

  const handleToggleSuggestion = (suggestion: HpoSuggestion, checked: boolean) => {
    if (checked) {
      setObservedSigns((prev) => [
        ...prev,
        { code: suggestion.code, name: suggestion.name, observed: true, age_code: 'unknown', source: 'suggestion' as const },
      ]);
    } else {
      setObservedSigns((prev) => prev.filter((h) => h.code !== suggestion.code));
    }
  };

  return (
    <>
      <Landing
        observedSigns={observedSigns}
        notObservedSigns={notObservedSigns}
        suggestions={MOCK_SUGGESTIONS}
        ageOptions={AGE_OPTIONS}
        onOpenObservedModal={() => setObservedModalVisible(true)}
        onOpenNotObservedModal={() => setNotObservedModalVisible(true)}
        onRemoveObserved={(code) =>
          setObservedSigns((prev) => prev.filter((h) => h.code !== code))
        }
        onRemoveNotObserved={(code) =>
          setNotObservedSigns((prev) => prev.filter((h) => h.code !== code))
        }
        onAgeChange={(code, ageCode) =>
          setObservedSigns((prev) =>
            prev.map((h) => (h.code === code ? { ...h, age_code: ageCode } : h)),
          )
        }
        onApplyAgeToAll={(ageCode) =>
          setObservedSigns((prev) =>
            prev.map((h) => ({ ...h, age_code: ageCode })),
          )
        }
        onToggleSuggestion={handleToggleSuggestion}
        comment={comment}
        onCommentChange={setComment}
      />

      <PhenotypeModal
        visible={observedModalVisible}
        onVisibleChange={setObservedModalVisible}
        onApply={handleApplyObserved}
        disabledKeys={allCodes}
      />

      <PhenotypeModal
        visible={notObservedModalVisible}
        onVisibleChange={setNotObservedModalVisible}
        onApply={handleApplyNotObserved}
        disabledKeys={allCodes}
      />
    </>
  );
};

export default App;
