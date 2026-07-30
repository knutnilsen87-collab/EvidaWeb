# AI- og provider-policy

## Autoritativ kontroll

`ProviderPolicyService` i Spring-backenden er eneste myndighet for om EVIDA kan bruke en ekstern AI-provider. Frontend, deploykonfigurasjon og andre kontrollere kan vise resultatet, men kan ikke overstyre det.

En provider-kallrute kan bare være aktiv når begge vilkår er sanne:

1. Den globale nødbryteren `EVIDA_AI_PROVIDER_CALLS_ENABLED=true`.
2. Aktiv tenant har `external_provider_approved=true` i `provider_policies`.

Standard pilotkonfigurasjon har den globale bryteren avslått. Dermed kan ingen tenant-innstilling alene aktivere en ekstern provider.

## Endringsvei

- Les effektiv policy: `GET /api/v1/policy/effective`
- Endre tenant-policy: `PUT /api/v1/policy/ai-provider`
- Påkrevd rettighet: `ADMIN_TENANT`
- Påkrevd body:

```json
{
  "externalProviderApproved": false,
  "changeTicket": "SEC-1234"
}
```

`changeTicket` er en kort, strukturert referanse og skal aldri inneholde klientdata. Hver mutasjon oppretter audit-event `PROVIDER_POLICY_CHANGED` på tenantens globale audit-kjede. Effektiv respons oppgir myndigheten `backend-provider-policy`.

## Krav før ekstern provider kan aktiveres

1. Godkjent provider, DPA/subprocessor og EØS-/overføringsvurdering.
2. Dokumentert null-trening, retention og sletting.
3. Secrets i godkjent secrets manager.
4. Kildebinding, prompt-injection, feilmodus og sletting testet mot den faktiske providerruten.
5. Engineering, Product, Security/Privacy og dataeier har signert samme releasekandidat.
6. Den globale bryteren åpnes av definert AI-policy-eier.
7. Tenant-policy aktiveres av en autorisert administrator med endringssak.

Rå prompts, svar, dokumenttekst eller fritekstbegrunnelser skal aldri logges.
