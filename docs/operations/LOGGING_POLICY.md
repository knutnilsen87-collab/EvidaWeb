# Logging-policy

Tillatt: tidspunkt, request-/event-ID, tenant-/case-/document-ID, statuskode, varighet, komponent, feilkode, parserversjon og telleverdier.

Forbudt: rå dokumenttekst, prompt-/svar-dumper, filinnhold, passord, tokens, cookies, API-nøkler, full e-post ved unødvendighet og komplette malware-signaturer.

Auditpayload skal være strukturert og minimert. Runtime-logger lagres utenfor Git under `.codex-runtime`, tilgangsbegrenses og roteres. Delte artifacts skal bare inneholde syntetiske ID-er, boolske resultater, hasher og aggregerte tellerverdier.
