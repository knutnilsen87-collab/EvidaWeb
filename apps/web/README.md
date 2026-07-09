# EVIDA Web

Isolert React/Vite webprototype for EVIDA uten Tauri-, Rust IPC- eller lokal SQLite-bindinger i frontenden.

## Kjoring

```powershell
npm install
npm run dev
npm run lint
npm run test
npm run build
```

## Innhold

- Legal Dark Shell og Liquid Glass design tokens i `src/styles`.
- Promise-basert web/mock API i `src/lib/api.ts`.
- Auth- og tenant-kontrakt i `src/lib/auth.ts`.
- Multi-tenant AuthProvider i `src/context/AuthContext.tsx`.
- Ekte dokumentopplasting til `/api/documents/upload` med `FormData` og `X-Evida-Tenant-ID`.
- `QuarantineGate` for kildekarantene og manuell godkjenning.
- `CommandPalette` med `Ctrl/Cmd+K`, sok og tastaturstotte.
- Dashboard, Sidebar, Saksrom, Kronologi, Bevismatrise og Utkast/Export Builder.
- Citation/provenance engine i `src/lib/CitationManager.ts` og `src/components/PDFViewer.tsx`.
- Source-unit modell for store PDF-er i `src/lib/sourceUnits.ts`.
- Batch-godkjenning av seksjoner i `src/components/BatchApprovalPanel.tsx`.

## Auth og Tenant-kontrakt

`src/lib/auth.ts` definerer web-handtrykket mot Spring Boot control plane:

- `checkAuth()` validerer sesjonen mot `/api/auth/me` naar JWT finnes.
- `getHeaders(tenantId)` legger alltid ved `Authorization` og `X-Evida-Tenant-ID`.
- `apiRequest(path, user)` er felles helper for tenant-aware API-kall.
- `uploadDocument(file, tenantId)` sender filer til karantene-endepunktet uten manuell `Content-Type`, slik at `FormData` boundary settes riktig.

`src/context/AuthContext.tsx` gjor identitet og aktiv tenant tilgjengelig for hele appen:

- `AuthProvider` validerer session ved oppstart.
- `useAuth()` eksponerer `user`, `loading`, `login(tenantId)` og `logout()`.
- I dev-modus kan appen simulere tenant-login foer ekte OIDC kobles paa.

Backend er autoritativ for brukere, roller og tenant-isolasjon. Frontenden skal ikke avgjore tilgang alene.

Backend kan senere kobles videre inn ved aa bytte mock-implementasjonene i `src/lib/api.ts` uten aa innfore desktop-API-er i webkomponentene.

## Citation and Provenance

Saksrom bruker en event-basert provenance engine:

- `citationStore.jumpToSource(citation)` setter aktiv kilde.
- `jump-to-source` event varsler dokument-vieweren.
- `PDFViewer` tegner teal highlight over riktig dokument, side og avsnitt.
- Citation-piller i Saksrom er klikkbare og leder til kildevisning.

## Large PDF Strategy

EVIDA behandler store PDF-er som containere av kildeenheter, ikke som ett tungt dokument:

- `sourceUnitId(documentId, page)` gir stabile ID-er som `doc_001_p450`.
- `fetchSourceWindow(documentId, page)` simulerer backend-lazy loading av bare et lite sidevindu.
- `PDFViewer` rendrer bare sideenhetene i aktivt vindu.
- `BatchApprovalPanel` lar juristen godkjenne seksjoner, ikke hele 10 000-siders dokumentet.
