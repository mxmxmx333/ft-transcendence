# -------- Agent-Login (für den Agent selbst) --------
exit_after_auth = false

auto_auth {
  method {
    type = "approle"
    mount_path = "auth/approle"
    config {
      role_id_file_path                 = "/approle/role_id"            # Agent-RoleID (Sidecar)
      secret_id_file_path               = "/approle/secret_id"          # Agent-SecretID (wird unten rotiert)
      remove_secret_id_file_after_reading = false
    }
  }
  sink { type = "file" config = { path = "/run/vault/token" } }
}

template_config {
  static_secret_render_interval = "12h"
  exit_on_retry_failure = false
}

vault {
  address         = "{{ env `VAULT_ADDR` }}"
  tls_disable = false
  ca_cert     = "/agent/certs/ca.crt"
  client_cert = "/agent/certs/client.crt"   # mTLS des Agents
  client_key  = "/agent/certs/client.key"
}

# AGENT SELF ROTATION
template {
  destination = "/approle/secret_id"
  perms = "0600"
  contents = <<EOH
{{- with secret (printf "auth/approle/role/%s/secret-id" (env "APPROLE_AGENT_NAME"))
               (printf "metadata=agent=%s-agent" (env "SERVICE_NAME")) -}}
{{ .Data.secret_id }}
{{- end -}}
EOH
}

template {
  destination = "/agent/certs/client.crt"
  perms = "0644"
  contents = <<EOH
{{- with secret (printf "pki/issue/%s" (env "PKI_ROLE_CLIENT"))
               (printf "common_name=%s-agent" (env "SERVICE_NAME"))
               "ttl=720h" -}}
{{- printf "%s\n" .Data.certificate -}}
{{- if .Data.ca_chain }}{{ range .Data.ca_chain }}{{ printf "%s\n" . }}{{ end }}{{ else }}{{ printf "%s\n" .Data.issuing_ca }}{{ end -}}
{{- end -}}
EOH
  command = "/bin/sh -c '/agent/hup/debounce_hup.sh' "
}

template {
  destination = "/agent/certs/client.key"
  perms = "0600"
  contents = <<EOH
{{- with secret (printf "pki/issue/%s" (env "PKI_ROLE_CLIENT"))
               (printf "common_name=%s-agent" (env "SERVICE_NAME"))
               "ttl=720h" -}}
{{- printf "%s\n" .Data.private_key -}}
{{- end -}}
EOH
  command = "/bin/sh -c '/agent/hup/debounce_hup.sh' "
}

# SERVICE ROTATIONS
template {
  destination = "/service/certs/server.crt"
  perms = "0644"
  contents = <<EOH
{{- $role := env "PKI_ROLE_SERVER" -}}
{{- $cn   := env "SERVICE_DNS" -}}
{{- $alt  := env "SERVICE_ALT_NAMES" -}}
{{- with secret (printf "pki/issue/%s" $role)
               (printf "common_name=%s" $cn)
               (printf "alt_names=%s"   $alt)
               "ttl=720h" -}}
{{- printf "%s\n" .Data.certificate -}}
{{- if .Data.ca_chain }}{{ range .Data.ca_chain }}{{ printf "%s\n" . }}{{ end }}{{ else }}{{ printf "%s\n" .Data.issuing_ca }}{{ end -}}
{{- end -}}
EOH
  command = "/bin/sh -c '/agent/hup/debounce_hup.sh' "
}

template {
  destination = "/service/certs/server.key"
  perms = "0600"
  contents = <<EOH
{{- $role := env "PKI_ROLE_SERVER" -}}
{{- $cn   := env "SERVICE_DNS" -}}
{{- $alt  := env "SERVICE_ALT_NAMES" -}}
{{- with secret (printf "pki/issue/%s" $role)
               (printf "common_name=%s" $cn)
               (printf "alt_names=%s"   $alt)
               "ttl=720h" -}}
{{- printf "%s\n" .Data.private_key -}}
{{- end -}}
EOH
  command = "/bin/sh -c '/agent/hup/debounce_hup.sh' "
}


# -------- Trust-Bundle (Agent) --------
template {
  destination = "/agent/certs/ca.crt"
  perms = "0644"
  contents = <<EOH
{{- with secret (printf "pki/issue/%s" (env "PKI_ROLE_CLIENT"))
               (printf "common_name=%s-agent" (env "SERVICE_NAME"))
               "ttl=72h" -}}
{{- if .Data.ca_chain }}{{ range .Data.ca_chain }}{{ printf "%s\n" . }}{{ end }}{{ else }}{{ printf "%s\n" .Data.issuing_ca }}{{ end -}}
{{- end -}}
EOH
  command = "/bin/sh -c '/agent/hup/debounce_hup.sh' "
}

# -------- Trust-Bundle (Service) --------
template {
  destination = "/service/certs/ca.crt"
  perms = "0644"
  contents = <<EOH
{{- with secret (printf "pki/issue/%s" (env "PKI_ROLE_SERVER"))
               (printf "common_name=%s" (env "SERVICE_DNS"))
               (printf "alt_names=%s" (env "SERVICE_ALT_NAMES"))
               "ttl=72h" -}}
{{- if .Data.ca_chain }}{{ range .Data.ca_chain }}{{ printf "%s\n" . }}{{ end }}{{ else }}{{ printf "%s\n" .Data.issuing_ca }}{{ end -}}
{{- end -}}
EOH
  command = "/bin/sh -c '/agent/hup/debounce_hup.sh' "
}