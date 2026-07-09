# Environment

| Variable | Local | Staging | Production | Secret | Default |
| --- | --- | --- | --- | --- | --- |
| `EVIDA_PROFILE` | optional | required | required | no | `dev` |
| `DATABASE_URL` / `EVIDA_DEV_DATABASE_URL` | optional | required | required | no | local H2 in dev |
| `DATABASE_USER` / `EVIDA_DEV_DATABASE_USER` | optional | required | required | no | `sa` in dev |
| `DATABASE_PASSWORD` / `EVIDA_DEV_DATABASE_PASSWORD` | optional | required | required | yes | empty in dev |
| `EVIDA_QUARANTINE_ROOT` | optional | required | required | no | `./data/quarantine` |
| `EVIDA_OBJECT_STORAGE_BUCKET` | no | required | required | no | none |
| `EVIDA_OBJECT_STORAGE_REGION` | no | required | required | no | none |
| `EVIDA_ALLOWED_ORIGINS` | optional | required | required | no | dev localhost origins |
| `EVIDA_OIDC_ISSUER` | no | required | required | no | none |
| `EVIDA_OIDC_CLIENT_ID` | no | required | required | no | none |
| `EVIDA_OIDC_CLIENT_SECRET` | no | required | required | yes | none |
| `EVIDA_RATE_LIMIT_CONFIG` | optional | required | required | no | none |
| `EVIDA_MALWARE_SCANNER_MODE` | optional | required | required | no | `dev-bypass` in dev only |
| `EVIDA_MALWARE_SCANNER_CONFIGURED` | optional | required | required | no | `false` |
| `EVIDA_LOCAL_DEV_MODE` | optional | false | false | no | `false` |

Production startup must fail if local dev auth is enabled, JWT trust is missing, CORS origins are missing or wildcarded, or malware scanner configuration is not declared.
