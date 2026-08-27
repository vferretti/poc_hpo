"""Normalisation du texte pour la recherche.

INTEGRATION: this module has no equivalent in clin/Radiant yet. The closest thing
is the `norm()` helper of the analysis combobox mockup
(radiant-maquette/prescription/create_case_radiant.html). Keep the two in sync, or
promote this one to a shared util when the HPO tree lands in the real frontend —
the frontend needs the exact same folding to highlight what the server matched
(see components/PhenotypeTree/fold.ts).

Why more than accents: the French HPO labels are not internally consistent.
Both spellings of the same word coexist in `hp-fr-amended.babelon.tsv`, so an
accent-only fold would still hide terms from whoever types the other spelling:

    œ  115 libellés   vs   oe  186 libellés
    æ    1 libellé    vs   ae   46 libellés
    ’  196 libellés   vs   '  2822 libellés
    espace insécable : 18 libellés

`fold()` is applied to BOTH sides of the comparison — the search indexes built at
startup and the incoming query — so it must stay cheap and total.
"""

from __future__ import annotations

import unicodedata

# Les ligatures n'ont pas de décomposition NFKD : il faut les épeler à la main.
# L'apostrophe typographique se rabat sur l'apostrophe droite, celle que l'on tape.
_TRANSLATIONS = str.maketrans({
    "œ": "oe", "Œ": "OE",
    "æ": "ae", "Æ": "AE",
    "’": "'", "‘": "'", "‛": "'", "´": "'",
})


def fold(text: str) -> str:
    """Rend *text* comparable : sans accent, sans ligature, en minuscules.

    NFKD sépare chaque lettre accentuée de son signe diacritique, que l'on
    supprime ensuite — et rabat au passage les espaces insécables sur l'espace
    ordinaire. Le repli se fait **caractère par caractère** (aucune séquence
    d'espaces n'est fusionnée) pour que le frontend puisse rejouer exactement le
    même calcul et retrouver, dans le libellé d'origine, la position de ce que le
    serveur a trouvé.

    >>> fold("Déficience intellectuelle")
    'deficience intellectuelle'
    >>> fold("Anomalie du cœur")
    'anomalie du coeur'
    """
    decomposed = unicodedata.normalize("NFKD", text.translate(_TRANSLATIONS))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()
