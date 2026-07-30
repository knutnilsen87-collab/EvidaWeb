# EVIDA kontrollert pilotdrift

Denne pakken bygger statisk React, Spring Boot, Postgres, ClamAV/OCR, oauth2-proxy og en HTTPS-gateway. Bare port 80/443 publiseres. Vite dev-server, backend, database og clamd er ikke offentlig eksponert.

Før oppstart:

1. Opprett et kryptert datavolum og verifiser det operativt.
2. Kopier `.env.production.example` til en fil utenfor repo og hent secrets fra secrets manager.
3. Legg TLS-sertifikatene `fullchain.pem` og `privkey.pem` i angitt katalog.
4. Konfigurer OIDC-klient, inviterte brukere, MFA og claims `tenant_id`, `user_id`, `email`, `roles`.
5. Kjør `docker compose --env-file <secret-env> config`, deretter `docker compose ... up -d --build`.
6. Kjør health-, malware-, auth-, tenant-, backup- og logg-gatene før ekte data.

Rollback: behold forrige image-/commit-ID, stopp ny stack, gjenopprett forrige compose og bruk kryptert backup bare etter eksplisitt restore-beslutning.
