ui = true
disable_mlock = false

storage "raft" {
  path    = "/vault/raft"
  node_id = "vault-1"
}

listener "tcp" {
  address             = "0.0.0.0:8200"
  tls_disable         = 0
  tls_cert_file       = "/vault/certs/vault.crt"
  tls_key_file        = "/vault/certs/vault.key"
  tls_client_ca_file = "/vault/certs/ca.crt"  # für mTLS/Cluster
}

# Achte auf https:// und den Namen, der im Zertifikat steht:
api_addr     = "https://vault-dev:8200"
cluster_addr = "https://vault-dev:8201"

audit "file" {
  path    = "/vault/logs/audit.json"
  format  = "json"
  mode    = "0640"
  log_raw = false
}
