param(
    [string]$BaseUrl = "",
    [Guid]$ExpectedTenantId = [Guid]::Empty,
    [SecureString]$AccessToken,
    [string]$ChangeTicket = "",
    [string]$OutputJson = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ([string]::IsNullOrWhiteSpace($OutputJson)) {
    $OutputJson = Join-Path $repoRoot "artifacts\first-user\production_identity_result.json"
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputJson) | Out-Null

$uri = $null
$baseUrlValid = [System.Uri]::TryCreate($BaseUrl, [System.UriKind]::Absolute, [ref]$uri) `
    -and $uri.Scheme -eq "https"
$inputsComplete = $baseUrlValid `
    -and $ExpectedTenantId -ne [Guid]::Empty `
    -and $null -ne $AccessToken `
    -and $ChangeTicket -match "^[A-Za-z0-9][A-Za-z0-9._/-]{2,79}$"

$readinessStatus = $null
$policyStatus = $null
$adminPolicyStatus = $null
$crossTenantStatus = $null
$policyAuthority = $null
$localDevMode = $null
$probeError = $null
$tokenText = $null

if ($inputsComplete) {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AccessToken)
    try {
        $tokenText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
        $headers = @{
            Authorization = "Bearer $tokenText"
            "X-Evida-Tenant-ID" = $ExpectedTenantId.ToString()
        }

        $readiness = Invoke-RestMethod `
            -Uri "$($BaseUrl.TrimEnd('/'))/api/v1/enterprise/readiness" `
            -Headers $headers `
            -Method Get
        $readinessStatus = 200
        $localDevMode = [bool]$readiness.localDevMode

        $policy = Invoke-RestMethod `
            -Uri "$($BaseUrl.TrimEnd('/'))/api/v1/policy/effective" `
            -Headers $headers `
            -Method Get
        $policyStatus = 200
        $policyAuthority = [string]$policy.providerPolicy.authority

        $policyBody = @{
            externalProviderApproved = $false
            changeTicket = $ChangeTicket
        } | ConvertTo-Json
        Invoke-RestMethod `
            -Uri "$($BaseUrl.TrimEnd('/'))/api/v1/policy/ai-provider" `
            -Headers $headers `
            -Method Put `
            -ContentType "application/json" `
            -Body $policyBody | Out-Null
        $adminPolicyStatus = 200

        $otherTenant = [Guid]::NewGuid()
        $crossHeaders = @{
            Authorization = "Bearer $tokenText"
            "X-Evida-Tenant-ID" = $otherTenant.ToString()
        }
        try {
            $crossResponse = Invoke-WebRequest `
                -Uri "$($BaseUrl.TrimEnd('/'))/api/v1/policy/effective" `
                -Headers $crossHeaders `
                -Method Get
            $crossTenantStatus = [int]$crossResponse.StatusCode
        } catch {
            $crossTenantStatus = [int]$_.Exception.Response.StatusCode
        }
    } catch {
        $probeError = $_.Exception.Message
    } finally {
        if ($null -ne $tokenPointer) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
        }
        $tokenText = $null
    }
}

$pass = $inputsComplete `
    -and $readinessStatus -eq 200 `
    -and $policyStatus -eq 200 `
    -and $adminPolicyStatus -eq 200 `
    -and $crossTenantStatus -eq 403 `
    -and $localDevMode -eq $false `
    -and $policyAuthority -eq "backend-provider-policy"
$artifact = [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    gate = "PRODUCTION-OIDC-MFA-ROLE-CLAIMS"
    status = if ($pass) { "pass" } else { "blocked" }
    verdict = if ($pass) { "pass" } else { "blocked" }
    base_url = $BaseUrl
    expected_tenant_id = if ($ExpectedTenantId -eq [Guid]::Empty) { $null } else { $ExpectedTenantId.ToString() }
    bearer_token_persisted = $false
    readiness_http_status = $readinessStatus
    policy_http_status = $policyStatus
    admin_policy_http_status = $adminPolicyStatus
    cross_tenant_http_status = $crossTenantStatus
    production_local_dev_mode = $localDevMode
    provider_policy_authority = $policyAuthority
    mfa_evidence = "Successful request proves the production API accepted configured amr/acr evidence."
    role_evidence = "Successful provider-policy disable proves the JWT mapped to ADMIN_TENANT permission."
    tenant_evidence = "A different tenant header must be rejected with HTTP 403."
    probe_error = $probeError
    blocker = if ($pass) {
        $null
    } else {
        "Requires a live production HTTPS deployment and an invited admin user's short-lived MFA-authenticated token. The token is never written to the artifact."
    }
}
$json = (($artifact | ConvertTo-Json -Depth 8) -replace "`r`n", "`n") + "`n"
[System.IO.File]::WriteAllText($OutputJson, $json, [System.Text.UTF8Encoding]::new($false))
Write-Host "Production identity artifact: $OutputJson ($($artifact.status))"
if (-not $pass) {
    exit 2
}
