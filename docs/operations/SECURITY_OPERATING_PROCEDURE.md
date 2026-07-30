# Sikkerhetsrutine for EVIDA-pilot

- Produksjon kjøres uten `local-dev-mode`, med OIDC/JWT, inviterte kontoer og helst MFA hos IdP.
- HTTPS termineres i kontrollert reverse proxy; backend og database eksponeres ikke offentlig.
- ClamAV må være tilgjengelig; scannerfeil stopper upload.
- Secrets leveres som runtime-secrets, aldri i Git, logger eller artifacts.
- Kun minste rolle gis. Tilgang og administratorhandlinger auditeres.
- Kryptert backup kjøres daglig og restore-drill minst månedlig.
- Sikkerhetsoppdateringer og SBOM vurderes før release.
- Operatør stanser pilot ved tenantlekkasje, usikker kilde, malwarebypass, tap av audit eller ukryptert lagring.
