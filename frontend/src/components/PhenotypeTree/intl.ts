const locale: Record<string, string> = {
  'component.phenotypeTree.modal.title': 'Navigateur de phénotype observé (HPO)',
  'component.phenotypeTree.modal.cancelText': 'Annuler',
  'component.phenotypeTree.modal.okText': 'Appliquer',
  'component.phenotypeTree.modal.emptySelection':
    'Sélectionnez des éléments dans le volet de gauche afin de les ajouter à votre requête.',
  'component.phenotypeTree.search.placeholder':
    "Recherche par terme d'ontologie — min 3 caractères",
  'component.phenotypeTree.count.singular': 'élément',
  'component.phenotypeTree.count.plural': 'éléments',
};

export const intl = {
  get: (key: string): string => locale[key] ?? key,
};
