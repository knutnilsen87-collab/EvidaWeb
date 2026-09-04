# ARKIVERT — EVIDA legacy-repo

**Dato:** 2026-09-03

**Cutover-kilde:** commit `d92aef0876444a4ce1174bf1529eab081c5ae54d`, tag `evida-v2-cutover`, branch `codex/web-real-client-readiness`.

All videre EVIDA-utvikling skjer i:

```
F:\prosjekter_MAIN\EvidaNy2.0
```

Dette repoet skal **ikke** brukes som aktiv development source. Ingen nye commits skal skje her (fryse-commiten `d92aef0` og denne filen er de siste). Repoet beholdes uendret som arkiv, historikk og lesestøtte — ingenting er slettet.

Hva som ble migrert (fase 2):

- `evida-core/services/saksrom-api` → `EvidaNy2.0/backend/saksrom-api` (Flyway V001–V012 byte-identisk, SHA-256-verifisert)
- Validert klientinfrastruktur fra `apps/web/src/{lib,domain}` → `EvidaNy2.0/frontend/src/` (ingen UI-komponenter)
- `deploy/pilot/docker-compose.yml` + `nginx.conf` → `EvidaNy2.0/docker-compose.dev.yml` + `deploy/`

Styringsdokumenter, beslutningshistorikk og status: se `EvidaNy2.0/status_bundle.txt`, `EvidaNy2.0/CLAUDE.md` og `EvidaNy2.0/docs/ADR/ADR-002-repo-consolidation.md`.
