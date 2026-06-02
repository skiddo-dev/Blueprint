#!/usr/bin/env sh
set -e

# Materialize Streamlit's auth secrets from environment variables at startup.
# This keeps the client secret / cookie secret OUT of the image and git — they
# live only in Azure app settings and are written to an ephemeral file here.
# (Streamlit native auth reads [auth] from .streamlit/secrets.toml specifically;
# everything else — MONGODB_URI, ADMIN_EMAILS, OPENAI_API_KEY, AZURE_* — is read
# directly from the environment by the app, so no file is needed for those.)
mkdir -p .streamlit
cat > .streamlit/secrets.toml <<EOF
[auth]
redirect_uri = "${AUTH_REDIRECT_URI}"
cookie_secret = "${AUTH_COOKIE_SECRET}"
client_id = "${AZURE_CLIENT_ID}"
client_secret = "${AZURE_CLIENT_SECRET}"
server_metadata_url = "https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration"
EOF

exec streamlit run main.py \
  --server.port="${PORT:-8501}" \
  --server.address=0.0.0.0 \
  --server.headless=true
