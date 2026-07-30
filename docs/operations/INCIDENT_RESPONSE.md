# Hendelseshåndtering

## Alvorlige hendelser

Tenant-/sakskryssing, uautorisert tilgang, skadevarebypass, tap/endring av audit, sensitiv logging, feil ekstern AI-overføring eller tap av data er stoppkriterier.

## Prosedyre

1. Stans upload/providerkall og isoler berørt tenant.
2. Bevar tidslinje, hashbasert audit og tekniske logger uten å kopiere rå klienttekst.
3. Identifiser omfang, tidsrom, datakategorier og berørte registrerte.
4. Varsle sikkerhetsansvarlig og behandlingsansvarlig straks.
5. Vurder lovpålagt varsling innen gjeldende frist.
6. Roter secrets, korriger årsak, test restore/tenant-isolasjon og dokumenter tiltak.
7. Gjenåpne bare etter eksplisitt go-beslutning.

Kontaktpersoner og telefonnummer skal fylles inn i den signerte pilotavtalen.
