# AI- og provider-policy

Standard pilot kjører kildebundet, deterministisk lokal rute med `EVIDA_AI_PROVIDER_CALLS_ENABLED=false`. Dokumentinstruksjoner behandles som kildemateriale, ikke systeminstrukser. Svar uten relevant kilde skal avslås.

Aktivering av ekstern provider krever:

1. autoritativ konfigurasjonsendring med audit-event,
2. godkjent DPA/subprocessor og EØS-/overføringsvurdering,
3. null-trening og dokumentert retention,
4. secrets i secrets manager,
5. test av kildebinding, prompt injection, feilmodus og sletting,
6. ny intern go-signoff.

Rå prompts eller svar skal aldri logges.
