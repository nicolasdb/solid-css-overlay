# Création d'un collectif — accompagnement (v1)

> Livré avec l'amorce `collectif` (v2), à côté de `SKILL.md`, et jamais lu
> sur un pod : aucun pod ne le porte avant que le collectif existe.

Pour l'agent qui accompagne la personne qui crée un collectif. Il
diagnostique l'état du pod et ne propose **qu'une étape suivante**, comme
`onboarding.md` pour un nouveau venu. Les invariants de `SKILL.md` valent
ici. **Tu n'écris rien sur le pod du collectif** pendant la création : ni
`config.ttl`, ni règle (`.acl`), ni dossier, ni fichier. La mise en place
demande Control, et `config.ttl` ne doit jamais être modifiable par l'agent
qu'il nomme. La personne fait chaque étape dans le backoffice, connectée
avec le compte du collectif ; toi, tu rédiges le brouillon de `config.ttl`
et tu vérifies ensuite, en lecture seule. Les libellés du backoffice sont
cités tels qu'il les affiche, en anglais.

Demande d'abord, sans les deviner : l'adresse du pod du collectif, telle
que le backoffice ou le serveur la donne (dossier ou sous-domaine : n'en
déduis rien), et le WebID du compte du collectif (affiché sur You).
`config.ttl` est à la racine de ce pod. Un espace créé par une app guidée
peut déjà avoir la moitié adhésion : la table commence alors à la moitié
pipeline.

## Constater sans écrire

- **Une liste de la racine**, un niveau : souvent lisible par tous
  (réglage par défaut de Community Solid Server), elle dit ce qui existe.
  C'est la seule liste hors de ce que `config.ttl` nomme.
- **401/403 ne veut pas dire absent** : un serveur refuse aussi un fichier
  qui n'existe pas à qui ne peut pas le lire. Absent de la liste de la
  racine : il n'existe pas. Présent et refusé : il existe et ne t'est pas
  ouvert. Ce qui ne se voit pas de dehors (une règle héritée, une liste
  refusée), la personne le lit dans Pods → l'élément → `···` → Who can
  access it.

## État et étape suivante

Lis chaque moitié dans l'ordre : la première ligne vraie donne la seule
étape à proposer. Après chaque étape, vérifie (dernière section).

### Moitié adhésion : assez pour inviter et accepter

| État constaté | Comment tu le constates | Étape suivante proposée |
|---|---|---|
| Pas de compte pour le collectif | la personne n'a pas d'adresse de pod à donner | Créer le compte chez le fournisseur, comme celui d'une personne, puis se connecter au backoffice avec lui. Le nom est définitif : il est dans l'IRI du collectif et dans le `org:memberOf` de chaque membre |
| Compte, pas d'inbox | le profil du compte n'a pas de `ldp:inbox` | You → « Create my inbox » |
| Pas de `config.ttl` | absent de la liste de la racine, ou 404 | Rédiger le brouillon (plus bas), le montrer en entier ; la personne le dépose à la racine (Pods → Upload) |
| `config.ttl` refusé | présent dans la liste, 401/403 en lecture | Pods → `config.ttl` → `···` → Who can access it → Anyone with the link → Save |
| `config.ttl` invalide | ne se lit pas comme du Turtle, ou une propriété requise manque ou se répète | Le brouillon corrigé, montré en entier ; la personne remplace le fichier et le garde public |
| Pas de `membres.ttl` | absent de la liste de la racine | Pods → Upload : `membres.ttl` tel que le gabarit du backoffice (`templates/collective/membres.ttl`, des commentaires et le préfixe) |
| `membres.ttl` trop ouvert | tu le lis (200) sans être ni membre ni `hs:agent` | Pods → `membres.ttl` → `···` → Who can access it → Only me → Save |
| `membres.ttl` sans règles à lui | la personne voit « Inherit from parent » | Who can access it → Only me → Save, même si rien ne semble changer : accepter une demande est refusé tant qu'il hérite |

