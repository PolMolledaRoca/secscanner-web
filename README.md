# secscanner-web

Plataforma completa para coordinar escaneos con el binario `secscanner` desde una interfaz web moderna. El backend en Express gestiona la cola de trabajos, ejecuta el binario y emite progreso en tiempo real mediante Socket.IO; el frontend en React (Vite + Bootstrap 5) consume la API y presenta los resultados con actualizaciones en vivo.

## Requisitos previos

- macOS o Linux con Node.js >= 18 y npm >= 9.
- Binario `secscanner` compilado y accesible. El backend intenta localizarlo en rutas cercanas (subcarpetas que contengan “secscanner”, incluidos builds); si no lo encuentra, define `SCANNER_BIN`.
- Puertos disponibles: `3001` para el backend y `5173` para el frontend en desarrollo.

## Instalación

```bash
cd secscanner-web/backend
npm install

cd ../frontend
npm install
```

## Ejecución en desarrollo

En una terminal:

```bash
cd secscanner-web/backend
npm run dev
```

En otra terminal:

```bash
cd secscanner-web/frontend
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173 (Vite proxya automáticamente las rutas `/api` y los websockets a `http://localhost:3001`).

## Configuración del backend

Las variables siguientes pueden definirse en un archivo `.env` dentro de `backend/`:

| Variable              | Descripción                                                                 | Valor por defecto              |
| --------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| `PORT`                | Puerto HTTP del backend.                                                    | `3001`                         |
| `MAX_PARALLEL_JOBS`   | Número máximo de procesos `secscanner` simultáneos.                         | `2`                            |
| `CORS_ORIGIN`         | Lista separada por comas de orígenes permitidos.                            | `http://localhost:5173`        |
| `SCANNER_BIN`         | Ruta absoluta o relativa al binario `secscanner`.                           | `../secscanner` (según runner) |
| `RATE_LIMIT_WINDOW_MS`| Ventana de rate limit en ms para `POST /api/scan`.                           | `60000`                        |
| `RATE_LIMIT_MAX`      | Número máximo de peticiones por ventana al crear escaneos.                  | `5`                            |

### Cambiar la ruta al binario `secscanner`

```bash
export SCANNER_BIN=/ruta/completa/a/secscanner
npm run dev
```

También puedes fijarlo en `backend/.env`:

```ini
SCANNER_BIN=../otros-binarios/secscanner
```

## Estructura del proyecto

```
secscanner-web/
├─ backend/
│  ├─ server.js            // Servidor Express + Socket.IO
│  ├─ src/api.js           // Rutas REST
│  ├─ src/jobs.js          // Cola en memoria y eventos
│  ├─ src/runner.js        // Invocación del binario secscanner
│  └─ src/utils.js         // Validaciones y utilidades
├─ frontend/
│  ├─ src/App.jsx          // Contenedor principal
│  ├─ src/components/      // ScanForm, ScanList, ResultView
│  └─ src/api.js           // Cliente REST + Socket.IO
└─ README.md
```

## Ejemplo de uso

### 1. Iniciar un escaneo con `curl`

```bash
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{
        "target": "scanme.nmap.org",
        "ports": "22,80,443",
        "timeout": 300,
        "maxWorkers": 32
      }'
```

Respuesta esperada:

```json
{
  "scan_id": "2a7d3e5e-0abb-4e32-9f53-aa4da4b2e7d5",
  "status": "queued",
  "queuedAt": "2024-05-08T12:34:56.789Z"
}
```

Puedes seguir el progreso directamente en la UI o consultar el estado puntual:

```bash
curl http://localhost:3001/api/scan/2a7d3e5e-0abb-4e32-9f53-aa4da4b2e7d5
```

Cuando termine, descarga el JSON consolidado:

```bash
curl -O http://localhost:3001/api/scan/2a7d3e5e-0abb-4e32-9f53-aa4da4b2e7d5/download
```

### 2. Capturas de la interfaz

- UI principal con formulario y lista de escaneos  
  `docs/screenshots/dashboard.png`
- Detalle de resultados con tabla de puertos abiertos  
  `docs/screenshots/resultados.png`

> Añade tus propias capturas en `docs/screenshots/` para documentar el estado actual de la UI.

## Scripts útiles

| Directorio | Comando             | Acción                                            |
| ---------- | ------------------- | ------------------------------------------------- |
| backend    | `npm run dev`       | Desarrollo con recarga (nodemon).                |
| backend    | `npm start`         | Ejecutar en modo producción (Node.js).           |
| backend    | `npm run lint`      | Comprobación rápida de sintaxis.                 |
| frontend   | `npm run dev`       | Servidor Vite + HMR.                             |
| frontend   | `npm run build`     | Build optimizada lista para despliegue.         |
| frontend   | `npm run preview`   | Servir la build producida en local.              |

## Buenas prácticas y seguridad

- **Ámbito autorizado**: Ejecuta los escaneos solo en redes y sistemas para los que tengas permiso expreso. Un uso indebido puede vulnerar leyes y políticas corporativas.
- **Limitador**: El endpoint `POST /api/scan` aplica rate limiting. Ajusta `RATE_LIMIT_MAX` y `RATE_LIMIT_WINDOW_MS` para endurecerlo en producción.
- **CORS/Origen**: Por defecto se acepta únicamente `http://localhost:5173`. Para exponer la API a otros dominios actualiza `CORS_ORIGIN` o añade un proxy inverso seguro.
- **Acceso local**: Las rutas de la API verifican que la petición provenga de `localhost`. Si necesitas abrirla a otros hosts, modifica explícitamente la lógica en `backend/src/api.js`.
- **Cola y concurrencia**: `MAX_PARALLEL_JOBS` protege al servidor de sobrecargas. Evalúa el impacto de subir el valor y monitoriza recursos.
- **Logs y resultados**: Los JSON se guardan en `backend/data/<scan_id>.json`. Limpia la carpeta periódicamente según tus políticas de retención.

## Despliegue

1. Genera la build del frontend:

   ```bash
   cd secscanner-web/frontend
   npm run build
   ```

2. Sirve el contenido de `frontend/dist` con tu servidor web preferido.
3. Ejecuta el backend con `npm start` (usa PM2/systemd para producción).
4. Configura `SCANNER_BIN`, `CORS_ORIGIN` y `MAX_PARALLEL_JOBS` acorde a tu entorno.

## Comandos rápidos

```bash
# 1. Instalar dependencias
cd secscanner-web/backend && npm install
cd ../frontend && npm install

# 2. Ejecutar servicios en modo desarrollo
cd secscanner-web/backend && npm run dev
cd ../frontend && npm run dev

# 3. Probar la API con curl
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{"target":"scanme.nmap.org","ports":"22,80,443","timeout":300,"maxWorkers":32}'
```

---

> ⚖️ **Aviso legal**: Esta herramienta es solo para fines educativos y de auditoría autorizada. Escanear sistemas sin consentimiento puede constituir un delito. El autor y los colaboradores no se responsabilizan por usos ilícitos.
