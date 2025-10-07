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

path "auth/approle/role/ai-opponent-rotator/secret-id" {
  capabilities = ["update"]
}
path "auth/approle/role/ai-opponent-rotator/role-id" {
  capabilities = ["read"]
}

# Rotation / Rendering
path "pki/ca/pem" {
  capabilities = ["read"]
}


