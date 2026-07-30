# EVIDA kontrollert pilotdrift

Denne pakken bygger statisk React, Spring Boot, Postgres, ClamAV/OCR, oauth2-proxy og en HTTPS-gateway. Bare port 80/443 publiseres. Vite dev-server, backend, database og clamd er ikke offentlig eksponert.

## Før oppstart

1. Opprett krypterte datavolumer for dokumenter og Postgres. Kjør `scripts/pilot/test-target-storage.ps1` på målmaskinen før `EVIDA_STORAGE_ENCRYPTION_ATTESTED=true` settes.
2. Kopier `.env.production.example` til en fil utenfor repo og hent secrets fra secrets manager.
3. Legg TLS-sertifikatene `fullchain.pem` og `privkey.pem` i angitt katalog.
4. Konfigurer OIDC-klient, inviterte brukere og MFA. JWT må inneholde UUID-claims `tenant_id` og `user_id`, samt minst én tillatt `roles`-verdi og godkjent MFA-bevis i `amr` eller `acr`.
5. Angi eksplisitt `EVIDA_ALLOWED_ROLES` og IdP-spesifikke `EVIDA_MFA_ACCEPTED_AMR`/`EVIDA_MFA_ACCEPTED_ACR`. Produksjonsprofilen nekter å starte uten HTTPS issuer, MFA-håndheving og rolletillatelsesliste.
6. Kjør `docker compose --env-file <secret-env> config`, deretter `docker compose ... up -d --build`.
7. Kjør health-, malware-, auth-, tenant-, backup-, lagrings- og logg-gatene med bare syntetiske data.
8. Verifiser live miljø med `test-live-edge.ps1` og `test-production-identity.ps1`.
9. Signer digest-pinnede web/API-images og verifiser dem med `test-release-signatures.ps1`.

`EVIDA_AI_PROVIDER_CALLS_ENABLED` skal stå `false` inntil provider-policy, DPA og alle relevante godkjenninger er signert. Tenant-policy kan ikke overstyre den globale bryteren.

## Rollback

Behold forrige image-digests og commit-ID. Stopp ny stack, gjenopprett forrige Compose-konfigurasjon og bruk kryptert backup bare etter eksplisitt restore-beslutning. Databaseendringen for provider-policy er additiv; ikke slett policytabellen under en normal rollback.
