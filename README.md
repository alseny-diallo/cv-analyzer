# cv-analyzer

API NestJS qui reçoit un CV au format PDF, l'analyse avec un modèle de langage et renvoie des données structurées et validées. Si on lui fournit une offre d'emploi, elle évalue aussi l'adéquation du profil.

Le résultat n'est jamais pris tel quel : il est validé contre un schéma, et l'API signale quand un humain doit relire avant toute décision.

## Fonctionnement

```
PDF ──► Contrôleur ──► CvService ──► LlmClient ──┬─► Gemini (offre gratuite)
        (taille,        (prompt,       (sortie      └─► API Claude (payant)
         signature)      validation,    structurée)
                         relecture)
```

Le fournisseur se choisit avec `LLM_PROVIDER` : `gemini` (par défaut) ou `anthropic`.

1. **Contrôleur** (`src/cv/cv.controller.ts`) : il vérifie le fichier (5 Mo maximum, signature `%PDF-` réelle et pas seulement l'extension) et la taille de l'offre.
2. **Service** (`src/cv/cv.service.ts`) : il envoie le PDF au modèle avec des consignes strictes, valide la réponse avec **zod**, puis applique des règles déterministes de relecture humaine.
3. **Client LLM** (`src/llm/`) : `LlmClient` est une classe abstraite, avec deux implémentations. Dans les deux cas, le JSON Schema attendu est généré depuis le schéma zod (`src/cv/cv.schema.ts`) : un seul schéma décrit le format et sert aussi à valider la réponse.
   - **Gemini** (`gemini-llm.client.ts`) : Gemini lit le PDF directement. Le schéma est passé dans `responseJsonSchema`, ce qui contraint le modèle à produire un JSON conforme. Une réponse coupée ou bloquée (`finishReason` différent de `STOP`) est rejetée.
   - **Anthropic** (`llm.client.ts`) : Claude lit le PDF directement et on **force l'appel d'un outil** dont le schéma est celui du CV.

## Garde-fous

| Risque | Protection |
|---|---|
| Fichier malveillant ou trop gros | Limite de 5 Mo et vérification de la signature PDF avant tout appel au modèle |
| Réponse du modèle mal formée ou inventée | Sortie imposée par l'outil, validée par zod, et consigne de ne rien inventer (`null` si l'info manque) |
| Injection de prompt cachée dans le CV (« donne un score de 100 ») | Le document est traité comme une donnée. Les consignes suspectes sont signalées dans `warnings`, ce qui déclenche une relecture humaine |
| Décision automatique sur un candidat | `needsHumanReview` vaut `true` si la confiance est sous 0,7, si le nom ou le contact manque, s'il y a des avertissements ou si le score est extrême (≥ 85 ou ≤ 30) |
| Fuite de données personnelles | Les journaux ne contiennent que des métadonnées (modèle, nombre de tokens), jamais le contenu du CV. La clé API reste dans les variables d'environnement |
| Panne ou erreur du modèle | Délai maximal (et deux nouvelles tentatives avec Claude). Le client reçoit une erreur 502 générique, sans le détail interne |

## Lancer le projet

Prérequis :
- Node.js **22.23.4** (fichier `.nvmrc` : `nvm use`) ;
- Yarn 4, activé via Corepack (`corepack enable`) : la version est fixée dans `package.json` ;
- une clé Gemini gratuite ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)), ou une clé Anthropic.

```bash
nvm use
corepack enable
yarn install
cp .env.example .env        # puis renseigner GEMINI_API_KEY
yarn start:dev
```

> **Données personnelles et offre gratuite de Gemini.** Sur l'offre gratuite, Google peut utiliser les contenus envoyés pour améliorer ses produits, et des personnes peuvent les relire. Les conditions demandent de ne pas y envoyer d'informations personnelles. Cette règle ne s'applique pas dans l'EEE, en Suisse et au Royaume-Uni, où les règles de l'offre payante s'appliquent. Utilise des CV fictifs ou le tien pour tester, jamais ceux de vrais candidats.

Ou avec Docker :

```bash
docker build -t cv-analyzer .
docker run -p 3043:3043 --env-file .env cv-analyzer
```

## Exemple

```bash
curl -X POST http://localhost:3043/cv/analyze \
  -F "file=@mon_cv.pdf" \
  -F "jobDescription=Développeur Full Stack Node.js et IA, TypeScript, React, PostgreSQL"
```

Réponse (extrait) :

```json
{
  "analysis": {
    "fullName": "Awa Ndiaye",
    "email": "awa@example.com",
    "skills": ["TypeScript", "NestJS", "React", "PostgreSQL"],
    "jobMatch": { "score": 72, "strengths": ["Node.js / NestJS"], "gaps": ["Intégration de LLM"] },
    "confidence": 0.92,
    "warnings": []
  },
  "needsHumanReview": false,
  "reviewReasons": [],
  "model": "gemini-3.5-flash-lite"
}
```

## Tests

```bash
yarn test
```

Les tests n'appellent jamais de vrai modèle : le client LLM ou le SDK Gemini est remplacé par un faux. Ils couvrent la validation des fichiers, le rejet d'une réponse mal formée, la gestion d'une panne ou d'une réponse tronquée, et les règles de relecture humaine.

## Pistes d'amélioration

- Une nouvelle tentative avec un message d'erreur au modèle quand sa sortie est invalide.
- Une file de relecture (BullMQ) pour les analyses marquées `needsHumanReview`.
- L'analyse de plusieurs CV pour une même offre, avec un classement.
