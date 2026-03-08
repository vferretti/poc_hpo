// INTEGRATION: Delete this file entirely.
// Replace all `import { intl } from './intl'` (or '../intl') with:
//   import intl from 'react-intl-universal';
// Then add the keys below to src/locales/fr.json and src/locales/en.json.

// --- Keys to add to fr.json ---
//
// PhenotypeTree + TransferModal:
// "component.phenotypeTree.modal.title": "Navigateur de phénotype (HPO)",
// "component.phenotypeTree.modal.cancelText": "Annuler",
// "component.phenotypeTree.modal.okText": "Appliquer",
// "component.phenotypeTree.modal.emptySelection": "Sélectionnez des éléments dans le volet de gauche afin de les ajouter à votre requête.",
// "component.phenotypeTree.search.placeholder": "Recherche par terme d'ontologie — min 3 caractères",
// "component.phenotypeTree.count.singular": "élément",
// "component.phenotypeTree.count.plural": "éléments",
//
// Landing (ClinicalSignsSelect):
// "prescription.clinical.signs.title": "Signes cliniques",
// "prescription.clinical.signs.observed.label": "Sélectionner au moins un signe clinique OBSERVÉ :",
// "prescription.clinical.signs.browse.hpo": "Parcourir l'arbre HPO",
// "prescription.clinical.signs.selected": "Signes sélectionnés",
// "prescription.clinical.signs.column.sign": "Signe clinique",
// "prescription.clinical.signs.column.onset.age": "Âge d'apparition",
// "prescription.clinical.signs.suggestions": "Suggestions pour cette analyse",
// "prescription.clinical.signs.suggestions.expand": "Afficher les {count} autres suggestions",
// "prescription.clinical.signs.suggestions.collapse": "Réduire",
// "prescription.clinical.signs.not.observed.label": "Ajouter les signes cliniques NON OBSERVÉS que vous jugez pertinents à l'analyse",
// "prescription.clinical.signs.not.observed.optional": "(facultatif) :",
// "prescription.clinical.signs.comment": "Commentaire clinique général",

const locale: Record<string, string> = {
  'component.phenotypeTree.modal.title': 'Navigateur de phénotype (HPO)',
  'component.phenotypeTree.modal.cancelText': 'Annuler',
  'component.phenotypeTree.modal.okText': 'Appliquer',
  'component.phenotypeTree.modal.emptySelection':
    'Sélectionnez des éléments dans le volet de gauche afin de les ajouter à votre requête.',
  'component.phenotypeTree.search.placeholder':
    "Recherche par terme d'ontologie — min 3 caractères",
  'component.phenotypeTree.count.singular': 'élément',
  'component.phenotypeTree.count.plural': 'éléments',

  // Landing (ClinicalSignsSelect)
  'prescription.clinical.signs.title': 'Signes cliniques',
  'prescription.clinical.signs.observed.label':
    'Sélectionner au moins un signe clinique OBSERVÉ :',
  'prescription.clinical.signs.browse.hpo': "Parcourir l'arbre HPO",
  'prescription.clinical.signs.selected': 'Signes sélectionnés',
  'prescription.clinical.signs.column.sign': 'Signe clinique',
  'prescription.clinical.signs.column.onset.age': "Âge d'apparition",
  'prescription.clinical.signs.suggestions': 'Suggestions pour cette analyse',
  'prescription.clinical.signs.suggestions.expand':
    'Afficher les {count} autres suggestions',
  'prescription.clinical.signs.suggestions.collapse': 'Réduire',
  'prescription.clinical.signs.not.observed.label':
    "Ajouter les signes cliniques NON OBSERVÉS que vous jugez pertinents à l'analyse",
  'prescription.clinical.signs.not.observed.optional': '(facultatif) :',
  'prescription.clinical.signs.comment': 'Commentaire clinique général',
};

export const intl = {
  get: (key: string): string => locale[key] ?? key,
};
