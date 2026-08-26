/**
 * Le contenu, séparé de la configuration — playbook §3.
 *
 * RÈGLE ABSOLUE (playbook §7) : rien n'est inventé ici. Pas de logo client, pas
 * de témoignage, pas de chiffre « plausible ». Chaque affirmation est traçable
 * dans `cahier-des-charges-registre.html` ou dans le code, et la référence est
 * notée en commentaire. Si une section réclamait du contenu qui n'existe pas,
 * elle n'est pas écrite.
 *
 * Les espaces fines insécables ne sont PAS posées ici : `lib/typography.ts` s'en
 * charge au rendu. Écrivez le français normalement.
 */

export const fr = {
  meta: {
    title: "Registre — le parc et les stocks de votre entreprise, sans mauvaise surprise",
    description:
      "Registre réunit vos véhicules, vos stocks et vos documents dans un seul outil, et vous prévient avant qu'une assurance expire ou qu'un dépôt tombe en rupture. Conçu pour les PME d'Afrique centrale, il fonctionne même sans réseau.",
  },

  nav: {
    brand: "Registre",
    links: [
      { label: "Le produit", href: "#produit" },
      { label: "Modèles", href: "#modeles" },
      { label: "Hors-ligne", href: "#hors-ligne" },
      { label: "Tarifs", href: "#tarifs" },
    ],
    login: "Se connecter",
    cta: "Essayer 14 jours",
    themeToggle: "Changer de thème",
    menuOpen: "Ouvrir le menu",
    menuClose: "Fermer le menu",
  },

  /**
   * Titres du hero, un par phase de `lib/config.ts`. Le scroll ne fait pas
   * défiler ces textes : il avance dans une animation dont ils sont la légende.
   */
  hero: {
    eyebrow: "Pour les PME qui suivent des véhicules, des stocks et des échéances",
    phases: {
      // §1 du cahier des charges, mot pour mot.
      gather: {
        title: "Vos cahiers, vos classeurs, vos fichiers Excel.",
        body: "Dispersés. Et le jour du contrôle, personne ne sait lequel fait foi.",
      },
      // §5 — le moteur de fiches, cœur du produit.
      declare: {
        title: "Un seul socle, que vous déclarez vous-même.",
        body: "Registre n'est pas un logiciel « parc automobile » ni un logiciel « stock de gaz ». Vous définissez vos objets et vos champs.",
      },
      // §5.3 — le champ Échéance regroupe date, justificatif et règle de rappel.
      ripen: {
        title: "Une assurance expire dans trente jours.",
        body: "Dans un tableur, la date, le scan et le rappel vivent à trois endroits différents. Ils finissent toujours désynchronisés.",
      },
      // §8 — moteur d'échéances et d'alertes.
      alert: {
        title: "Registre vous prévient avant.",
        body: "Balayage quotidien, rappels à J-30, J-7 et la veille, sur l'écran de la personne responsable. Pas dans une boîte mail commune.",
      },
      // §11 — hors-ligne, livré.
      offline: {
        title: "Le réseau coupe. Vous continuez.",
        body: "Vos saisies tiennent sur l'appareil et repartent toutes seules dès que la connexion revient. Rien n'est perdu, rien n'est à ressaisir.",
      },
      // §5.6 — bibliothèque de modèles prêts à l'emploi.
      library: {
        title: "Six modèles prêts à l'emploi.",
        body: "Activez-en un, il devient le vôtre : vous le modifiez sans limite. Pas d'effet page blanche au démarrage.",
      },
    },
    scrollHint: "Faites défiler",
    cta: { primary: "Commencer l'essai gratuit", secondary: "Voir les tarifs" },

    /**
     * La fiche animée. Aucune donnée inventée : tout vient des exemples du
     * cahier des charges lui-même — « Kilométrage : 84 320 km » (§5.2),
     * « Carburant : essence / gasoil / GPL » (§5.2), et l'alerte du §8, mot pour
     * mot : « Toyota Hiace · expire le 11/04/2026 · chauffeur : Nkolo Jean ».
     */
    card: {
      model: "Véhicule",
      title: "Toyota Hiace",
      status: "En service",
      rows: [
        { label: "Kilométrage", value: "84 320 km" },
        { label: "Carburant", value: "Gasoil" },
        { label: "Chauffeur affecté", value: "Nkolo Jean" },
        { label: "Assurance", value: "Valide" },
      ],
      deadline: {
        label: "Visite technique",
        value: "11/04/2026",
        countdown: "J-{n}",
        due: "Échéance dépassée",
        today: "Expire aujourd'hui",
      },
      alert: {
        title: "Visite technique à renouveler",
        body: "Toyota Hiace · expire le 11/04/2026 · chauffeur : Nkolo Jean",
      },
      connection: {
        online: "Connecté",
        offline: "Hors ligne",
        syncing: "Envoi en cours",
        queue: "{n} en attente",
        queueEmpty: "Tout est synchronisé",
      },
    },
    /** Légende de la fiche animée, lue par les lecteurs d'écran. */
    stageLabel:
      "Animation : une fiche Registre passe de feuillets épars à une fiche unique, puis déclenche une alerte d'échéance, survit à une coupure réseau et se démultiplie en six modèles.",
  },

  problem: {
    // §1 du cahier des charges, mot pour mot : « la conséquence est toujours la même ».
    kicker: "Le problème",
    title: "La conséquence est toujours la même",
    items: [
      { title: "Une assurance périmée", body: "Découverte le jour d'un contrôle routier, pas avant." },
      { title: "Une visite technique oubliée", body: "Le véhicule roule, l'entreprise est en infraction." },
      { title: "Un dépôt en rupture", body: "Un vendredi soir, quand plus personne ne peut réapprovisionner." },
    ],
    footnote:
      "Aucune de ces trois situations n'est un problème de sérieux. Ce sont des problèmes de mémoire — et une mémoire ne se répartit pas sur douze fichiers.",
  },

  pillars: {
    kicker: "Le produit",
    title: "Déclarer, être prévenu, ne rien perdre",
    items: [
      {
        title: "Vous déclarez ce que vous suivez",
        body: "Un modèle de fiche, ses champs, ses règles. Texte, nombre, montant, date, échéance, fichier, photo, téléphone, liste de choix, lien vers une autre fiche. Les formulaires ne sont jamais codés en dur : ils naissent de vos définitions.",
        ref: "§5.2",
      },
      {
        title: "Le moteur surveille pour vous",
        body: "Échéances qui approchent, stock passé sous son seuil, lot proche de la péremption. Une alerte naît, se laisse acquitter ou reporter, et se referme d'elle-même dès que la cause disparaît.",
        ref: "§8",
      },
      {
        title: "Rien ne s'écrase jamais",
        body: "Un mouvement de stock ne se modifie pas : il se corrige par un mouvement inverse. C'est ce qui rend l'historique auditable — et ce qui permet à deux agents hors-ligne de sortir du stock sans jamais se marcher dessus.",
        ref: "§7.3",
      },
    ],
  },

  templates: {
    kicker: "La bibliothèque",
    title: "Six modèles semés à l'ouverture de votre espace",
    intro:
      "Activer un modèle en fait une copie qui vous appartient : plus aucun lien avec l'original, vous ajoutez et retirez des champs à votre guise.",
    // §5.6 du cahier des charges — noms et champs repris tels quels.
    items: [
      {
        name: "Véhicule",
        kind: "asset",
        fields: "Immatriculation, photos, marque, modèle, carburant, kilométrage, carte grise, visite technique, assurance, vignette, chauffeur affecté",
      },
      {
        name: "Stock de gaz",
        kind: "stock",
        fields: "Bouteilles pleines, vides et en circulation, consigne encaissée, dépôt, seuil d'alerte",
      },
      {
        name: "Vêtements",
        kind: "stock",
        fields: "Article, variantes de taille et de couleur, dépôt, seuil par variante, prix",
      },
      {
        name: "Personnel",
        kind: "asset",
        fields: "Identité, poste, contrat, pièces justificatives, échéances de validité",
      },
      {
        name: "Extincteur",
        kind: "asset",
        fields: "Numéro, emplacement, type, date de recharge, date de contrôle",
      },
      {
        name: "Contrat",
        kind: "asset",
        fields: "Objet, partie signataire, date de fin, document signé, règle de reconduction",
      },
    ],
    kinds: {
      asset: { label: "Actif suivi", hint: "Un objet unique qu'on suit dans le temps." },
      stock: { label: "Article de stock", hint: "Une quantité qui entre et qui sort d'un dépôt." },
    },
  },

  deadline: {
    kicker: "Le champ qui change tout",
    title: "Une échéance n'est pas une date",
    // §5.3 du cahier des charges.
    body: "Dans un tableur, une échéance c'est trois informations à trois endroits différents : la date quelque part, le scan dans un dossier, le rappel dans la tête de quelqu'un. Elles finissent toujours désynchronisées. Dans Registre, le champ Échéance les tient ensemble.",
    parts: [
      { title: "La date de fin de validité", body: "Celle qui compte, celle qui déclenche." },
      { title: "Le justificatif scanné", body: "Photographié depuis le téléphone, sur place." },
      { title: "La règle de rappel", body: "Qui prévenir, et combien de jours à l'avance." },
    ],
    result: "Un seul champ, dans Registre.",
    closing:
      "Au renouvellement, la nouvelle date remplace l'ancienne, l'alerte se referme, et le document précédent reste consultable dans l'historique.",
  },

  offline: {
    kicker: "Terrain",
    title: "Conçu pour un réseau qui coupe",
    body: "Le mode hors-ligne n'est pas une option cochée en fin de projet : c'est une contrainte posée dès la première ligne, parce que le marché visé est celui d'un réseau mobile intermittent et de téléphones d'entrée de gamme.",
    items: [
      { title: "La saisie ne s'arrête pas", body: "Fiches, mouvements de stock et photos sont enregistrés sur l'appareil." },
      { title: "Une file d'attente visible", body: "Vous voyez ce qui reste à envoyer. Jamais de faux « synchronisé »." },
      { title: "Le retour du réseau suffit", body: "La file repart dans l'ordre, toute seule. Aucun bouton à presser." },
      { title: "Deux sorties s'additionnent", body: "Elles ne s'écrasent pas, même saisies hors-ligne au même moment." },
    ],
  },

  migration: {
    kicker: "Démarrage",
    title: "Vous ne ressaisirez pas 200 véhicules à la main",
    body: "Envoyez le fichier Excel ou CSV que vous tenez déjà. Registre vous montre les colonnes qu'il a reconnues, vous corrigez celles qu'il a manquées, et vous voyez l'aperçu du résultat avant de valider quoi que ce soit.",
    steps: [
      { n: "1", title: "Vous déposez le fichier", body: "Classeur Excel (.xlsx) ou CSV." },
      { n: "2", title: "Vous vérifiez les colonnes", body: "La correspondance est proposée, vous la corrigez." },
      { n: "3", title: "Vous voyez avant de valider", body: "Lignes valides, lignes refusées, et la raison de chacune." },
    ],
  },

  security: {
    kicker: "Cloisonnement",
    title: "Vos données ne sont vues que par vous",
    items: [
      {
        title: "L'éditeur du service n'y accède pas",
        body: "Aucun accès par défaut à vos fiches, vos documents et vos stocks. Une intervention de support exige votre autorisation explicite, limitée dans le temps, et toute consultation est inscrite à votre journal d'audit — que vous consultez.",
        ref: "§4.3",
      },
      {
        title: "Cinq rôles, pas un de plus",
        body: "Administrateur, gestionnaire, opérateur, lecteur — et l'éditeur, en dehors de vos données. Un opérateur de terrain ne voit pas les montants s'il n'y est pas habilité, et peut être restreint à son seul dépôt.",
        ref: "§4.2",
      },
      {
        title: "Un impayé ne supprime rien",
        body: "À l'expiration, l'espace passe en lecture seule pendant 30 jours : vous consultez, filtrez, exportez et imprimez toujours. Puis suspendu, données conservées 12 mois. Un règlement rouvre l'écriture le jour même, dans l'état exact où vous l'aviez laissé.",
        ref: "§12.3",
      },
    ],
  },

  pricing: {
    kicker: "Tarifs",
    title: "Toutes les fonctions dans toutes les offres",
    // §12.1 — l'argument est dans le cahier des charges, mot pour mot.
    intro:
      "Aucun module, aucun écran, aucune alerte n'est réservé à l'offre supérieure. Ce qui varie, ce sont trois volumes : la durée, le nombre d'utilisateurs et le quota de stockage.",
    rationale:
      "Le raisonnement est simple : le stockage des photos et des scans est le seul coût qui augmente réellement avec l'usage. C'est donc lui qui porte la différence de prix, pas l'accès aux fonctions.",
    currency: "FCFA",
    perMonth: "soit {x} FCFA par mois",
    durationLabel: "Durée",
    usersLabel: "Utilisateurs",
    storageLabel: "Stockage",
    // §12.1 — grille tarifaire par défaut.
    plans: [
      {
        name: "Mensuelle",
        duration: "1 mois",
        price: "5 000",
        monthly: "5 000",
        users: "5 utilisateurs",
        storage: "2 Go",
        capacity: "environ 570 véhicules complets",
        featured: false,
      },
      {
        name: "Semestrielle",
        duration: "6 mois",
        price: "25 000",
        monthly: "4 167",
        users: "15 utilisateurs",
        storage: "10 Go",
        capacity: "environ 2 850 véhicules complets",
        featured: true,
      },
      {
        name: "Annuelle",
        duration: "12 mois",
        price: "45 000",
        monthly: "3 750",
        users: "Utilisateurs illimités",
        storage: "25 Go",
        capacity: "environ 7 100 véhicules complets",
        featured: false,
      },
    ],
    featuredLabel: "Le meilleur rapport",
    cta: "Choisir cette offre",
    trial: {
      title: "14 jours d'essai, sans carte bancaire",
      body: "Tout est ouvert pendant l'essai, sans restriction. Trois rappels avant la fin, à J-7, J-3 et la veille. Si vous vous abonnez pendant l'essai, les jours restants ne sont pas perdus : l'abonnement démarre à la fin de l'essai.",
      cta: "Ouvrir mon espace",
    },
    notes: [
      // §12.1 : « Ces montants et ces quotas sont des valeurs par défaut. »
      "Montants indicatifs en FCFA, ajustables par l'éditeur et déclinables dans une autre devise. La devise de votre espace est proposée d'après le pays déclaré à l'inscription.",
      // §12.1 bis — honnêteté sur ce que fait réellement le quota.
      "Quota atteint : seul l'envoi de nouveaux fichiers est bloqué. La saisie des fiches, les mouvements de stock, les alertes et les exports continuent de fonctionner.",
      // §12.4 — l'encaissement est manuel. Ne pas laisser croire au paiement en ligne.
      "Le règlement se fait hors de la plateforme — Mobile Money, virement ou espèces — puis il est enregistré par l'éditeur, qui émet la facture. Aucun paiement en ligne n'est intégré à ce stade.",
    ],
    capacityNote:
      "Une photo compressée pèse environ 300 Ko et un document scanné environ 500 Ko : un véhicule complet — cinq photos, carte grise, visite technique, assurance et vignette — occupe à peu près 3,5 Mo.",
  },

  finalCta: {
    title: "Ouvrez votre espace en une minute",
    body: "Le nom de votre entreprise, votre pays, votre secteur. C'est tout ce qui vous est demandé. Les modèles correspondant à votre activité sont déjà là.",
    primary: "Commencer l'essai gratuit",
    secondary: "J'ai déjà un compte",
  },

  footer: {
    tagline: "Le parc et les stocks de votre entreprise, sans mauvaise surprise.",
    // Honnêteté : ne rien afficher qui n'existe pas. Pas de faux réseaux sociaux,
    // pas de fausses mentions légales, pas d'adresse inventée (playbook §7).
    productTitle: "Produit",
    appTitle: "Application",
    appLinks: { login: "Se connecter", signup: "Créer un espace" },
    rights: "Registre",
  },
} as const;

export type Content = typeof fr;
