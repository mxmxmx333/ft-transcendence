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

path "auth/approle/role/game-service-rotator/secret-id" {
  capabilities = ["update"]
}
path "auth/approle/role/game-service-rotator/role-id" {
  capabilities = ["read"]
}

# Root-CA
path "pki/ca/pem" {
  capabilities = ["read"]
}

# Service-Server cert
path "pki/issue/game-service-internal" {
  capabilities = ["update"]
}

