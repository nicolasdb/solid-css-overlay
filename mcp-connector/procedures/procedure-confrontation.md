# Procédure de confrontation (v3)

Exécutée par l'agent commun d'un collectif, avec **son** connecteur et lui
seul pour écrire. Elle se lance après `procedure-pull.md`, qui produit les
instantanés à confronter. En session claude.ai aujourd'hui ; quand Hermes
prendra le relais, ce texte deviendra son instruction de routine.

Changements depuis la v2 : plus aucune adresse de collectif écrite en dur.
La même procédure sert à tout collectif ; les adresses se lisent dans son
`config.ttl`.

Changements de la v2 : chaque confrontation écrit aussi une **fiche
Turtle** à côté de son compte-rendu, et la procédure se termine en chargeant
les fiches dans le graphe du collectif (`graph_ingest`). La fiche est ce que
le graphe connaît d'un document : de quoi il parle, sur quoi il s'appuie, ce
que la confrontation en a dit. Le compte-rendu reste la trace lisible ; la
fiche, c'est le catalogue (ADR 001 : le fichier brut, plus une fiche qui le
décrit).

Changements de la v1 : on confronte des instantanés, plus des fichiers posés
à plat ; l'auteur vient de `provenance.ttl`, plus de l'en-tête du document ;
une nouvelle version d'un document est confrontée en sachant ce qui a changé.

---

## 0. Résoudre le collectif

Lis le `config.ttl` du collectif. Le dossier qui le contient est la racine
du pod du collectif (`<pod-collectif>/`). Le sujet `a hs:Collective` est son
IRI (`<collectif>`) ; `hs:agent` est l'agent commun (`<agent-commun>`) ;
`hs:roster` est la liste des membres.

**Vérifie que tu es bien `<agent-commun>`** (le WebID de ton connecteur).
Sinon, arrête-toi : cette procédure n'est pas pour toi, c'est
`procedure-contribution.md` qui s'applique.

Dans la suite, `<pod-collectif>`, `<collectif>` et `<agent-commun>`
désignent ces valeurs. Le préfixe `hs:`
(`https://pod.nicolasdb.eu/hyperscope/vocab#`) est le vocabulaire commun
provisoire, le même pour tous les collectifs : on ne le remplace pas.

## Étapes

