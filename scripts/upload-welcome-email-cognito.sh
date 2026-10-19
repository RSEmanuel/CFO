#!/usr/bin/env bash
# Sube docs/templates/welcome-email.html como mensaje de verificación del User Pool de Cognito.
#
# Uso: scripts/upload-welcome-email-cognito.sh           (plan: solo lee, no cambia nada)
#      scripts/upload-welcome-email-cognito.sh --apply   (aplica y verifica)
#
# La plantilla es del User Pool, no del app client: va por update-user-pool. Esa API regresa a su
# valor por defecto todo campo que no se mande (triggers, SES, MFA, políticas), así que el script
# parte de describe-user-pool, cambia solo VerificationMessageTemplate y al final compara que el
# resto quedó igual.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HTML_FILE="$ROOT/docs/templates/welcome-email.html"
SUBJECT_FILE="$ROOT/docs/templates/welcome-email.subject.txt"
WORK_DIR="/tmp/cifra-cognito"
APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

# Solo las credenciales de .env: nada de perfiles ni tokens de sesión heredados del shell.
unset AWS_PROFILE AWS_SESSION_TOKEN AWS_SECURITY_TOKEN
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a
export AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"

for var in COGNITO_USER_POOL_ID AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "✗ Falta $var en .env." >&2
    exit 1
  fi
done
if [[ ! -f "$HTML_FILE" || ! -f "$SUBJECT_FILE" ]]; then
  echo "✗ No existe la plantilla exportada. Corre: npm run email:export" >&2
  exit 1
fi
if ! grep -q '{####}' "$HTML_FILE"; then
  echo "✗ La plantilla no incluye {####}; Cognito la rechazaría." >&2
  exit 1
fi

HTML="$(cat "$HTML_FILE")"
SUBJECT="$(head -n 1 "$SUBJECT_FILE")"
mkdir -p "$WORK_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BEFORE="$WORK_DIR/user-pool-before-$STAMP.json"
INPUT="$WORK_DIR/update-input-$STAMP.json"
AFTER="$WORK_DIR/user-pool-after-$STAMP.json"

# run_aws <acción IAM> <args de aws>: corre aws y traduce los errores de permisos o credenciales.
run_aws() {
  local action="$1" out
  shift
  if ! out="$(aws "$@" 2>&1)"; then
    echo "✗ Falló: aws $1 $2" >&2
    echo "$out" | sed -E 's/(AKIA|ASIA)[A-Z0-9]{12,}/***/g' >&2
    if grep -qE 'AccessDenied|UnauthorizedOperation|not authorized' <<<"$out"; then
      echo "→ Al usuario IAM le falta el permiso $action sobre el User Pool $COGNITO_USER_POOL_ID." >&2
    elif grep -qE 'InvalidClientTokenId|SignatureDoesNotMatch|UnrecognizedClient|security token' <<<"$out"; then
      echo "→ Credenciales inválidas: revisa AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY en .env." >&2
    fi
    exit 1
  fi
  printf '%s' "$out"
}

IDENTITY="$(run_aws sts:GetCallerIdentity sts get-caller-identity --output json)"
echo "Cuenta AWS: $(jq -r .Account <<<"$IDENTITY") · identidad: $(jq -r .Arn <<<"$IDENTITY")"
echo "User Pool: $COGNITO_USER_POOL_ID ($AWS_DEFAULT_REGION)"

run_aws cognito-idp:DescribeUserPool cognito-idp describe-user-pool --user-pool-id "$COGNITO_USER_POOL_ID" --output json \
  | jq .UserPool >"$BEFORE"
echo "Respaldo de la configuración actual: $BEFORE"

# Llaves que acepta update-user-pool en esta versión del CLI.
ALLOWED="$(aws cognito-idp update-user-pool --generate-cli-skeleton input | jq -c 'keys')"

jq --argjson allowed "$ALLOWED" --arg html "$HTML" --arg subject "$SUBJECT" '
  . as $pool
  | (with_entries(select(.key as $k | $allowed | index($k))))
  # Los campos heredados EmailVerification* duplican la plantilla; se manda solo la nueva.
  | del(.EmailVerificationMessage, .EmailVerificationSubject)
  | .UserPoolId = $pool.Id
  | (if ($allowed | index("PoolName")) then .PoolName = $pool.Name else . end)
  # UnusedAccountValidityDays está obsoleto y choca con Policies.PasswordPolicy.TemporaryPasswordValidityDays.
  | (if .AdminCreateUserConfig then .AdminCreateUserConfig |= del(.UnusedAccountValidityDays) else . end)
  | .VerificationMessageTemplate = (($pool.VerificationMessageTemplate // {}) + {
      DefaultEmailOption: "CONFIRM_WITH_CODE",
      EmailSubject: $subject,
      EmailMessage: $html
    })
' "$BEFORE" >"$INPUT"

echo
echo "Cambio planeado (solo VerificationMessageTemplate):"
echo "  DefaultEmailOption: $(jq -r '.VerificationMessageTemplate.DefaultEmailOption // "—"' "$BEFORE") → CONFIRM_WITH_CODE"
echo "  EmailSubject: $(jq -r '.VerificationMessageTemplate.EmailSubject // "—"' "$BEFORE") → $SUBJECT"
echo "  EmailMessage: $(jq -r '.VerificationMessageTemplate.EmailMessage // "" | length' "$BEFORE") → ${#HTML} caracteres"
echo "  Campos que se reenvían sin cambio: $(jq -r '[keys[] | select(. != "VerificationMessageTemplate" and . != "UserPoolId")] | join(", ")' "$INPUT")"

if [[ "$APPLY" != true ]]; then
  echo
  echo "Nada se modificó. Para subir la plantilla corre con --apply"
  exit 0
fi

run_aws cognito-idp:UpdateUserPool cognito-idp update-user-pool --cli-input-json "file://$INPUT" >/dev/null
run_aws cognito-idp:DescribeUserPool cognito-idp describe-user-pool --user-pool-id "$COGNITO_USER_POOL_ID" --output json \
  | jq .UserPool >"$AFTER"

IGNORE='del(.LastModifiedDate, .VerificationMessageTemplate, .EmailVerificationMessage, .EmailVerificationSubject)'
if ! diff <(jq -S "$IGNORE" "$BEFORE") <(jq -S "$IGNORE" "$AFTER") >"$WORK_DIR/diff-$STAMP.txt"; then
  echo "✗ La plantilla se subió, pero cambiaron otros campos del User Pool:" >&2
  cat "$WORK_DIR/diff-$STAMP.txt" >&2
  echo "→ Respaldo para restaurar: $BEFORE" >&2
  exit 1
fi

UPLOADED="$(jq -r '.VerificationMessageTemplate.EmailMessage' "$AFTER")"
if [[ "$UPLOADED" != "$HTML" ]]; then
  echo "✗ El HTML guardado en Cognito no coincide con docs/templates/welcome-email.html." >&2
  exit 1
fi

echo
echo "✓ Plantilla subida correctamente a Cognito"
echo "  Asunto configurado: $(jq -r '.VerificationMessageTemplate.EmailSubject' "$AFTER")"
echo "  Primeros 200 caracteres: ${UPLOADED:0:200}"
echo "  Longitud total del HTML: ${#UPLOADED} caracteres"
echo "  El resto de la configuración del User Pool quedó igual."
