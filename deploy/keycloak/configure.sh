#!/usr/bin/env bash
# Post-start configuration of the Fabulka Keycloak. Idempotent: safe to re-run.
#
# Run on the server from /opt/fabulka-auth after `docker compose up -d` is healthy:
#   ./configure.sh
#
# Reads secrets from ./.env (never sources it) and hands them to kcadm only via
# environment variables and stdin, so they never show up in `ps` or in shell history.
#
# What it does:
#   1. replaces the temporary bootstrap admin with a permanent master admin (KC_ADMIN_*)
#   2. sets the secret of the OIDC client fabulka-web (KEYCLOAK_CLIENT_SECRET)
#   3. sets the Google identity provider client id/secret and the auto-link-by-email flow
#   4. sets the SMTP password (RESEND_API_KEY) when it is present
#   5. creates the realm roles of the admin and grants them, with 2FA: admin (everything) to
#      FABULKA_ADMINS, seo (the SEO section only) to FABULKA_SEO (comma-separated emails each).
#      What a role opens is ROLE_PERMISSIONS in packages/shared/src/admin-access.ts.
#   6. sets the realm's languages (supportedLocales, defaultLocale) from realm-fabulka.json, which
#      is imported only once, so a language added later reaches the live realm here
set -euo pipefail
cd "$(dirname "$0")"
umask 077

CONTAINER=${KC_CONTAINER:-fabulka-auth-keycloak-1}
REALM=fabulka
CFG=/tmp/kcadm-fabulka-configure.config
FLOW=fabulka-first-broker-login

[[ -f .env ]] || { echo "missing .env" >&2; exit 1; }

