path "transit/verify/jwt-issuer" { capabilities = ["update"] }
path "transit/keys/jwt-issuer" { capabilities = ["read"] }

path "auth/token/lookup-self" { capabilities = ["read"] }
path "auth/token/renew-self" { capabilities = ["update"] }