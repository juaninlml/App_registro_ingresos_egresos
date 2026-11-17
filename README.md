# Kakeibo · 家計簿 Finance Sync

App de finanzas personales (Next.js + Neon Postgres) basada en el método japonés **kakeibo**, pensada para **pocas personas** (hasta 10 cuentas): quien administra la app invita a los demás con un enlace, y **cada cuenta tiene sus datos separados**; nadie ve las finanzas de otra persona, ni siquiera quien administra.

## Qué hace
- **Tarjetas de débito** con su saldo real y **de crédito** con estados de cuenta, fechas límite, meses sin intereses y deuda real (incluye compras hechas después del corte).
- **Subir estado de cuenta en PDF**: se lee en tu navegador con OCR (nada se envía a servicios externos). Pensado para Santander.
- **Movimientos**: gastos, ingresos, pagos de tarjeta y transferencias entre tus cuentas; se pueden editar, buscar y exportar a CSV.
- **Gastos e ingresos fijos** (renta, suscripciones, sueldo) con aviso de lo que falta por pagar o cobrar.
- **Presupuesto por categoría y meta de ahorro**, y **cierre de mes** con las cuatro preguntas del kakeibo.
- **Plan de abonos semanales** y **créditos personales** con tabla de amortización.
- **Perfil** con nombre, foto y correo de recuperación.
- **Cuentas por invitación**: cada persona entra con su correo + Google Authenticator (sin contraseñas) y tiene sus **códigos de recuperación**.

---

## Invitar a otras personas
1. En **Ajustes → Cuentas → Invitar** escribe para quién es y toca **Invitar**.
2. Copia el enlace y mándaselo solo a esa persona. Sirve **una vez** y vence en **7 días**.
3. La persona abre el enlace, escribe su nombre y correo, escanea el QR con Google Authenticator y listo: entra a su propia cuenta, vacía.
4. Para quitar a alguien: **Ajustes → Cuentas →** ícono de basura. **Se borran todos sus datos** (no se puede deshacer).

Cada quien entra con **su correo + el código de su Authenticator**. Si varias personas usan el mismo teléfono, cada cuenta aparece en Google Authenticator con su correo.

> **Si ya usabas Kakeibo antes de que hubiera cuentas:** la primera vez que entres escribe tu correo y tu código de siempre. Tu cuenta queda registrada con ese correo como administradora y tus datos se quedan donde estaban.

## Tu propia copia en ~10 minutos

Necesitas una cuenta gratis de **GitHub** y una de **Vercel** (puedes entrar a Vercel con tu GitHub).

### 1. Crea tu copia
[![Desplegar en Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fjuaninlml%2FApp_registro_ingresos_egresos&project-name=kakeibo&repository-name=kakeibo&env=SESSION_SECRET,SETUP_KEY&envDescription=SESSION_SECRET%3A%20texto%20aleatorio%20de%2032%2B%20caracteres.%20SETUP_KEY%3A%20clave%20temporal%20de%2012%2B%20caracteres%20para%20el%20primer%20acceso.)

El botón copia el código a **tu** GitHub y crea **tu** proyecto en Vercel. Te pedirá dos variables:

| Variable | Qué poner |
|---|---|
| `SESSION_SECRET` | Un texto aleatorio de 32 caracteres o más. Genéralo con `openssl rand -base64 48` o con cualquier generador de contraseñas largas. **No lo compartas.** |
| `SETUP_KEY` | Una clave temporal de 12 caracteres o más, inventada por ti. Solo sirve para el primer acceso. |

> Hasta conectar la base de datos (paso 2), la app abre pero muestra «Error de configuración del servidor». Es normal.

### 2. Conecta tu base de datos (Neon)
1. En Vercel abre tu proyecto → pestaña **Storage** → **Create Database** → elige **Neon** (plan gratis) → **Connect** a este proyecto.
2. Vercel agrega sola la variable `DATABASE_URL`.
3. Ve a **Deployments** → en el último, menú **⋯** → **Redeploy**.

No tienes que crear tablas: la app las crea sola la primera vez.

### 3. Primer acceso
1. Abre `https://TU-PROYECTO.vercel.app/setup`, escribe tu `SETUP_KEY` y tu correo, escanea el QR con **Google Authenticator** y confirma con el código. Esta cuenta administra la app.
2. Entra a **Ajustes → Seguridad → Generar códigos** y guarda tus códigos de recuperación fuera del teléfono.
3. En **Perfil** pon tu nombre y foto.
4. Ya puedes borrar `SETUP_KEY` en Vercel (Settings → Environment Variables); `/setup` queda bloqueado de todos modos.

### Si pierdes el teléfono
En el login toca **«¿Perdiste tu teléfono?»**, entra con uno de tus códigos de recuperación y luego, en **Ajustes → Seguridad → Cambiar teléfono**, vincula el nuevo.
Sin códigos, quien administra puede quitar la cuenta y mandar una invitación nueva (se pierden los datos de esa cuenta). Si es la cuenta administradora, el último recurso es el editor SQL de Neon: borrar `fin:auth:totp` y `fin:auth:users` y repetir el paso 3 (los datos se conservan).

### Recibir mejoras
Tu copia es independiente. Para traer cambios nuevos de este repositorio, en tu GitHub abre tu copia → **Sync fork** (si la creaste como fork) o copia los cambios a mano. Tus datos no se tocan: viven en tu base, no en el código.

---

## Privacidad
- Cada cuenta guarda sus datos aparte (prefijo propio en la base); el servidor toma la cuenta de la sesión firmada, nunca de lo que mande el navegador.
- Quien administra solo ve el nombre y correo de cada cuenta, nunca sus finanzas.
- La foto de perfil se recorta y reduce en tu navegador y se guarda en tu base; no se sube a otros servicios.
- No guardes números completos de tarjeta: solo los últimos 4 dígitos.
- `data-import/` y `.env*` están en `.gitignore`: tus datos y secretos no deben subirse al repositorio.

## Seguridad
- Código TOTP con protección contra reutilización y bloqueo tras intentos fallidos (por IP y global).
- Códigos de recuperación de un solo uso guardados con scrypt (solo se ven una vez).
- Sesión en cookie `httpOnly` y `secure`; cada ruta de datos valida la sesión además del proxy.
- Cambiar `SESSION_SECRET` cierra todas las sesiones abiertas.

## Respaldo
**Ajustes → Descargar respaldo** genera un JSON con toda tu información (para restaurar con **Importar respaldo**). **Movimientos en CSV** sirve para abrirlos en Excel.

## Desarrollo local
```bash
cp .env.example .env.local   # rellena DATABASE_URL, SESSION_SECRET y SETUP_KEY
                             # sin Neon: DATABASE_URL=pglite:./.data/pg (Postgres local, solo desarrollo)
npm install
npm run dev
npm test                     # pruebas de los cálculos
```
