# Manuel d'utilisation — Registre

> Ce manuel décrit uniquement des fonctions **livrées et fonctionnelles**. Une
> fonction encore en construction n'y figure pas, même si elle est prévue —
> voir la feuille de route dans [`PRODUCT.md`](../PRODUCT.md) pour ce qui est
> planifié.

## Sommaire

1. [Créer votre compte et votre espace](#1-créer-votre-compte-et-votre-espace)
2. [Inviter des collègues](#2-inviter-des-collègues)
3. [Activer un modèle prêt à l'emploi](#3-activer-un-modèle-prêt-à-lemploi)
4. [Créer une fiche](#4-créer-une-fiche)
5. [Comprendre le champ Échéance et les alertes](#5-comprendre-le-champ-échéance-et-les-alertes)
6. [Gérer un stock](#6-gérer-un-stock)
7. [Rechercher, filtrer, exporter et importer](#7-rechercher-filtrer-exporter-et-importer)
8. [Le tableau de bord](#8-le-tableau-de-bord)
9. [Votre abonnement](#9-votre-abonnement)
10. [Travailler hors connexion](#10-travailler-hors-connexion)

---

## À propos de ce document

Registre est une plateforme dans laquelle votre entreprise déclare elle-même
ce qu'elle suit — véhicules, stocks, documents, personnel — et se fait
prévenir avant qu'une échéance n'expire ou qu'un stock ne s'épuise.

Ce manuel est écrit pour un utilisateur qui n'a jamais ouvert l'application :
chaque section part de l'écran, pas du code.

## 1. Créer votre compte et votre espace

Deux façons de créer votre compte :

- **Avec un compte Google** (recommandé) — cliquez sur « Continuer avec Google »,
  choisissez votre compte professionnel. Aucun mot de passe à retenir.
- **Avec une adresse e-mail** — si vous n'avez pas de compte Google, indiquez
  votre e-mail, votre nom, et choisissez un mot de passe.

Juste après, on vous demande trois informations pour créer l'espace de votre
entreprise :

- **Le nom de votre entreprise**.
- **Votre pays** — il détermine automatiquement la devise utilisée dans toute
  l'application (vous pourrez la changer plus tard dans les réglages).
- **Votre secteur d'activité** (facultatif pour l'instant).

Votre espace est créé immédiatement, avec un essai gratuit de 14 jours. Vous
en êtes l'administrateur.

## 2. Inviter des collègues

Un administrateur peut inviter une personne par son e-mail, en lui attribuant
un rôle (administrateur, gestionnaire, opérateur ou lecteur — voir la fiche
produit pour le détail de ce que chaque rôle peut faire).

- Si la personne a déjà un compte Google, elle rejoint l'organisation dès sa
  première connexion — sans créer de mot de passe.
- Sinon, elle peut créer un compte par e-mail et mot de passe avec l'adresse
  exacte à laquelle elle a été invitée.

_L'envoi automatique d'un e-mail d'invitation arrive avec une prochaine
livraison ; en attendant, communiquez l'invitation à la personne concernée
par un autre moyen._

## 3. Activer un modèle prêt à l'emploi

Plutôt que de partir d'une page blanche, activez un modèle déjà préparé :

- **Véhicule** — immatriculation, photos, marque, modèle, carburant, kilométrage,
  carte grise, visite technique, assurance, vignette, chauffeur affecté.
- **Personnel** — nom, poste, téléphone, pièce d'identité, fin de contrat, visite
  médicale, permis de conduire.
- **Extincteur** — numéro, emplacement, type, date de recharge, date de contrôle.
- **Contrat** — objet, partie contractante, document signé, dates de début et de
  fin, préavis.
- **Stock de gaz** — un article de démarrage (« Bouteille de gaz ») déjà
  décliné en quatre formats (6 kg, 12,5 kg, 25 kg, 50 kg), avec un seuil
  d'alerte par format et le suivi de consignation activé.
- **Vêtements** — un article de démarrage (« Chemise de service blanche »)
  décliné en quatre tailles (S, M, L, XL), avec un seuil d'alerte par taille.

Un clic sur « Activer » crée le modèle avec tous ses champs déjà en place. Il
devient ensuite entièrement à vous : ajoutez, retirez ou renommez des champs,
ou modifiez les articles de démarrage, sans que cela n'affecte les autres
organisations.

Modifier un champ existant ne change que ce que les utilisateurs voient
(libellé, visibilité, mise en avant dans la liste) : la donnée technique
(sa clé, son type) reste stable pour ne jamais casser les fiches déjà
remplies. Un champ utilisé comme titre des fiches ne peut pas être
supprimé tant qu'un autre champ n'a pas pris sa place comme titre.

## 4. Créer une fiche

Depuis un modèle activé, créez une fiche en renseignant ses champs. Les champs
marqués obligatoires doivent être remplis ; les champs uniques (comme
l'immatriculation) sont vérifiés automatiquement — deux véhicules ne peuvent
pas partager la même immatriculation dans la même organisation.

Chaque fiche peut aussi recevoir des **événements** datés — un entretien, une
réparation, un incident — avec un commentaire et un coût facultatif.

Les documents et photos téléversés sur une fiche (carte grise, justificatif
d'échéance, etc.) restent consultables depuis la fiche à tout moment par la
suite — le lien de téléchargement est renouvelé automatiquement à chaque
consultation, même longtemps après le téléversement initial.

## 5. Comprendre le champ Échéance et les alertes

Un champ Échéance (comme « Visite technique ») porte une date de fin de
validité et, si besoin, un justificatif scanné. Chaque nuit — ou à la demande
d'un administrateur tant que la planification automatique n'est pas encore
activée sur votre environnement — l'application vérifie toutes les échéances
et crée une alerte quand l'une d'elles approche : 60 jours avant, 30 jours
avant, 7 jours avant, le jour même, puis tous les 3 jours en cas de retard.

Les alertes apparaissent dans le centre de notifications (la cloche, en haut
de l'écran) et sur l'écran **Alertes**, qui en garde l'historique complet même
après acquittement. **Cliquez sur une alerte pour ouvrir directement la fiche
concernée** — inutile de la retrouver à la main. Une alerte de stock vous
amène à l'écran des dépôts.

Quand vous renouvelez une échéance (nouvelle date saisie), l'alerte en cours se
referme d'elle-même — vous n'avez rien à faire de plus.

## 6. Gérer un stock

Pour un modèle de nature « article de stock » (Stock de gaz, Vêtements, ou un
modèle que vous créez vous-même), chaque fiche est un article, décliné en
variantes (une taille, un format...). Ouvrez la fiche de l'article : un
panneau « Stock » y affiche la quantité disponible par dépôt et un bouton
« Nouveau mouvement » qui propose les quatre opérations ci-dessous, chacune
dans son propre onglet. Les dépôts eux-mêmes se créent et se renomment depuis
« Dépôts » dans la barre latérale.

Trois opérations couvrent l'usage quotidien :

- **Entrée** — une livraison arrive : indiquez la variante, le dépôt, la
  quantité et, si le suivi des lots est actif pour cet article, le numéro de
  lot et sa date de péremption.
- **Sortie** — une vente, une consommation : la quantité est retirée du dépôt
  choisi. Si l'article suit des lots, le plus proche de la péremption part en
  premier, automatiquement.
- **Transfert** — déplace une quantité d'un dépôt vers un autre.

Une erreur de saisie ne se corrige jamais en modifiant un mouvement passé —
un mouvement, une fois enregistré, ne change plus. On la corrige par un
**ajustement** : vous indiquez la quantité réellement comptée, l'écart est
calculé et enregistré avec le motif que vous donnez.

Quand la quantité disponible passe sous le seuil que vous avez fixé, une
alerte apparaît — puis un rappel chaque semaine tant que la situation dure.
Dès qu'un réapprovisionnement fait remonter le stock au-dessus du seuil,
l'alerte se referme d'elle-même. Le seuil se règle depuis le panneau Stock de
la fiche : un seuil global pour la variante, éventuellement remplacé par un
seuil différent pour tel ou tel dépôt (utile quand un dépôt tourne
naturellement avec moins de stock qu'un autre).

Pour un article **consigné** (le cas du gaz : la bouteille circule, seul le
contenu se vend), deux actions supplémentaires suivent les bouteilles chez
vos clients : « sortie pleine » (une bouteille pleine part chez un client) et
« retour vide » (le client rapporte une bouteille vide).

## 7. Rechercher, filtrer, exporter et importer

- **Recherche** — une seule barre cherche dans toutes vos fiches, sur les
  champs que vous avez marqués comme filtrables lors de la configuration du
  modèle.
- **Filtres** — sur la liste d'un modèle, combinez des filtres sur n'importe
  quel champ filtrable pour ne voir que ce qui vous intéresse.
- **Vues enregistrées** — un jeu de filtres et un tri que vous nommez et
  retrouvez en un clic la prochaine fois. Chaque vue vous appartient ; vos
  collègues ont les leurs.
- **Export** — le bouton **Exporter**, sur la liste d'un modèle, télécharge
  toutes ses fiches en un fichier CSV (ouvrable dans Excel ou tout tableur),
  avec les libellés de vos champs en en-tête. C'est un droit dont dispose
  **tous les rôles, y compris Lecteur**. L'export est plafonné à 10 000 lignes ;
  au-delà, l'application vous prévient avant de télécharger plutôt que de vous
  laisser découvrir un fichier incomplet. Il demande une connexion : hors
  ligne, le bouton est désactivé, car votre appareil ne contient que les fiches
  déjà consultées.
- **Import** — pour reprendre un fichier existant : déposez-le, l'application
  propose une correspondance entre les colonnes du fichier et les champs du
  modèle (vous pouvez l'ajuster), puis vous montre un aperçu qui indique
  précisément quelles lignes seraient rejetées et pourquoi, avant toute
  validation. Une fois validé, l'import crée ce qui est valide et vous
  signale le reste — vous ne perdez jamais 200 lignes correctes à cause de 3
  fautives. Le fichier peut être un classeur Excel (.xlsx) ou un CSV encodé en
  UTF-8. Pour un classeur, seule la **première feuille** est lue — le nom des
  autres vous est indiqué. Les dates s'écrivent AAAA-MM-JJ dans un CSV ; dans un
  classeur, une cellule mise en forme en date est reconnue telle quelle.

## 8. Le tableau de bord

C'est la page qui s'ouvre en arrivant sur l'application : elle répond à une
seule question, « qu'est-ce qui demande mon attention aujourd'hui ? ». Vous y
trouvez, dans cet ordre, les échéances en retard, celles des 30 prochains
jours, les articles sous seuil et les lots proches de la péremption, tous
modèles confondus — puis, en dessous, quelques compteurs généraux.

Cliquez sur un de ces quatre chiffres : la liste exacte qui le compose
s'ouvre, jamais juste un nombre sans rien derrière.

**Se concentrer sur un seul modèle** — en haut de la page, un bandeau propose
« Tout » puis chacun de vos modèles actifs. Cliquez sur « Véhicules » (par
exemple) : toute la page se recalcule pour ne montrer que ce qui concerne les
véhicules, avec des indicateurs différents de la vue globale — nombre de
fiches, répartition par statut, échéances, coût des interventions pour un
actif suivi ; quantité disponible, articles sous seuil, entrées/sorties pour
un article de stock. Une fois un modèle sélectionné, vous pouvez en plus
restreindre à un dépôt (stock) ou à un site (actifs), et à une période (7
jours, 30 jours, 90 jours, année en cours).

**Enregistrer et épingler** — un périmètre qui vous sert souvent (« Parc
Douala », « Gaz — dépôt Bonabéri ») se nomme et s'enregistre d'un clic ;
épinglez-le pour qu'il devienne votre page d'accueil personnelle la prochaine
fois que vous ouvrez l'application.

## 9. Votre abonnement

Votre essai gratuit dure 14 jours à partir de l'inscription. Depuis
« Abonnement » dans la barre latérale, un administrateur peut à tout moment :

- **Voir l'état de l'abonnement** — essai, actif, lecture seule, suspendu —
  et sa date d'échéance.
- **Déclarer un paiement** — après avoir réglé (Mobile Money, virement...) par
  les moyens indiqués par l'éditeur, cliquez sur « J'ai payé » et indiquez la
  référence de la transaction. L'éditeur vérifie et valide.
- **Consulter les factures** — chaque paiement validé génère une facture
  numérotée, consultable à tout moment.

Si l'abonnement expire sans renouvellement, l'espace passe en **lecture
seule** pendant 30 jours : vous consultez, filtrez et exportez toujours vos
données, mais ne pouvez plus rien saisir. Un règlement rouvre l'écriture
immédiatement, dans l'état exact où vous l'aviez laissé — aucun jour payé
n'est jamais perdu, même si vous réglez en avance.

## 10. Travailler hors connexion

Registre s'installe comme une application (icône sur l'écran d'accueil,
plein écran, sans barre d'adresse) depuis le menu « Installer l'application »
ou « Ajouter à l'écran d'accueil » de votre navigateur. Une fois installée —
ou même simplement ouverte une première fois dans le navigateur —
l'application reste consultable sans réseau pour tout ce que vous avez déjà
visité : une fiche, une liste, un tableau de bord jamais ouvert avant la
coupure ne peut pas apparaître par magie, mais tout ce que vous avez déjà vu
reste là.

**L'état de connexion est toujours visible**, en haut à droite : un point
discret « En ligne » quand tout est à jour, « Synchronisation… » pendant
l'envoi des dernières saisies, ou « Hors-ligne — *N* opération(s) en attente »
en orange dès que le réseau manque.

**Ce qui fonctionne sans réseau** : créer ou modifier une fiche, prendre une
photo ou joindre un document, enregistrer un mouvement de stock (entrée,
sortie, ajustement, transfert). Chaque action reste enregistrée sur
l'appareil et repart automatiquement dès que le réseau revient — pas besoin
de resaisir, ni de cliquer sur un bouton « synchroniser ».

**Conflits** : si une même information a été modifiée à la fois hors ligne
sur un appareil et en ligne par un collègue pendant la coupure, c'est la
saisie la plus récente (à l'instant où elle a été tapée, pas à l'instant où
elle a fini par être envoyée) qui est retenue — l'autre est simplement
écartée, jamais mélangée. Un administrateur retrouve chaque cas dans
« Organisation → Conflits de synchronisation », avec les deux valeurs et les
deux horodatages, et peut le marquer comme vu.

**Limite assumée** : la resynchronisation n'a lieu que pendant que
l'application est ouverte (au retour du réseau, ou toutes les 30 secondes) —
pas en tâche de fond une fois l'onglet fermé, pour ne jamais avoir à
conserver vos identifiants de connexion au-delà de la fenêtre ouverte.
