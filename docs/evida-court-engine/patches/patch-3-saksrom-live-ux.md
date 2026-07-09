
Patch 3 — Saksrom Live UX + Progressive Disclosure
Goal

Translate strict backend readiness into a calm legal UI.

Depends on Patch 1 and Patch 2.

UI language

Do not show backend enum names to lawyers.

Use:

Klar som kilde
Klar med merknad
Delvis klar
Behandles
Venter
Behandling feilet
Document row examples
Full
✅ Arbeidsavtale.pdf — Klar som kilde · 12 sider
Partial
🟡 Årsregnskap 2023.pdf — Delvis klar · 45/50 sider · OCR pågår
Queue/processing
⏳ Møtereferat.docx — Behandles...
Failed
⚠️ Korrupt_vedlegg.pdf — Behandling feilet · [Vis problem]
Terminal partial
🟡 Vedlegg 4.pdf — Klar med merknad · 49/50 sider
Problem modal

Show human explanation first.

Title
Dokumentet kunne ikke leses
Primary body examples
Dokumentet er passordbeskyttet. Fjern passordet og prøv igjen.
Dokumentet kunne ikke leses. Det kan være skadet eller ha et format systemet ikke støtter.
Enkelte sider kunne ikke leses og er ikke brukt som kilde.
Buttons

If retryable:

[Prøv igjen] [Slett dokument]

If not retryable:

[Slett dokument]
Technical details

Collapsed by default:

▸ Vis tekniske detaljer

Expanded:

Technical code: PDF_PASSWORD_PROTECTED
Stage: PARSE
Document ID: doc_...
Retryable: false
Updated at: ...
Saksrom banner
Provisional
⚠️ Foreløpig kildegrunnlag
Saksrommet kan brukes, men svar kan være ufullstendige mens dokumenter behandles.
Klar: 12 dok · Delvis: 3 dok · Behandles: 5 dok · Feilet: 1 dok
All ready

Hide or show:

✅ Alle dokumenter er klare som kilder
Ready with permanent notes
⚠️ Kildegrunnlag klart med merknader
Noen dokumenter har sider som ikke kunne leses. Svarene tar hensyn til dette.
Klar: 14 dok · Med merknad: 2 dok
Chat disclosure UI

If answer used partial sources:

Info: Svaret bygger på dokumenter som fortsatt behandles. Enkelte sider er ikke vurdert.

If specific ranges:

Info: Svaret bygger på Årsregnskap 2023.pdf side 1–45. Side 46–50 er ikke vurdert ennå.

If permanent disclosure:

Info: Dokumentet er ferdig behandlet, men enkelte sider kunne ikke leses og er ikke brukt som kilde.
Frontend mapping functions

Create pure functions:

mapReadinessToDocumentLabel(readiness)
mapReadinessToBadgeVariant(readiness)
mapGapToUserMessage(gap)
mapCoverageToBannerState(summary)
mapRetrievedSourceToDisclosure(source)

Do not inline the mapping in React render code.

Acceptance criteria

Patch is complete when:

- document rows are compact and human readable
- problem modal hides technical details by default
- Saksrom banner updates from coverage snapshot/SSE
- chat disclosure notes render when sources require disclosure
- backend enum names do not appear in main lawyer UI
- UI distinguishes Delvis klar / Klar som kilde / Klar med merknad
- tests cover status mapping functions

