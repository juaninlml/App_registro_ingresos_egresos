# Mis Finanzas

App personal (Next.js + React + Neon Postgres) para llevar:

- **Tarjetas** (Santander y otros bancos): estados de cuenta, fechas límite, abonos y cargos a **meses sin intereses**.
- **Subir estado de cuenta en PDF**: se lee en tu propio navegador con OCR (sin enviar nada a servicios externos); revisas y confirmas antes de guardar. Pensado para estados de cuenta de Santander.
- **Pagos de tarjeta desde Movimientos**: la categoría «Pago de tarjeta» registra también el abono en la tarjeta elegida.
- **Proyección por corte** de lo que debes pagar antes de cada fecha límite.
- **Plan de abonos semanales** (cada lunes) con fecha estimada de liquidación.
- **Créditos personales** con tabla de amortización.
- **Ingresos y gastos** del día a día, por categoría.
- **Avisos** dentro de la app (pagos por vencer, plan insuficiente, estado de cuenta desactualizado).

Acceso solo con **Google Authenticator** (código de 6 dígitos). Sin contraseñas.

## Puesta en marcha

### 1. Base de datos (Neon)
1. En Vercel → tu proyecto → **Storage / Marketplace** → agrega **Neon** (plan gratis) y conéctalo al proyecto.  
   Vercel agrega solo `DATABASE_URL` (también se acepta `POSTGRES_URL`).
2. No necesitas crear tablas: la app crea la tabla `kv` sola la primera vez que se usa.

### 2. Variables de entorno en Vercel
| Variable | Valor |
|---|---|
| `SESSION_SECRET` | cadena aleatoria de 32+ caracteres (`openssl rand -base64 48`) |
| `SETUP_KEY` | clave temporal de 12+ caracteres, solo para el primer registro del Authenticator |

### 3. Deploy
Sube el repo a GitHub, impórtalo en Vercel y despliega (no requiere configuración extra).

### 4. Primer acceso
1. Abre `https://tu-app.vercel.app/setup`, escribe `SETUP_KEY`, escanea el QR con Google Authenticator y confirma con el código.
2. Después de configurarlo, `/setup` queda bloqueado. Puedes borrar `SETUP_KEY` de Vercel.
3. Entra en **Ajustes → Importar respaldo** y selecciona `datos-iniciales.json` (tus datos del Excel).

> Si pierdes el Authenticator: en el editor SQL de Neon ejecuta `DELETE FROM kv WHERE key = 'fin:auth:totp';` y repite el paso 4.

## Desarrollo local
```bash
cp .env.example .env.local   # rellena los valores
npm install
npm run dev
```

## Seguridad
- Código TOTP con protección contra reutilización y bloqueo tras intentos fallidos (por IP y global).
- Sesión en cookie `httpOnly`, `secure`, `sameSite=strict`; cada ruta de datos valida la sesión además del proxy.
- Cambiar `SESSION_SECRET` cierra todas las sesiones abiertas.
- No guardes números completos de tarjeta: solo los últimos 4 dígitos.
- `data-import/` está en `.gitignore`: tus datos personales no deben subirse al repositorio.

## Respaldo
**Ajustes → Descargar respaldo** genera un JSON con toda tu información.
