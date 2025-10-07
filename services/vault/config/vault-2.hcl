ui = true
disable_mlock = false

storage "raft" {
  path    = "/vault/raft"
  node_id = "vault-2"

  retry_join {
    leader_api_addr          = "https://vault-1:8200"
    leader_ca_cert_file      = "/vault/certs/ca.crt"
    leader_client_cert_file  = "/vault/certs/server.crt"
    leader_client_key_file   = "/vault/certs/server.key"
  }
}

listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_disable   = 0
  tls_cert_file = "/vault/certs/server.crt"
  tls_key_file  = "/vault/certs/server.key"
  tls_client_ca_file                 = "/vault/certs/ca.crt"
  tls_require_and_verify_client_cert = true
}

api_addr     = "https://vault-2:8200"
cluster_addr = "https://vault-2:8201"

audit "file" {
  path    = "/vault/logs/audit.json"
  format  = "json"
  mode    = "0640"
  log_raw = false
}

listener "tcp" {
  address  = "0.0.0.0:8300"
  tls_disable = 0
  tls_cert_file  = "/vault/certs/server.crt"
  tls_key_file   = "/vault/certs/server.key"
}