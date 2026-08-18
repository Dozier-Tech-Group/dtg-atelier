<#
.SYNOPSIS
    Deploys dtg-atelier's Azure resources (Key Vault, storage, GitHub OIDC identity).

.DESCRIPTION
    Read-only by default: runs `az deployment group create --what-if` so you see
    every change before it happens. Pass -Apply to actually deploy.

    Targets the DTG Platform subscription (ea96e212-9b00-4e93-9d3b-9018638cee20)
    in the doziertechgroup.com tenant. Region default is centralus, per DTG-Infra.

    This script never handles secret values. Secrets go into Key Vault by hand or
    by pipeline; the repo holds pointers, never values.

.EXAMPLE
    ./deploy.ps1                # preview only — nothing changes
    ./deploy.ps1 -Apply         # deploy for real
    ./deploy.ps1 -ResourceGroup rg-dtg-atelier-dev -NamePrefix atelierdev -Apply
#>
[CmdletBinding()]
param(
    [string]$ResourceGroup = 'rg-dtg-atelier',
    [string]$Location = 'centralus',
    [string]$NamePrefix = 'atelier',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

# Verified estate facts — do not edit these to point elsewhere.
$SubscriptionId = 'ea96e212-9b00-4e93-9d3b-9018638cee20'   # DTG Platform
$TemplateFile = Join-Path $PSScriptRoot 'main.bicep'

if (-not (Test-Path $TemplateFile)) {
    throw "Template not found: $TemplateFile"
}

Write-Host "==> Targeting subscription DTG Platform ($SubscriptionId)"
az account set --subscription $SubscriptionId
if ($LASTEXITCODE -ne 0) {
    throw 'az account set failed. Run `az login --tenant doziertechgroup.com` first.'
}

$groupExists = az group exists --name $ResourceGroup
if ($groupExists -ne 'true') {
    if ($Apply) {
        Write-Host "==> Creating resource group $ResourceGroup in $Location"
        az group create --name $ResourceGroup --location $Location --output none
        if ($LASTEXITCODE -ne 0) { throw "Failed to create resource group $ResourceGroup." }
    }
    else {
        Write-Host "==> Resource group $ResourceGroup does not exist yet; -Apply would create it in $Location."
        Write-Host '    What-if needs an existing group, so this preview stops here.'
        Write-Host '    Re-run with -Apply when you are ready.'
        exit 0
    }
}

$deploymentArgs = @(
    'deployment', 'group', 'create'
    '--resource-group', $ResourceGroup
    '--template-file', $TemplateFile
    '--parameters', "namePrefix=$NamePrefix", "location=$Location"
    '--name', "dtg-atelier-$(Get-Date -Format yyyyMMdd-HHmmss)"
)

if ($Apply) {
    Write-Host "==> Deploying to $ResourceGroup (this changes real resources)"
    az @deploymentArgs
    if ($LASTEXITCODE -ne 0) { throw 'Deployment failed.' }

    Write-Host ''
    Write-Host '==> Deployed. Two follow-ups Bicep cannot do for you:'
    Write-Host ''
    Write-Host '    1. Static website is a data-plane setting — enable it now:'
    Write-Host '       az storage blob service-properties update --static-website `'
    Write-Host '         --account-name <storageAccountName output> `'
    Write-Host '         --index-document index.html --auth-mode login'
    Write-Host ''
    Write-Host '    2. Grant the GitHub identity its minimum RBAC roles'
    Write-Host '       (e.g. Key Vault Secrets User, Storage Blob Data Contributor).'
}
else {
    Write-Host '==> WHAT-IF preview (default). Nothing will change. Pass -Apply to deploy.'
    az @deploymentArgs --what-if
    if ($LASTEXITCODE -ne 0) { throw 'What-if failed.' }
}

Write-Host ''
Write-Host '=============================================================================='
Write-Host ' REMINDER: any Azure resource change must be reflected in DTG-Infra''s'
Write-Host ' docs/ARCHITECTURE-MAP.md in the SAME PR. Not a follow-up. The same one.'
Write-Host '=============================================================================='
