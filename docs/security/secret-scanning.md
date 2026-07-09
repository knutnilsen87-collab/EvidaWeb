# Secret Scanning

## Preferred scan

Run:

```powershell
gitleaks detect --source .
```

## Fallback scan

Run:

```powershell
git grep -n -i "password\|secret\|api_key\|token\|private_key"
```

## Handling findings

- Treat committed credentials as compromised.
- Revoke and rotate the credential outside the repo.
- Remove the secret from current files.
- Open a security follow-up for history rewrite if the repository has been shared.

## Release blocker status

Production release requires a clean secret scan in CI or an approved exception list.
