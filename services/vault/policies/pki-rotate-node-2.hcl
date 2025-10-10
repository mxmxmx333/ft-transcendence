# Agent Authentication
path "pki/issue/vault-node-internal" {
  capabilities = ["update"]
}

path "auth/token/lookup-self" {
  capabilities = ["read"]
}
path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/approle/role/vault-node-2-rotator/secret-id" {
  capabilities = ["update"]
}
path "auth/approle/role/vault-node-2-rotator/role-id" {
  capabilities = ["read"]
}

# Root-CA
path "pki/ca/pem" {
  capabilities = ["read"]
}

