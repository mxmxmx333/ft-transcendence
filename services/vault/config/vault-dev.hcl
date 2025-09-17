ui = true
disable_mlock = false

storage "raft" {
  path    = "/vault/raft"
  node_id = "vault-dev"        # ok für Single-Node
}
# vault server
listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_disable   = 0
  tls_cert_file = "/vault/certs/vault-dev.crt"
  tls_key_file  = "/vault/certs/vault-dev.key"
  tls_client_ca_file                 = "/vault/certs/ca.crt"
  tls_require_and_verify_client_cert = "true"
}

# ui
listener "tcp" {
  address       = "127.0.0.1:8200"
  tls_disable   = 0
  tls_cert_file = "/vault/runtime-certs/vault-dev.crt"
  tls_key_file  = "/vault/runtime-certs/vault-dev.key"
  # kein tls_client_ca_file -> kein mTLS
}


api_addr     = "http://vault-dev:8200"

audit "file" {
  path    = "/vault/logs/audit.json"
  format  = "json"
  mode    = "0640"
  log_raw = false
}
