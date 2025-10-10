# Agent Authentication
path "pki/issue/vault-clients-internal" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/approle/role/api-gateway-rotator/secret-id" {
  capabilities = ["update"]
}
path "auth/approle/role/api-gateway-rotator/role-id" {
  capabilities = ["read"]
}

# Root-CA
path "pki/ca/pem" {
  capabilities = ["read"]
}

# Service-Server cert
path "pki/issue/api-gateway-internal" {
  capabilities = ["update"]
}

# Service-Approle
path "auth/approle/role/api-gateway/secret-id" {
  capabilities = ["update"]
}
path "auth/approle/role/api-gateway/role-id" {
  capabilities = ["read"]
}

