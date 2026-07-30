# EVIDA — lagring, retention og sletting

Status: operativ policy. Eier: behandlingsansvarlig. Juridisk godkjenning kreves før ekte klientdata.

## Standardperioder

- Aktiv pilotsak: så lenge pilotformålet krever det, maksimalt 90 dager uten fornyet skriftlig beslutning.
- Slettet dokument: kildeenheter fjernes umiddelbart; fysisk blob fjernes når ingen aktive dokumentposter refererer til den.
- Slettet sak: skjules umiddelbart. Tilknyttede dokumenter skal slettes eller få dokumentert rettslig retention-unntak.
- Krypterte backupsett: 30 dager, deretter automatisk utløp.
- Audit: 12 måneder eller lengre når lovlig plikt/avtale krever det; audit skal ikke inneholde rå dokumenttekst.

## Operatørflyt

1. Bekreft tenant, sak og slettegrunnlag.
2. Ta nødvendig audit-/backupbevis uten å kopiere rå klienttekst til artifacts.
3. Slett dokumenter via tenant-avgrenset API, deretter saken.
4. Verifiser at dokumenter, kildeenheter og søketreff er borte.
5. Registrer `DOCUMENT_DELETED`/`CASE_DELETED` og behold hashkjeden.
6. Ved legal hold: stans sletting, dokumenter hjemmel, ansvarlig og utløpsdato.

Rollback er gjenoppretting fra autorisert kryptert backup. Det krever eksplisitt restore-bekreftelse og ny audit.
