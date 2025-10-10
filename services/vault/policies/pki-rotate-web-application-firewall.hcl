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

path "auth/approle/role/web-application-firewall-rotator/secret-id" {
  capabilities = ["update"]
}
path "auth/approle/role/web-application-firewall-rotator/role-id" {
  capabilities = ["read"]
}

# Root-CA
path "pki/ca/pem" {
  capabilities = ["read"]
}

# Service-Server cert
path "pki/issue/ft-transcendence" {
  capabilities = ["update"]
}
