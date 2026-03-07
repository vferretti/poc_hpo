import { useState } from 'react';
import Landing from './components/Landing';
import PhenotypeModal from './components/PhenotypeTree/PhenotypeModal.tsx';

export interface SelectedHpo {
  code: string;
  name: string;
  observed: boolean;
  age_code: string;
}

const AGE_OPTIONS = [
  { value: 'unknown', name: 'Inconnu' },
  { value: 'HP:0011460', name: 'Prénatal' },
  { value: 'HP:0003623', name: 'Néonatal' },
  { value: 'HP:0003593', name: 'Infantile' },
  { value: 'HP:0011463', name: 'Enfance' },
  { value: 'HP:0003621', name: 'Juvénile' },
  { value: 'HP:0003581', name: 'Adulte' },
];

const App = () => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedHpos, setSelectedHpos] = useState<SelectedHpo[]>([]);

  const handleApply = (hpos: { id: string; name: string }[]) => {
    setSelectedHpos((prev) => {
      const existingCodes = new Set(prev.map((h) => h.code));
      const newHpos: SelectedHpo[] = hpos
        .filter((h) => !existingCodes.has(h.id))
        .map((h) => ({
          code: h.id,
          name: h.name,
          observed: true,
          age_code: 'unknown',
        }));
      return [...prev, ...newHpos];
    });
    setModalVisible(false);
  };

  const handleRemove = (code: string) => {
    setSelectedHpos((prev) => prev.filter((h) => h.code !== code));
  };

  const handleAgeChange = (code: string, ageCode: string) => {
    setSelectedHpos((prev) =>
      prev.map((h) => (h.code === code ? { ...h, age_code: ageCode } : h)),
    );
  };

  return (
    <>
      <Landing
        selectedHpos={selectedHpos}
        ageOptions={AGE_OPTIONS}
        onOpenTree={() => setModalVisible(true)}
        onRemove={handleRemove}
        onAgeChange={handleAgeChange}
      />
      <PhenotypeModal
        visible={modalVisible}
        onVisibleChange={setModalVisible}
        onApply={handleApply}
        disabledKeys={selectedHpos.map((h) => h.code)}
      />
    </>
  );
};

export default App;
