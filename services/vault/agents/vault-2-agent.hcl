exit_after_auth = false

vault {
  address         = "https://vault-2:8200"
  tls_ca_cert     = "/vault/certs/ca.crt"
  tls_client_cert = "/vault/certs/server.crt"
  tls_client_key  = "/vault/certs/server.key"
}

auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path   = "/approle/role_id"
      secret_id_response_wrapping_path = "/approle/secret_id_wrapped"
      secret_id_file_path = "/approle/secret_id"
      remove_secret_id_file_after_reading = false
    }
  }
  sink "file" { config = { path = "/run/vault/token" } }
}

cache { use_auto_auth_token = true }

template_config {
  static_secret_render_interval = "12h"
  exit_on_retry_failure = false
}

# Rotation der Agent Role SecretID
template {
  destination = "/approle/secret_id"
  perms = "0600"
  contents = <<EOH
{{- with secret "auth/approle/role/vault-node-rotator/secret-id" "metadata=vault-2-agent" -}}
{{ .Data.secret_id }}
{{- end -}}
EOH
}

# Server-Zert + Key + CA
template {
  destination = "/vault/certs/server.crt"
  contents = <<EOH
{{- with secret "pki/issue/vault-node-internal" "common_name=vault-2" "alt_names=vault-2" "ttl=2160h" -}}
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
{{- with secret "pki/issue/vault-node-internal" "common_name=vault-2" "alt_names=vault-2" "ttl=2160h" -}}
{{ .Data.private_key }}
{{- end -}}
EOH
  perms = "0600"
}

template {
  destination = "/vault/certs/ca.crt"
  contents = "{{ with secret \"pki/ca/pem\" }}{{ .Data.certificate }}{{ end }}"
  perms = "0644"
}