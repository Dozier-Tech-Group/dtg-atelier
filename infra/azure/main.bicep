// main.bicep — dtg-atelier's slice of the DTG Azure estate.
//
// Resource-group scoped. Deploy with deploy.ps1 (what-if by default).
// Estate facts (verified, do not invent): tenant doziertechgroup.com,
// subscription DTG Platform ea96e212-9b00-4e93-9d3b-9018638cee20, region centralus.
// Canonical infra repo: Dozier-Tech-Group/DTG-Infra. Any resource change here must
// be reflected in DTG-Infra docs/ARCHITECTURE-MAP.md in the same PR.

targetScope = 'resourceGroup'

@description('Short name prefix for all resources (lowercase letters and digits).')
@minLength(3)
@maxLength(9)
param namePrefix string = 'atelier'

@description('Azure region. The DTG estate default is centralus.')
param location string = 'centralus'

@description('GitHub OIDC subject claim this identity trusts. One repo, one branch.')
param githubSubject string = 'repo:Dozier-Tech-Group/dtg-atelier:ref:refs/heads/master'

// Deterministic 13-char suffix keyed to the resource group — stable across
// redeploys, unique across the estate. Name budgets: Key Vault max 24 chars,
// storage account max 24 chars (lowercase alphanumeric only).
var suffix = uniqueString(resourceGroup().id)
var keyVaultName = 'kv-${take(namePrefix, 6)}-${suffix}' // 3 + 6 + 1 + 13 = 23
var storageAccountName = toLower('st${take(namePrefix, 9)}${suffix}') // 2 + 9 + 13 = 24
var identityName = 'id-${namePrefix}-github'

// ---------------------------------------------------------------------------
// Key Vault — holds deployer private keys and Firecrawl API keys.
// The repo holds pointers (secret names), never values.
// ---------------------------------------------------------------------------
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    // RBAC, not access policies. Grants live in Azure roles, auditable in one place.
    enableRbacAuthorization: true
    // Purge protection is permanent once on. A deleted secret sits in soft delete
    // for 90 days and nobody — not even an owner — can purge it early.
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
    // Public network access stays on for now so local `az keyvault secret show`
    // works without a private endpoint. Lock this down (private endpoint +
    // 'Disabled') once CI is the only consumer. Record the change in DTG-Infra
    // docs/ARCHITECTURE-MAP.md in the same PR.
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

// ---------------------------------------------------------------------------
// Storage account — one hosting option for frozen NFT metadata/images.
// NOTE: Bicep cannot enable the static website — it is a data-plane (blob
// service) setting, not an ARM property. Enable it post-deploy via CLI:
//   az storage blob service-properties update --static-website `
//     --account-name <name> --index-document index.html --auth-mode login
// deploy.ps1 prints this command after an -Apply run.
// ---------------------------------------------------------------------------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    // Anonymous *container/blob* access stays off. The static-website endpoint
    // ($web) serves content through its own web endpoint and does not need it.
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    accessTier: 'Hot'
  }
}

// ---------------------------------------------------------------------------
// User-assigned managed identity + GitHub OIDC federation.
// GitHub Actions on master exchanges its own token for an Azure token at
// runtime. No client secrets, nothing stored in GitHub, nothing to rotate.
// Role assignments are intentionally NOT declared here — scope decisions
// belong in DTG-Infra.
// ---------------------------------------------------------------------------
resource githubIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource githubFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: githubIdentity
  name: 'github-master'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: githubSubject
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// ---------------------------------------------------------------------------
// Outputs — names and IDs only. Never output a secret from a template.
// ---------------------------------------------------------------------------
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output storageAccountName string = storage.name
output staticWebsiteEndpoint string = storage.properties.primaryEndpoints.web
output githubIdentityClientId string = githubIdentity.properties.clientId
output githubIdentityPrincipalId string = githubIdentity.properties.principalId