### Moitié pipeline : facultative, pour un agent qui tire et confronte

| État constaté | Comment tu le constates | Étape suivante proposée |
|---|---|---|
| Pas d'agent | le document de `hs:agent` (son adresse sans `#me`) ne se lit pas, et You ne montre aucun agent (demande-le) | You → New agent, puis « Connect to AI » pour son connecteur. You affiche son adresse : `profile/<nom>#me` dans le pod du collectif |
| L'agent n'agit pas pour le collectif | le profil du compte ne déclare pas `acl:delegates` pour l'agent que You affiche | You → « May act for you » → Add (l'agent y est proposé). Créer l'agent ne le fait pas |
| `hs:agent` ne nomme pas cet agent | l'adresse que You affiche (la personne te la donne) diffère de `hs:agent` ; ou tu dois être l'agent commun et ton `webId` diffère | Le brouillon corrigé avec l'adresse de You ; la personne remplace `config.ttl` et le garde public |
| L'agent ne lit pas l'inbox | tu es l'agent commun et la liste de `ldp:inbox` est refusée | Lecture pour `hs:agent` sur `inbox/`, avec `acl:default` pour les messages : Pods → `inbox/` → `···` → Who can access it → Technical rules → Edit these rules (sur ordinateur). Lecture seulement |
| L'agent ne lit pas le roster | tu es l'agent commun et `hs:roster` est refusé | Pods → `membres.ttl` → `···` → Who can access it → Named people → Add a person by their WebID : `hs:agent`, Can read → Save |
| Pas de procédures | `hs:procedures` absent de `config.ttl`, ou `principles/` absent de la liste de la racine | Créer `principles/`, y déposer à plat les trois `procedure-*.md` du connecteur (`mcp-connector/procedures/`), puis les principes du collectif à côté ; `hs:procedures <principles/>` dans le brouillon |
| Pas de guide public | `hs:guide` absent de `config.ttl`, ou sa liste refusée | Déposer `templates/collective/guide/` du backoffice dans `guide/`, puis Who can access it → Anyone with the link → Save, sur le dossier entier |
| Un dossier partagé hérite encore | la personne voit « Inherit from parent » sur `principles/`, `chantiers/`, `briefs/`, puis `depots/` et `confrontations/` quand l'agent les a créés | Who can access it → Named people → ajouter `hs:agent` (Can edit là où ses procédures écrivent : `depots/`, `confrontations/`, `chantiers/` ; Can read ailleurs) → Save. Accepter un membre est refusé tant qu'un de ces dossiers hérite |

### Prêt à inviter

La moitié adhésion suffit pour inviter : le collectif apparaît dans
Collectives, et accepter une demande fonctionne ; avec la moitié pipeline,
l'agent commun tire et confronte dès qu'un membre partage. Puis, dans
l'ordre :

1. **L'adresse d'invitation** : la personne la copie dans Collectives → le
   collectif → « Invitation link ». Tu ne la composes pas.
2. **Facultatif** : elle l'ajoute à `config.ttl` en `schema:url` (le
   brouillon, avec ce qu'elle a copié ; fichier remplacé, gardé public),
   pour qu'un agent puisse la donner.
3. **Ensuite**, chaque nouveau venu suit `onboarding.md` (`hs:guide`) :
   l'accueil de `SKILL.md`, puis l'agent du membre.

## Le brouillon de `config.ttl`

Tu le remplis d'après ce que dit la personne, tu le montres en entier, elle
le dépose. Mêmes préfixes que le gabarit du backoffice
(`templates/collective/config.ttl`) ; `hs:` ne se remplace jamais.

