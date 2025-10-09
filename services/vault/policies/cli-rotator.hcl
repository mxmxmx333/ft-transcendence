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

path "auth/approle/role/cli-rotator/secret-id" {
  capabilities = ["update"]
}
path "auth/approle/role/cli-rotator/role-id" {
  capabilities = ["read"]
}

# Rotation / Rendering
path "pki/ca/pem" {
  capabilities = ["read"]
}

# Service-Server cert
path "pki/issue/cli-internal" {
  capabilities = ["update"]
}