env_get() {
    local line
    line=$(grep -E "^$1=" .env | tail -n 1 || true)
    line=${line#*=}
    line=${line%\"}; line=${line#\"}
    printf '%s' "$line"
}

kc() { docker exec -i "$CONTAINER" /opt/keycloak/bin/kcadm.sh "$@" --config "$CFG"; }

kc_login() { # user, password (password goes through the environment, not argv)
    KC_CLI_PASSWORD="$2" docker exec -i -e KC_CLI_PASSWORD "$CONTAINER" \
        /opt/keycloak/bin/kcadm.sh config credentials --config "$CFG" \
        --server http://localhost:8080 --realm master --user "$1" >/dev/null 2>&1
}

json() { # build JSON from env vars: json KEY=ENVNAME ... ; nested keys with dots (config.clientId)
    python3 - "$@" <<'PY'
import json, os, sys
out = {}
for arg in sys.argv[1:]:
    key, env = arg.split("=", 1)
    node = out
    *parents, leaf = key.split(".")
    for p in parents:
        node = node.setdefault(p, {})
    node[leaf] = os.environ[env]  # Keycloak accepts "true"/"false" strings for booleans
print(json.dumps(out))
PY
}

cleanup() { docker exec "$CONTAINER" rm -f "$CFG" >/dev/null 2>&1 || true; }
trap cleanup EXIT

ADMIN_USER=$(env_get KC_ADMIN_USERNAME); ADMIN_USER=${ADMIN_USER:-fabulka-admin}
ADMIN_PASS=$(env_get KC_ADMIN_PASSWORD)
BOOT_USER=$(env_get KC_BOOTSTRAP_ADMIN_USERNAME); BOOT_USER=${BOOT_USER:-bootstrap-admin}
BOOT_PASS=$(env_get KC_BOOTSTRAP_ADMIN_PASSWORD)
[[ -n $ADMIN_PASS ]] || { echo "KC_ADMIN_PASSWORD is empty in .env" >&2; exit 1; }

# --- 1. permanent admin --------------------------------------------------------
if kc_login "$ADMIN_USER" "$ADMIN_PASS"; then
    echo "admin: logged in as $ADMIN_USER"
else
    kc_login "$BOOT_USER" "$BOOT_PASS" || { echo "cannot log in as $ADMIN_USER or $BOOT_USER" >&2; exit 1; }
    echo "admin: logged in as bootstrap admin, creating $ADMIN_USER"
    if [[ -z $(kc get users -r master -q exact=true -q username="$ADMIN_USER" --fields id --format csv --noquotes) ]]; then
        kc create users -r master -s username="$ADMIN_USER" -s enabled=true -s emailVerified=true >/dev/null
    fi
    uid=$(kc get users -r master -q exact=true -q username="$ADMIN_USER" --fields id --format csv --noquotes)
    P="$ADMIN_PASS" T=password F=false json type=T value=P temporary=F \
        | kc update "users/$uid/reset-password" -r master -f - >/dev/null
    kc add-roles -r master --uusername "$ADMIN_USER" --rolename admin >/dev/null
    kc_login "$ADMIN_USER" "$ADMIN_PASS" || { echo "new admin cannot log in" >&2; exit 1; }
fi
boot_id=$(kc get users -r master -q exact=true -q username="$BOOT_USER" --fields id --format csv --noquotes || true)
if [[ -n $boot_id && $BOOT_USER != "$ADMIN_USER" ]]; then
    kc delete "users/$boot_id" -r master
    echo "admin: deleted temporary bootstrap admin"
fi

# --- 2. client secret ------------------------------------------------------------
CLIENT_SECRET=$(env_get KEYCLOAK_CLIENT_SECRET)
cid=$(kc get clients -r "$REALM" -q clientId=fabulka-web --fields id --format csv --noquotes)
[[ -n $cid ]] || { echo "client fabulka-web not found (was the realm imported?)" >&2; exit 1; }
if [[ -n $CLIENT_SECRET ]]; then
    S="$CLIENT_SECRET" json secret=S | kc update "clients/$cid" -r "$REALM" --merge -f - >/dev/null
    echo "client: fabulka-web secret set"
fi

# --- 3. Google + first broker login flow ----------------------------------------
if ! kc get authentication/flows -r "$REALM" --fields alias --format csv --noquotes | grep -qx "$FLOW"; then
    kc create authentication/flows -r "$REALM" -s alias="$FLOW" -s providerId=basic-flow \
        -s topLevel=true -s builtIn=false \
        -s description="Google sign-in: review missing profile fields, create the user or link an existing one by email" >/dev/null
    kc create "authentication/flows/$FLOW/executions/execution" -r "$REALM" -s provider=idp-review-profile >/dev/null
    kc create "authentication/flows/$FLOW/executions/flow" -r "$REALM" -s alias=fabulka-user-creation-or-linking \
        -s type=basic-flow -s provider=registration-page-form >/dev/null
    kc create "authentication/flows/fabulka-user-creation-or-linking/executions/execution" -r "$REALM" -s provider=idp-create-user-if-unique >/dev/null
    kc create "authentication/flows/fabulka-user-creation-or-linking/executions/flow" -r "$REALM" -s alias=fabulka-link-by-email \
        -s type=basic-flow -s provider=registration-page-form >/dev/null
    kc create "authentication/flows/fabulka-link-by-email/executions/execution" -r "$REALM" -s provider=idp-detect-existing-broker-user >/dev/null
    kc create "authentication/flows/fabulka-link-by-email/executions/execution" -r "$REALM" -s provider=idp-auto-link >/dev/null

    # requirements: review REQUIRED (only missing fields), create-if-unique / link ALTERNATIVE,
    # detect + auto-link REQUIRED inside the link subflow
    kc get "authentication/flows/$FLOW/executions" -r "$REALM" | python3 -c '
import json, sys
want = {
    "idp-review-profile": "REQUIRED",
    "fabulka-user-creation-or-linking": "REQUIRED",
    "idp-create-user-if-unique": "ALTERNATIVE",
    "fabulka-link-by-email": "ALTERNATIVE",
    "idp-detect-existing-broker-user": "REQUIRED",
    "idp-auto-link": "REQUIRED",
}
for e in json.load(sys.stdin):
    key = e.get("providerId") if not e.get("authenticationFlow") else e.get("displayName")
    if key in want and e.get("requirement") != want[key]:
        e["requirement"] = want[key]
        print(json.dumps(e))
' | while IFS= read -r execution; do
        printf '%s' "$execution" | kc update "authentication/flows/$FLOW/executions" -r "$REALM" -f - >/dev/null
    done
    review_id=$(kc get "authentication/flows/$FLOW/executions" -r "$REALM" | python3 -c '
import json, sys
print(next(e["id"] for e in json.load(sys.stdin) if e.get("providerId") == "idp-review-profile"))')
    printf '%s' '{"alias":"fabulka-review-profile","config":{"update.profile.on.first.login":"missing"}}' \
        | kc create "authentication/executions/$review_id/config" -r "$REALM" -f - >/dev/null
    echo "flow: $FLOW created"
fi

GOOGLE_CLIENT_ID=$(env_get GOOGLE_CLIENT_ID)
GOOGLE_CLIENT_SECRET=$(env_get GOOGLE_CLIENT_SECRET)
if [[ -n $GOOGLE_CLIENT_ID && -n $GOOGLE_CLIENT_SECRET ]]; then
    kc get identity-provider/instances/google -r "$REALM" \
        | GID="$GOOGLE_CLIENT_ID" GSECRET="$GOOGLE_CLIENT_SECRET" FLOW="$FLOW" python3 -c '
import json, os, sys
idp = json.load(sys.stdin)
idp["firstBrokerLoginFlowAlias"] = os.environ["FLOW"]
idp["trustEmail"] = True
idp["config"]["clientId"] = os.environ["GID"]
idp["config"]["clientSecret"] = os.environ["GSECRET"]
idp["config"]["syncMode"] = "IMPORT"
print(json.dumps(idp))' \
        | kc update identity-provider/instances/google -r "$REALM" -f - >/dev/null
    echo "google: client id/secret set, first broker login = $FLOW"
else
    echo "google: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET empty, skipped" >&2
fi

# --- 4. SMTP (Resend) ------------------------------------------------------------
RESEND_API_KEY=$(env_get RESEND_API_KEY)
if [[ -n $RESEND_API_KEY ]]; then
    H=smtp.resend.com PORT=465 T=true F=false U=resend PW="$RESEND_API_KEY" \
    FROM=noreply@fabulka.com FROMN=Fabulka RT=hello@fabulka.com \
        json smtpServer.host=H smtpServer.port=PORT smtpServer.ssl=T smtpServer.starttls=F \
             smtpServer.auth=T smtpServer.user=U smtpServer.password=PW smtpServer.from=FROM \
             smtpServer.fromDisplayName=FROMN smtpServer.replyTo=RT smtpServer.replyToDisplayName=FROMN \
        | kc update "realms/$REALM" -f - >/dev/null
    echo "smtp: password set"
else
    echo "smtp: RESEND_API_KEY empty, SMTP stays without password (emails will fail)" >&2
fi

# --- 5. admin roles ----------------------------------------------------------------
# Holders of these realm roles get into fabulka.com/admin (each sees only the sections its role opens,
# ROLE_PERMISSIONS in packages/shared/src/admin-access.ts); each must set up an authenticator app.
# A new role: add it to ROLE_PERMISSIONS and a line below.
grant_role() { # role, description, comma-separated emails
    local role=$1 description=$2 emails=$3 user uid
    if ! kc get "realms/$REALM/roles/$role" >/dev/null 2>&1; then
        kc create "realms/$REALM/roles" -s "name=$role" -s "description=$description" >/dev/null
        echo "role: $role created"
    fi
    for user in $(printf '%s' "$emails" | tr ',' ' '); do
        uid=$(kc get "realms/$REALM/users" -q exact=true -q "email=$user" --fields id --format csv --noquotes | head -n 1)
        if [[ -z $uid ]]; then echo "$role: $user has not signed up yet, skipped" >&2; continue; fi
        kc add-roles -r "$REALM" --uid "$uid" --rolename "$role" >/dev/null
        if kc get "realms/$REALM/users/$uid/credentials" --fields type --format csv --noquotes | grep -qx otp; then
            echo "$role: role granted to $user (authenticator app already set up)"
        else
            kc update "realms/$REALM/users/$uid" -s 'requiredActions=["CONFIGURE_TOTP"]' >/dev/null
            echo "$role: role granted to $user, authenticator app required"
        fi
    done
}
grant_role admin 'Fabulka admin panel' "$(env_get FABULKA_ADMINS)"
grant_role seo 'Fabulka admin: SEO section only' "$(env_get FABULKA_SEO)"

# --- 6. languages ---------------------------------------------------------------
python3 -c '
import json
realm = json.load(open("realm-fabulka.json"))
print(json.dumps({k: realm[k] for k in ("internationalizationEnabled", "supportedLocales", "defaultLocale")}))
' | kc update "realms/$REALM" --merge -f - >/dev/null
echo "realm: languages $(python3 -c 'import json; print(",".join(json.load(open("realm-fabulka.json"))["supportedLocales"]))')"

echo "done"
