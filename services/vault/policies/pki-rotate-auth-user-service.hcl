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

path "auth/approle/role/auth-user-service-rotator/secret-id" {
  capabilities = ["update"]
}
path "auth/approle/role/auth-user-service-rotator/role-id" {
  capabilities = ["read"]
}

# Root-CA
path "pki/ca/pem" {
  capabilities = ["read"]
}

# Service-Server cert
path "pki/issue/auth-user-service-internal" {
  capabilities = ["update"]
}

# Service-Approle
path "auth/approle/role/auth-user-service/secret-id" {
  capabilities = ["update"]
}
path "auth/approle/role/auth-user-service/role-id" {
  capabilities = ["read"]
}

