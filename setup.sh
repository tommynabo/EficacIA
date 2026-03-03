#!/bin/bash

# EficacIA Setup Script
# Este script configura todo lo necesario para ejecutar el proyecto

set -e

echo ""
echo "═══════════════════════════════════════"
echo "  EficacIA - Setup Script"
echo "═══════════════════════════════════════"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado"
    echo "   Descargarlo desde: https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js $(node -v)"

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm no está instalado"
    exit 1
fi

echo "✓ npm $(npm -v)"

# Instalar dependencias
echo ""
echo "📦 Instalando dependencias..."
npm install

# Verificar Redis
echo ""
echo "🔍 Verificando Redis..."
if ! command -v redis-cli &> /dev/null; then
    echo "⚠️  Redis no está instalado"
    echo ""
    echo "   Instala según tu sistema operativo:"
    echo "   macOS: brew install redis && brew services start redis"
    echo "   Linux: sudo apt-get install redis-server && sudo systemctl start redis-server"
    echo "   Docker: docker run -d -p 6379:6379 redis:7"
    echo ""
    echo "   Luego vuelve a ejecutar este script"
    exit 1
fi

# Probar conexión a Redis
if redis-cli ping &> /dev/null; then
    echo "✓ Redis está corriendo"
else
    echo "⚠️  Redis no está corriendo"
    echo "   Inicia Redis y vuelve a intentar"
    exit 1
fi

# Crear .env si no existe
echo ""
echo "⚙️  Configurando variables de entorno..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✓ Archivo .env creado"
    echo "  IMPORTANTE: Completa las credenciales en .env"
else
    echo "✓ Archivo .env ya existe"
fi

# Crear directorios necesarios
mkdir -p database
mkdir -p dist

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ Setup completado"
echo "═══════════════════════════════════════"
echo ""
echo "Próximos pasos:"
echo ""
echo "1. Completa las variables en .env:"
echo "   nano .env"
echo ""
echo "2. Configura Supabase:"
echo "   - Crea proyecto en supabase.com"
echo "   - Copia SUPABASE_URL y SUPABASE_KEY a .env"
echo "   - Ejecuta el SQL en database/schema.sql"
echo ""
echo "3. Obtén API keys:"
echo "   - Claude: console.anthropic.com"
echo "   - Stripe (opcional): stripe.com"
echo ""
echo "4. Inicia el desarrollo:"
echo "   npm run dev"
echo ""
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:3001"
echo ""
