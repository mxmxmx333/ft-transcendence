ui = true
disable_mlock = false

storage "raft" {
  path    = "/vault/raft"
  node_id = "vault-dev"
}

# Interner Listener mit mTLS (Docker-Netz)
listener "tcp" {
  address         = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  tls_disable     = 0
  tls_cert_file   = "/vault/certs/server.crt"
  tls_key_file    = "/vault/certs/server.key"
  tls_client_ca_file                 = "/vault/certs/ca.crt"
  tls_require_and_verify_client_cert = false
}

# Lokaler UI-Listener ohne mTLS (nur Host)
listener "tcp" {
  address       = "127.0.0.1:8202"
  tls_disable   = 0
  tls_cert_file = "/vault/certs/server.crt"
  tls_key_file  = "/vault/certs/server.key"
}

api_addr     = "https://vault-dev:8200"
cluster_addr = "https://vault-dev:8201"

audit "file" {
  path    = "/vault/logs/audit.json"
  format  = "json"
  mode    = "0640"
  log_raw = false
}