```turtle
@prefix hs:     <https://pod.nicolasdb.eu/hyperscope/vocab#> .
@prefix foaf:   <http://xmlns.com/foaf/0.1/> .
@prefix ldp:    <http://www.w3.org/ns/ldp#> .
@prefix schema: <http://schema.org/> .

<#NOM> a hs:Collective, foaf:Group ;
    foaf:name "NOM-DU-COLLECTIF" ;
    hs:roster <membres.ttl> ;
    ldp:inbox <inbox/> ;
    hs:agent <profile/AGENT#me> ;
    hs:procedures <principles/> ;
    hs:guide <guide/> ;
    schema:slogan "TITRE-POUR-LES-NOUVEAUX-VENUS" ;
    schema:description "UN-PARAGRAPHE-SUR-CE-QUE-SIGNIFIE-ADHERER" ;
    schema:url <ADRESSE-D-INVITATION> ;
    hs:bundleFolder "output2/NOM/" .
```

- **`<#NOM>`** est l'IRI du collectif, et celle de son groupe : chaque
  membre l'écrit dans son `org:memberOf` (`…/config.ttl#NOM`). Elle ne
  change plus : NOM se choisit une fois, un mot court sans espace.
- **`hs:agent`** est obligatoire aujourd'hui, même pour la moitié adhésion
  seule : le backoffice et le connecteur refusent un `config.ttl` sans lui.
  C'est l'adresse que l'agent aura (`profile/AGENT#me`, AGENT étant le nom
  que la personne lui donnera) ; fait foi celle que You affiche une fois
  l'agent créé. D'ici là, un membre qui partage donne la lecture à une
  adresse qui ne répond pas, et aucun pull n'a lieu.
- **`hs:bundleFolder`**, obligatoire aussi : le dossier que le collectif
  suggère, relatif au pod de chaque membre. Chacun choisit le sien.
- **`hs:procedures`, `hs:guide`** : avec la moitié pipeline seulement.
  **`schema:slogan`, `schema:description`** : les mots de l'écran
  d'invitation. **`schema:url`** : copiée du backoffice une fois le
  collectif visible (« Prêt à inviter »). Retire une ligne qui n'a pas
  encore sa valeur.

## Vérifier de l'extérieur

Lecture seule. Chaque résultat est un statut à rapporter, pas un obstacle à
contourner.

| Ce que tu lis | Attendu | Sinon |
|---|---|---|
| `config.ttl` | 200, du Turtle, un seul sujet `a hs:Collective` ; `foaf:name`, `hs:roster`, `ldp:inbox`, `hs:agent`, `hs:bundleFolder` exactement une fois ; `schema:url`, `hs:procedures`, `hs:guide` au plus une fois | nomme ce qui manque ou se répète ; brouillon corrigé |
| `config.ttl`, sans compte | la personne l'ouvre dans une fenêtre privée : il s'affiche | pas public : ton 200 peut venir d'un droit qu'on t'a donné |
| `ldp:inbox` | le même dans `config.ttl` et dans le profil du compte | l'un des deux pointe ailleurs |
| `hs:roster` | refusé (401/403) si tu n'es ni membre ni `hs:agent` : c'est la bonne réponse ; 200 si tu es `hs:agent`, moitié pipeline faite | trop ouvert, ou l'agent sans lecture |
| le document de `hs:agent` | 200 | l'agent n'existe pas, ou `hs:agent` ne le nomme pas |
| `solid_whoami`, si tu dois être l'agent commun | `webId` égal à `hs:agent`, au caractère près | ce connecteur n'est pas l'agent nommé |
| le profil du compte, même cas | `acl:delegates` vers `hs:agent` | « May act for you » reste à faire |
| la liste de `hs:procedures` | les trois `procedure-*.md`, listés directement, pas dans un sous-dossier ; refusée si tu n'es ni membre ni agent | une procédure ailleurs n'en est pas une (`SKILL.md`, étape 6) |
| la liste de `hs:guide`, puis `onboarding.md` | lisibles sans être membre | le guide n'est pas public |

Ne teste jamais l'inbox en y postant : un message de test serait lu comme
une demande. Ne parcours pas le pod : la racine, puis ce que `config.ttl`
nomme.
