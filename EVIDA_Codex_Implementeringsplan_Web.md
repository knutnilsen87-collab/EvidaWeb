# EVIDA Web – Codex-klar implementeringsplan

Dette er en Markdown-versjon av DOCX-dokumentet. Bruk DOCX for lesing/deling og denne filen som direkte prompt/arbeidsordre i Codex.

## TL;DR
- Opprett/bruk et rent web-monorepo uten Tauri/Rust-bindinger i frontenden.
- Bygg React/Vite + TypeScript webapp med Liquid Glass design tokens og Legal Dark Shell.
- Erstatt Tauri IPC med asynkront web/mock API i `src/lib/api.ts`.
- Implementer `QuarantineGate` og `CommandPalette`.
- Kjør test/build før levering.

## Codex master prompt

```text
Du er Codex i et EVIDA web-repo. Gjennomfør oppgavene under i rekkefølge og lag fungerende, testbar kode.

Mål:
- Koble React-frontenden fra Tauri.
- Klargjør appen for web med Vite, TypeScript og asynkrone API-kontrakter.
- Implementer Legal Dark Shell, Liquid Glass design tokens, QuarantineGate og CommandPalette.
- Ikke bruk hardkodede hemmeligheter.
- Ikke innfør Tauri, Rust IPC eller lokal SQLite i webfrontenden.
- Skriv ren kode med tydelige typer, tilgjengelige knapper, keyboard-støtte og tester.

Arbeidsregler:
1. Før endringer: inspiser repoet og finn eksisterende frontendstruktur.
2. Hvis Tauri-importer finnes i frontend, erstatt dem med web-API-lag i src/lib/api.ts.
3. Opprett manglende filer nøyaktig med filstiene i planen.
4. Kjør format/lint/test/build etter endringene.
5. Lever en kort endringsrapport med filer endret, kommandoer kjørt og eventuelle begrensninger.
```

## Repo-struktur

```text
evida-web-monorepo/
├── apps/
│   └── web/
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx
│           ├── main.tsx
│           ├── lib/api.ts
│           ├── components/
│           │   ├── CommandPalette.tsx
│           │   ├── CommandPalette.css
│           │   ├── QuarantineGate.tsx
│           │   └── QuarantineGate.css
│           └── styles/
│               ├── tokens.css
│               └── global.css
├── packages/
│   ├── ui/
│   └── types/
└── README.md
```

## Kjøring

```powershell
cd apps/web
npm install
npm run dev
npm run test
npm run build
```

Se DOCX-filen for komplett kode, tester, akseptansekriterier og sikkerhetsregler.
