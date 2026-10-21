# La mauvaise tombe — version pour les lecteurs

Fiction audio interactive : 25 chapitres, toutes les variantes et les quatre familles de fins. Ce dossier réunit l’interface de lecture, le moteur narratif, les textes, les voix, les ambiances et les bruitages.

## Mettre le récit en ligne

1. Déposer les fichiers et dossiers de cette version sur un hébergement web statique, en conservant leur arborescence.
2. Placer `index.html` à la racine du répertoire choisi. Les dossiers `audio/`, `data/`, `engine/` et `runtime/`, ainsi que les fichiers `reader.js`, `reader-model.js` et `reader.css`, doivent rester à côté.
3. Ouvrir l’adresse de ce répertoire en HTTPS, puis la transmettre aux lecteurs.

Exemple : pour un dépôt dans le répertoire `la-mauvaise-tombe` de votre site, l’adresse de lecture sera `https://votre-site.fr/la-mauvaise-tombe/`.

Le site fonctionne aussi dans un sous-dossier. Aucun serveur Node, moteur Qwen ou base de données n’est nécessaire chez l’hébergeur. Il ne faut pas ouvrir `index.html` directement en mode fichier : le récit charge ses données depuis une adresse HTTP ou HTTPS.

Le fichier caché `.htaccess`, lorsqu’il est pris en charge par l’hébergement Apache, règle les types de fichiers, la compression des textes et le cache des sons. Sur un autre hébergement, vérifier au besoin ces types :

| Extension | Type MIME |
| --- | --- |
| `.html` | `text/html` |
| `.js` | `text/javascript` ou `application/javascript` |
| `.css` | `text/css` |
| `.json` | `application/json` |
| `.webm` | `audio/webm` |

## Écouter et choisir

- Toucher le bouton de démarrage pour commencer ou reprendre son écoute.
- Les passages s’enchaînent automatiquement jusqu’à une décision. Choisir alors une option écrite ou sa direction correspondante.
- Utiliser la pause, les commandes de retour et d’avance de 15 secondes ou la barre de progression pour se déplacer dans le passage.
- « Lire le passage » ouvre sa transcription et permet de poursuivre en lecture.
- « Garder mon parcours » télécharge un compte rendu local que le lecteur peut joindre à ses retours. Rien n’est envoyé automatiquement.
- Le bouton × permet de recommencer après confirmation.

Au clavier : les chiffres 1 à 3 sélectionnent les options affichées ; les flèches correspondent aux directions. Espace met en pause ou reprend lorsque le focus n’est pas sur une autre commande.

## Progression

La progression et les décisions sont conservées dans le navigateur utilisé. Elles ne sont pas synchronisées entre appareils. Effacer les données du site peut supprimer cette sauvegarde. Un navigateur qui bloque le stockage local peut empêcher la reprise après fermeture.

Aucun compte ni outil de suivi n’est ajouté à cette version.

## Fichiers audio

Les sons diffusés sont exclusivement en **Opus dans WebM** : voix mono à 24 kbit/s, ambiances et bruitages à 32–48 kbit/s. Un navigateur récent capable de lire ce format est nécessaire. Aucun fichier AAC de secours n’est inclus.

Les voix et les sons restent séparés ; le lecteur réalise le mixage pendant l’écoute. Seuls les fichiers nécessaires au parcours sont chargés, avec une légère anticipation des répliques suivantes. La compression est avec perte ; les fichiers originaux de production sont conservés dans le projet source.

## Tester localement

Dans le projet source sur Mac, le lanceur `Apercu-lecteurs.command`, placé à côté du dossier de diffusion, ouvre un aperçu local. Fermer son terminal ou faire Ctrl-C arrête cet aperçu.

Si vous disposez uniquement de ce dossier et de Python 3, ouvrir un terminal dans ce dossier et lancer :

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Ouvrir ensuite `http://127.0.0.1:8000/`. Faire Ctrl-C dans le terminal pour arrêter le serveur d’essai.

## En cas de problème pendant un test

Vérifier la connexion et recharger la page avec un navigateur à jour. Pour signaler un défaut d’écoute, noter le chapitre, le passage et les paroles concernées ; joindre si possible le fichier obtenu avec « Garder mon parcours ».
