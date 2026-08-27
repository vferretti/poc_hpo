// INTEGRATION: Copy this file as-is to src/components/PhenotypeTree/fold.ts.
// It must stay the exact mirror of the server's `app/text.py` — the server matches
// on folded labels, so the client can only highlight what matched by folding the
// same way. If one side changes, the other has to follow.

const LIGATURES: Record<string, string> = {
  'œ': 'oe', 'Œ': 'OE',
  'æ': 'ae', 'Æ': 'AE',
  '’': "'", '‘': "'", '‛': "'", '´': "'",
};
const LIGATURES_RE = new RegExp(`[${Object.keys(LIGATURES).join('')}]`, 'g');

/**
 * Rend un texte comparable : sans accent, sans ligature, en minuscules.
 * NFKD sépare les diacritiques (que l'on supprime) et rabat les espaces
 * insécables sur l'espace ordinaire.
 */
export const fold = (text: string): string =>
  text
    .replace(LIGATURES_RE, (ch) => LIGATURES[ch])
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/**
 * `fold()`, plus la table qui ramène chaque position du texte replié à sa
 * position dans le texte d'origine — c'est elle qui permet de surligner
 * « Déficience » quand l'utilisateur a tapé « deficience ».
 *
 * Le repli est fait caractère par caractère : un caractère peut n'en produire
 * aucun (un diacritique isolé) ou plusieurs (`œ` → `oe`), auquel cas toutes les
 * positions produites pointent vers le caractère d'origine. `map` compte une
 * entrée de plus que `folded`, pour pouvoir borner la fin d'une correspondance.
 */
export const foldWithMap = (text: string): { folded: string; map: number[] } => {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const piece = fold(text[i]);
    for (let k = 0; k < piece.length; k++) {
      folded += piece[k];
      map.push(i);
    }
  }
  map.push(text.length);
  return { folded, map };
};
