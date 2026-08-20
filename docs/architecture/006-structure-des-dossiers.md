# 006 — Structure de dossiers du scaffold

## Contexte

La structure de dossiers cible n'a pas été transmise en détail dans le brief de cette
session. La structure ci-dessous a donc été posée par défaut, en respectant les
contraintes explicites (Next.js 14 App Router, `lib/supabase/`, `prisma/migrations/`,
`docs/architecture/`) et en restant volontairement minimale : **aucun dossier de route
métier** (ex. regroupement `(dashboard)/registre`, `(dashboard)/rapports`) n'a été créé,
puisque ce découpage relève de l'implémentation des écrans, explicitement laissée à
Codex.

```
lbz_Saluni/
├── app/                      # App Router — layout racine + page d'accueil minimale
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   └── ui/                   # Primitives shadcn/ui (générées via `npx shadcn add ...`)
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # Client Supabase navigateur
│   │   ├── server.ts         # Client Supabase serveur (Server Components)
│   │   └── middleware.ts     # Rafraîchissement de session
│   ├── prisma.ts             # Singleton PrismaClient
│   └── utils.ts              # `cn()` (généré par shadcn init)
├── middleware.ts              # Appelle lib/supabase/middleware.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       ├── migration_lock.toml
│       ├── 00000000000000_init/
│       └── 00000000000001_rls_policies/
├── types/                     # Types partagés (vide à ce stade)
├── docs/
│   ├── steps/
│   │   └── Etape_01_Registre_Activite.md
│   └── architecture/          # Ce dossier
├── public/
├── .env.example
├── .eslintrc.json
├── .prettierrc.json
├── .husky/pre-commit
└── components.json             # Config shadcn/ui
```

## Décision

- Les regroupements de routes (`(auth)`, `(dashboard)`, etc.) ne sont pas créés à
  l'avance : les créer sans connaître le découpage réel des écrans de l'Étape 1
  reviendrait à figer une décision de routing qui appartient à l'implémentation, pas au
  scaffold.
- `types/` est créé vide (convention de dossier), à remplir au fil de l'implémentation.
- `components/ui/` contient uniquement ce que `shadcn` génère (ex. `button.tsx`) — aucun
  composant métier.

## Si la structure cible diffère

Si une structure de dossiers différente était prévue pour ce projet, il suffit de
déplacer les dossiers `lib/`, `prisma/`, `docs/` tels quels dans la nouvelle arborescence
: aucun de ces trois n'a de dépendance de chemin vers `app/`.
