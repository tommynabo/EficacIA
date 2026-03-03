# 🔑 Cómo Obtener LinkedIn Session Cookie

Para que el scraping funcione, necesitas la cookie de sesión de tu cuenta de LinkedIn. Aquí te muestro cómo obtenerla.

## Método 1: Desde DevTools (Recomendado)

### Paso 1: Abrir LinkedIn
1. Abre [linkedin.com](https://linkedin.com)
2. Asegúrate de estar logueado

### Paso 2: Abrir DevTools
- **Mac/Chrome/Firefox:** `Cmd + Option + I`
- **Windows/Chrome/Firefox:** `F12` o `Ctrl + Shift + I`

### Paso 3: Ir a Application/Storage
- En **Chrome:** Application → Cookies → linkedin.com
- En **Firefox:** Storage → Cookies → linkedin.com

### Paso 4: Buscar la cookie `li_at`
Busca una cookie con el nombre `li_at`. Verás algo como:

```
Name: li_at
Value: AQEDSzzZ...VFw
Path: /
Domain: .linkedin.com
Size: 1200 bytes
Expires/Max-Age: Thu, 03 Apr 2025 10:30:00 GMT
```

### Paso 5: Copiar el Value
Copia el **Value** completo (la parte que empieza con `AQEDSzzZ...`)

---

## Método 2: Desde Console

Ejecuta esto en la consola de DevTools mientras estés en LinkedIn:

```javascript
document.cookie
```

Busca en el resultado la cookie que contenga `li_at=`.

Extrae todo lo que esté entre `li_at=` y el siguiente `;`

---

## Método 3: Desde Network Tab

1. Abre DevTools → Network
2. Recarga la página
3. Busca una request a `www.linkedin.com`
4. Haz click en esa request
5. Ve a Headers → Request Headers
6. Busca `cookie:` y allí está `li_at=...`

---

## ⚠️ IMPORTANTE: Validez de la Cookie

- **Duración:** Típicamente 30 días desde que LinkedIn la emite
- **Cuando expira:** LinkedIn te pedirá que hagas login otras vez
- **Cómo detectar expiración:** El sistema mostrará error "LinkedIn session is invalid"

---

## 🔄 Renovar la Cookie

Cuando la cookie expire:

1. Abre LinkedIn en tu navegador
2. Asegúrate de que hagas login
3. Repite los pasos anteriores para obtener la nueva cookie
4. Actualiza en EficacIA: Dashboard → Cuentas → Editar → Pegar nueva cookie

---

## ⚙️ Usar la Cookie en EficacIA

### En el Dashboard (UI)

1. Ve a **Dashboard → Cuentas (o Conectar Cuenta)**
2. Pega la cookie en el campo de sesión
3. Haz click en "Conectar"
4. El sistema validará que sea válida

### Via API (Para testing)

```bash
curl -X POST http://localhost:3001/api/linkedin/accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <tu-jwt-token>" \
  -d '{
    "sessionCookie": "AQEDSzzZ...VFw",
    "proxyIp": "192.168.1.1"
  }'
```

---

## 🛡️ Seguridad: Sobre Proteger tu Cookie

- **NUNCA** compartas tu `li_at` en público
- **NUNCA** la subas a GitHub (aunque el .env está en .gitignore)
- La cookie se almacena encriptada en la BD de Supabase
- EficacIA **NUNCA** envia tu cookie a terceros
- Se usa SOLO para autenticarse con LinkedIn


---

## 🚨 Si Tienes Errores

### Error: "Session invalid or expired"

Significa que la cookie expiró. Solución:
1. Abre LinkedIn en tu navegador
2. Tu sesión será válida (sino, haz logout/login)
3. Extrae la nueva cookie
4. Actualiza en EficacIA

### Error: "Cannot connect to profile"

Puede ser:
- Cookie expirada → Renovar
- LinkedIn detectó actividad sospechosa → Esperar 24h
- Proxy mal configurado → Verificar IP

---

## 📊 Formato de la Cookie

Una cookie de LinkedIn `li_at` válida se ve así:

```
AQEDSzzZnKC-Y9OvWx2j5KvN-VdxYjRtXcE2FdkzZdKG2MqBzJ0NvAyzdZjZuqKc2W3eKjXcKjN-eKjXcKjN-eKjXcKjNKvN-Vd
```

- **Prefijo:** `AQEDSzzZ...` (variable)
- **Longitud:** ~500-1500 caracteres
- **Caracteres válidos:** a-z, A-Z, 0-9, -, _

---

## ⏱️ Periodicidad de Renovación

Aunque la cookie tenga 30 días de validez, LinkedIn puede:
- Revocarla por inactividad
- Revocarla si detecta actividad anómala
- Revocarla por cambio de contraseña

**Recomendación:** 
- Revisa cada 2 semanas si sigue funcio nando
- Si falla scraping, renueva la cookie
- Mantén el navegador con LinkedIn abierto (opcional)

---

**Última actualización:** 2026-03-03  
Para más soporte, ver SETUP.md o API_REFERENCE.md
