# EVIDA external closure pack

Generated: 2026-07-30

Scope: web/Spring controlled pilot
Release decision: **NO-GO for real client documents**

Dette er overleveringen for de elleve gjenstående portene. Repositoryet kan gjøre kontrollene og skrive evidens, men kan ikke utstede menneskelige, juridiske eller organisatoriske godkjenninger.

| # | Port | Codex/automatisering | Nåstatus | Bevis som lukker porten |
|---|---|---|---|---|
| 1 | Native Windows file picker | Skrive signoff-mal og validere påkrevde felt | MANUAL_REQUIRED | `native_file_picker_upload_signoff.json` med tester og skjerm-/videoevidens |
| 2 | Managed workstation smoke | Skrive bindende smoke-artefakt | MANUAL_REQUIRED | `windows_managed_workstation_smoke.json` med operator, device-ID, ticket og evidens |
| 3 | Kryptert målvolum | Lese BitLocker-status for begge datarøtter | BLOCKED uten måltilgang/admin | `encryption_verification.json` = `pass` |
| 4 | Raw storage marker inspection | Skanner eksplisitte offline råfiler for fire syntetiske markører | BLOCKED til 3 er PASS og marker-lifecycle er kjørt | `raw_storage_inspection.json` = `pass` |
| 5 | Provider-/AI-policy | Implementert én backend-myndighet, tenant-policy, global bryter og audit | PASS teknisk; ekstern provider fortsatt OFF | `provider_policy_result.json` = `pass`; menneskelig providerbeslutning kreves før aktivering |
| 6 | Production OIDC/MFA/role claims | Fail-closed startup, claim-validering og live probe | PASS kode/test; BLOCKED live | `production_identity_result.json` = `pass` |
| 7 | Live HTTPS/domain/certs/firewall | Compose/gateway er klar; live probe sjekker TLS og lukkede internporter | BLOCKED live | `live_https_edge_result.json` = `pass` |
| 8 | Trusted release signing | Verifiserer digest-pinnede OCI-signaturer med cosign | BLOCKED uten signing identity/images | `signature_verification.json` = `pass` |
| 9 | Signert pilotavtale + DPA | Dokumentutkast finnes | HUMAN/LEGAL | Signerte avtaler referert fra approval-artefakt |
| 10 | Alle faglige godkjenninger | Fail-closed approval-artefakter finnes | HUMAN | Engineering, Product, Security/Privacy, IT og data owner = `pass` mot samme commit |
| 11 | Phase 9 real-document execution | Gate nekter start før alle P0-kontroller er PASS | FORBUDT | `real_client_data_gate_latest.json` må eksplisitt si `real_client_data_allowed: true` |

## Operatørkommandoer

Kjør fra repository-roten på riktig målmaskin. Bruk bare syntetiske markørdokumenter inntil port 11 er grønn.

```powershell
.\scripts\pilot\write-native-file-picker-signoff.ps1 `
  -Status pass -Tester "<navn>" -EvidencePath "<godkjent evidens>"

.\scripts\pilot\write-managed-workstation-smoke.ps1 `
  -Status pass -Operator "<navn>" -ManagedDeviceId "<device-id>" `
  -ChangeTicket "<ticket>" -EvidencePath "<godkjent evidens>"

.\scripts\pilot\write-storage-marker-run.ps1 `
  -Status pass -Operator "<navn>" -ChangeTicket "<ticket>" `
  -EvidencePath "<godkjent evidens>"

.\scripts\pilot\test-target-storage.ps1 `
  -DocumentDataDirectory "<dokumentrot>" `
  -PostgresDataDirectory "<postgresrot>" `
  -AttestedBy "<navn>" -ChangeTicket "<ticket>" `
  -MarkerRunEvidencePath ".\artifacts\first-user\storage_marker_run_evidence.json" `
  -OfflineRawStorageFiles "<offline-råfil-1>","<offline-råfil-2>"

.\scripts\pilot\test-live-edge.ps1 `
  -BaseUrl "https://evida.example.no" -ExpectedDnsName "evida.example.no"

$token = Read-Host "Short-lived MFA access token" -AsSecureString
.\scripts\pilot\test-production-identity.ps1 `
  -BaseUrl "https://evida.example.no" `
  -ExpectedTenantId "<tenant-uuid>" -AccessToken $token `
  -ChangeTicket "<ticket>"

.\scripts\pilot\test-release-signatures.ps1 `
  -ImageReferences "<web-image@sha256:...>","<api-image@sha256:...>" `
  -CertificateIdentity "<trusted-workload-identity>" `
  -CertificateOidcIssuer "https://<trusted-issuer>" `
  -ReleaseCommit "<40-char-commit>"

.\scripts\pilot\write-release-approval.ps1 `
  -Gate Engineering -Status pass -Approver "<navn>" -Authority "<rolle>" `
  -ReleaseCommit "<40-char-commit>" -EvidencePath "<signert evidens>"

# Gjenta med Gate Product, SecurityPrivacy, IT og DataOwner.
# PilotAgreementDPA krever i tillegg -PilotAgreementReference og -DpaReference.

npm run pilot:real-data-gate
```

## Hvem må gjøre hva

- Engineering/Product: godkjenne funksjon og begrensninger mot eksakt commit.
- Security/Privacy: godkjenne lagring, IdP, provider, logger, DPA og rålagringsbevis.
- IT/Braathe: kjøre målmaskin-, BitLocker-, firewall- og policy-smoke.
- Release owner: signere immutable OCI-images og binde digestene til commit/SBOM/provenance.
- Data owner og kontraktseier: signere pilotavtale/DPA og eksplisitt godkjenne første dokument.

Ingen av disse rollene kan erstattes av Codex. Hvis et bevis mangler eller er tvetydig, er status `BLOCKED`.