1. Lis `principles/cultivate.md`, le roster et `confrontations/sujets.ttl`
   (les sujets déjà connus du collectif ; s'il n'existe pas, crée-le d'après
   l'annexe B). Le roster ne contient que qui est membre (`foaf:member`) et
   son nom court (`foaf:nick`) : les noms et les agents se lisent dans le
   profil de chaque membre. Un `foaf:nick` sans `foaf:member` correspondant
   n'est pas un membre.

2. **Trouve ce qui attend une confrontation.** Un instantané est un dossier
   `depots/<membre>/<fichier-slug>/<horodatage>/`. Il est « en attente » si
   les deux conditions sont réunies :
   - il contient un `provenance.ttl`. Sans lui, l'instantané est interrompu :
     on le signale, on n'y touche pas ;
   - il n'existe pas encore de `confrontations/<membre>/<fichier-slug>/<horodatage>.md`.
     Le chemin de la confrontation reproduit celui de l'instantané. C'est ce
     qui permet de voir ce qui est en attente sans relire chaque compte-rendu.

   **Une confrontation v1 sans fiche** (un `.md` sans le `.ttl` à côté) :
   écris seulement la fiche, d'après le compte-rendu et le document, sans
   réécrire le compte-rendu. C'est le rattrapage des confrontations écrites
   avant la v2.

   Un collectif peut avoir des cas hérités propres à son histoire : ils sont
   décrits dans une annexe de sa propre copie, sur son pod.

3. **Pour chaque instantané en attente :**
   - lis son `provenance.ttl`, pour connaître la source, l'auteur
     (`prov:wasAttributedTo`) et la date ;
   - retrouve le nom de l'auteur : son WebID doit être membre dans le
     roster, et son nom est le `foaf:name` de **son profil**. On écrit
     « Xavier », pas son identifiant de pod. Si le WebID est un agent, il
     est rattaché au membre listé dont le profil le déclare (`acl:delegates`) :
     l'auteur est ce membre. Si le WebID n'est pas membre, ou si son profil est
     illisible, écris le WebID et signale-le ;
   - lis le document : le fichier que désigne `hs:fichier` dans
     `provenance.ttl` (un IRI relatif au dossier ; sur quelques instantanés
     anciens, un littéral qui donne son nom dans le même dossier) ;
   - **si un instantané plus ancien du même fichier existe** (un autre
     horodatage dans le même `<fichier-slug>/`), lis aussi sa confrontation.
     Confronte alors surtout ce qui a changé : une tension résolue, une
     nouvelle tension, une opportunité apparue.

   Confronter, ce n'est pas vérifier une checklist : cherche les tensions
   réelles et les opportunités, au regard des principes du collectif.

   Le résultat 🟩/🟧/🟥 est un **signal stigmergique** sur le document, jamais
   un jugement sur la personne. Sa répétition sur un même sujet en dit
   l'importance et pèse sur la façon de le transmettre ; elle ne mène à
   aucune sanction.

4. **Écris toujours le compte-rendu**
   `confrontations/<membre>/<fichier-slug>/<horodatage>.md`
   avec `contentType: text/markdown`. Sans ce paramètre, l'outil écrit du
   `text/turtle`.

       ---
       instantane: <URL du dossier de l'instantané>
       source: <prov:wasDerivedFrom, l'URL chez le membre>
       auteur: <foaf:name du profil> (<WebID>)
       date-depot: <prov:generatedAtTime>
       date: AAAA-MM-JJ
       agent: <agent-commun>
       version-precedente: <URL de la confrontation précédente, ou "aucune">
       resultat: 🟩 | 🟧 | 🟥
       principes: [lettres concernées, ex. U, T]
       sujets: [libellés de sujets.ttl]
       ---

       ## Lecture
       ## Ce qui a changé (seulement s'il y a une version précédente)
       ## Tensions ou opportunités
       ## Chantier suggéré (si 🟧/🟥)

   Une confrontation déjà écrite ne se réécrit pas. Si l'outil indique qu'il
   a remplacé un contenu existant, arrête-toi et signale-le.

5. **Choisis ses sujets** (2 à 5) dans `confrontations/sujets.ttl`.
   **Réutilise un sujet existant** dès qu'il convient, même si le document le
   dit autrement : c'est parce que deux documents partagent le même sujet que
   le graphe peut les rapprocher. Un libellé proche d'un sujet existant
   (pluriel, synonyme, autre langue) n'est pas un nouveau sujet : ajoute-le
   plutôt en `skos:altLabel` du sujet existant. On ne crée un sujet que si
   aucun ne convient, en l'**ajoutant** à la fin de `sujets.ttl` avec
   `solid_append_resource` (modèle en annexe B), jamais en réécrivant le
   fichier.

6. **Écris la fiche**
   `confrontations/<membre>/<fichier-slug>/<horodatage>.ttl`, avec
   `contentType: text/turtle`, d'après l'annexe A. Elle suit le compte-rendu
   (étape 4) et ne se réécrit pas non plus. On y met :
   - **le résumé** (`dcterms:abstract`) : trois à cinq phrases qui disent ce
     que le document apporte, dans la langue du document. C'est ce qu'un
     autre agent lira avant de décider d'ouvrir le document : il doit
     suffire à juger si c'est pertinent ;
   - **ce sur quoi il s'appuie** (`prov:wasDerivedFrom`) : les documents du
     collectif qu'il cite. Si le document a un champ `s-appuie-sur:` en tête
     (la procédure de contribution le demande), reprends ces adresses telles
     quelles. Sinon, n'ajoute un lien que si le document désigne
     explicitement un dépôt du collectif. Ne devine pas une filiation ;
   - **ce qu'il cite d'autre** (`dcterms:references`) : les adresses
     extérieures qu'il donne (sites, articles, pods). Seulement des adresses
     présentes dans le texte ;
   - **le résultat et les tensions** : une phrase par tension
     (`hs:tension`), la même que dans le compte-rendu.

   Si un champ n'a rien à dire, on l'omet : pas de valeur inventée pour
   remplir le modèle.

7. **Si 🟩** et que le dépôt concerne un chantier existant : ajoute un lien vers
   l'instantané (pas vers la source chez le membre) dans
   `chantiers/<chantier>/index.md`. C'est un ajout, jamais une réécriture.

8. **Charge le graphe**, une fois toutes les confrontations écrites :
   `graph_ingest` avec `collective` = `<collectif>` et
   `url` = `<pod-collectif>/depots/`, puis la même chose pour
   `<pod-collectif>/confrontations/`. Chaque fiche remplace son propre
   graphe : recharger ce qui l'était déjà ne duplique rien. Une fiche
   refusée (Turtle invalide) est listée dans la réponse : si elle vient de
   cette session, corrige-la en la réécrivant (c'est la seule réécriture
   permise : elle n'a encore été lue par personne) ; sinon, signale-la.

   Puis vérifie avec `graph_query` que chaque document confronté dans cette
   session y figure :

       PREFIX dcterms: <http://purl.org/dc/terms/>
       SELECT ?doc ?titre ?d WHERE { ?doc dcterms:title ?titre ; dcterms:created ?d }
       ORDER BY DESC(?d)

9. **Ne modifie ni ne supprime JAMAIS** un fichier de `depots/`, y compris
   `depots/sources.ttl`. Seule la procédure de pull y écrit.

10. **Termine par un résumé :**
    - instantanés confrontés, avec l'auteur, le résultat et les sujets de
      chacun ;
    - nouveaux sujets créés (on doit pouvoir les relire : trop de sujets
      neufs, c'est un signe que la réutilisation ne se fait pas) ;
    - nouvelles versions : tension résolue ou apparue par rapport à la
      version précédente ;
    - instantanés interrompus, et auteurs absents du roster ;
    - ce que `graph_ingest` a chargé et refusé ;
    - signaux 🟧/🟥 ouverts, qu'une personne doit regarder.

## Annexe A — modèle de la fiche

`confrontations/<membre>/<fichier-slug>/<horodatage>.ttl`. Les adresses du
document, de l'instantané et de l'auteur sont **absolues** : la fiche parle
d'un fichier qui est dans `depots/`, pas à côté d'elle. Remplace
`<POD-COLLECTIF>` et `<AGENT-COMMUN>` par les valeurs résolues à l'étape 0.

```turtle
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix prov:    <http://www.w3.org/ns/prov#> .
@prefix foaf:    <http://xmlns.com/foaf/0.1/> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .
@prefix hs:      <https://pod.nicolasdb.eu/hyperscope/vocab#> .
@prefix sujet:   <POD-COLLECTIF/confrontations/sujets.ttl#> .

# La confrontation : ce que l'agent commun en a dit.
<#confrontation> a hs:Confrontation ;
    hs:confronte          <URL-DU-DOCUMENT-DANS-L-INSTANTANE> ;
    hs:instantane         <URL-DU-DOSSIER-DE-L-INSTANTANE> ;
    hs:rapport            <HORODATAGE.md> ;                   # le compte-rendu, à côté
    hs:versionPrecedente  <URL-DE-LA-FICHE-PRECEDENTE> ;      # seulement s'il y en a une
    prov:wasAttributedTo  <AGENT-COMMUN> ;
    dcterms:created       "AAAA-MM-JJ"^^xsd:date ;
    hs:resultat           hs:Vert ;                           # hs:Vert | hs:Orange | hs:Rouge
    hs:principe           "U", "T" ;                          # seulement si 🟧/🟥
    hs:tension            "Une phrase par tension."@fr .      # seulement si 🟧/🟥

# Le document : ce qu'il est, de quoi il parle, sur quoi il s'appuie.
<URL-DU-DOCUMENT-DANS-L-INSTANTANE>
    dcterms:title         "Titre du document"@fr ;
    dcterms:isVersionOf   <URL-DU-DOSSIER-FICHIER-SLUG/> ;    # depots/<membre>/<fichier-slug>/ : le document, toutes versions
    dcterms:creator       <WEBID-DU-MEMBRE> ;                 # le membre, jamais son agent
    dcterms:created       "AAAA-MM-JJTHH:MM:SSZ"^^xsd:dateTime ;   # prov:generatedAtTime de l'instantané
    dcterms:abstract      "Trois à cinq phrases : ce que le document apporte."@fr ;
    dcterms:subject       sujet:gouvernance, sujet:stigmergie ;
    prov:wasDerivedFrom   <URL-D-UN-DOCUMENT-DANS-DEPOTS> ;   # s-appuie-sur
    dcterms:references    <https://exemple.org/article> .     # autres adresses citées

# Le nom de l'auteur tel que son profil le donnait ce jour-là (le graphe ne lit pas les profils).
<WEBID-DU-MEMBRE> foaf:name "Xavier" .
```

`dcterms:isVersionOf` relie les versions d'un même document : chaque
instantané de `depots/<membre>/<fichier-slug>/` a le même. Les fiches écrites
avant cette ligne ne l'ont pas ; on ne les réécrit pas, la procédure de
contribution donne une requête qui retrouve les versions par l'adresse.

`hs:Vert`, `hs:Orange`, `hs:Rouge` sont des IRI, pas les emoji : une requête
les compare sans ambiguïté. Le compte-rendu garde les emoji pour l'œil.

## Annexe B — `confrontations/sujets.ttl`

Les sujets du collectif, en SKOS. Créé une fois avec ce début (le nom du
collectif est son `foaf:name` dans `config.ttl`), puis on n'y fait
qu'**ajouter** (`solid_append_resource`) :

```turtle
@prefix skos:    <http://www.w3.org/2004/02/skos/core#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .

<> a skos:ConceptScheme ;
    skos:prefLabel "Sujets de <NOM-DU-COLLECTIF>"@fr .
```

Un sujet ajouté :

```turtle
<#gouvernance> a skos:Concept ;
    skos:inScheme  <> ;
    skos:prefLabel "gouvernance"@fr ;
    skos:altLabel  "governance"@en, "prise de décision"@fr ;
    skos:definition "Comment le collectif délibère, et qui porte quoi."@fr ;
    dcterms:created "2026-09-29"^^xsd:date .
```

- **Le fragment** (`#gouvernance`) : le libellé en minuscules, sans accents,
  avec des tirets. Il ne change plus une fois utilisé : les fiches le citent.
- **Un synonyme découvert plus tard** s'ajoute par un bloc qui ne contient
  que ce triple : `<#gouvernance> skos:altLabel "decision making"@en .`
- **Un sujet trop large** (qui finit par couvrir la moitié des documents) ou
  deux sujets qui se recouvrent : on ne les fusionne pas soi-même. On le
  signale dans le résumé ; c'est une proposition à délibérer entre
  personnes.

Le fichier est dans `confrontations/`, donc chargé dans le graphe avec les
fiches : les libellés et synonymes y sont interrogeables.
