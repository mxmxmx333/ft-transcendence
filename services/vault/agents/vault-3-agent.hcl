exit_after_auth = false

vault {
  address         = "https://vault-3:8200"
  tls_disable = false
  ca_cert     = "/vault/certs/ca.crt"
  client_cert = "/vault/certs/server.crt"
  client_key  = "/vault/certs/server.key"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/approle/role_id"
      secret_id_file_path = "/approle/secret_id"
      remove_secret_id_file_after_reading = false
    }
  }
  sink "file" { config = { path = "/run/vault/token" } }
}

template_config {
  static_secret_render_interval = "12h"
  exit_on_retry_failure = false
}

# Rotation der Agent Role SecretID
template {
  destination = "/approle/secret_id"
  perms = "0600"
  contents = <<EOH
{{- with secret "auth/approle/role/vault-node-3-rotator/secret-id" "metadata=agent=vault-3-agent" -}}
{{ .Data.secret_id }}
{{- end -}}
EOH
}

# Server-Zert + Key + CA
template {
  destination = "/vault/certs/server.crt"
  contents = <<EOH
{{- with secret "pki/issue/vault-node-internal" "common_name=vault-3" "alt_names=vault-3" "ttl=2160h" -}}
{{ .Data.certificate }}
{{ .Data.issuing_ca }}
{{- end -}}
EOH
  command = "/bin/sh -c 'kill -HUP 1 || true'"
  perms = "0644"
}

template {
  destination = "/vault/certs/server.key"
  contents = <<EOH
{{- with secret "pki/issue/vault-node-internal" "common_name=vault-3" "alt_names=vault-3" "ttl=2160h" -}}
{{ .Data.private_key }}
{{- end -}}
EOH
  perms = "0600"
}

template {
  destination = "/vault/certs/ca.crt"
  contents = <<EOH
{{- with secret "pki/issue/vault-node-internal" "common_name=vault-3" "alt_names=vault-3" "ttl=2160h" -}}
{{ .Data.issuing_ca }}
{{- end -}}
EOH
  perms = "0644"
}