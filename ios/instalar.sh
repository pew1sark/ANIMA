#!/usr/bin/env bash
# Genera el proyecto de Xcode y lo abre. Solo macOS.
set -euo pipefail
cd "$(dirname "$0")"
[[ "$(uname)" == "Darwin" ]] || { echo "Necesitas un Mac con Xcode 15+."; exit 1; }
command -v xcodebuild >/dev/null || { echo "Instala Xcode desde la App Store."; exit 1; }
command -v xcodegen >/dev/null || { echo "Instalando XcodeGen…"; brew install xcodegen; }
if [[ ! -f Config.xcconfig ]]; then
  cp Config.example.xcconfig Config.xcconfig
  echo "Creé Config.xcconfig. Complétalo (URL/clave de STAGING, Team ID, nombres) y vuelve a correr ./instalar.sh"
  exit 0
fi
grep -qE 'TU-PROYECTO|XXXXXXXXXX|tunombre' Config.xcconfig && { echo "Config.xcconfig aún tiene valores de ejemplo."; exit 1; }
xcodegen generate
open ANIMA.xcodeproj
echo "Listo. En Xcode: elige tu iPhone arriba, pulsa ▶ y confía en tu perfil en Ajustes → General → VPN y gestión de dispositivos."
