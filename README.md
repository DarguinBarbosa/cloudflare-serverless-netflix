# Catálogo de Netflix serverless

Actividad sumativa de la Unidad 4 de Contenerización de Aplicaciones de Software. Cargo el dataset
[Netflix Movies and TV Shows](https://www.kaggle.com/datasets/shivamb/netflix-shows) de Kaggle en
Cloudflare D1, una base de datos SQL serverless, y lo consulto desde un Cloudflare Worker, que es una
función serverless.

## Qué hay en cada carpeta

| Archivo | Para qué sirve |
| --- | --- |
| `wrangler.jsonc` | Configuración del Worker y conexión con la base D1 (binding `DB`) |
| `db/schema.sql` | Script de la base de datos: crea la tabla `titles` con las 12 columnas del CSV |
| `scripts/csv_a_sql.mjs` | Convierte el CSV en `db/datos.sql`, con una instrucción INSERT por título |
| `src/index.js` | El Worker: la API que consulta D1 |
| `public/` | La interfaz web (HTML, CSS y JavaScript) |
| `data/` | Aquí copio `netflix_titles.csv` después de descargarlo |

## Rutas de la API

| Ruta | Respuesta |
| --- | --- |
| `GET /api/estadisticas` | Totales por tipo, títulos agregados por año y clasificaciones más frecuentes |
| `GET /api/titulos?pagina=1&tipo=Movie&q=texto` | 20 títulos por página, con filtro por tipo y por título |
| `GET /api/titulos/s1` | La ficha completa de un título, buscada por su `show_id` |

## Pasos, en el mismo orden del video

Requisito: Node.js 22 o superior (`node -v`).

```
npm install
npx wrangler login
npx wrangler whoami
```

1. Creo la base `unidad4` en el panel de Cloudflare (Storage & databases, D1 SQLite Database) y pego
   su Database ID en `wrangler.jsonc`, en lugar de `PEGO_AQUI_EL_DATABASE_ID`.
2. Creo la tabla:

   ```
   npx wrangler d1 execute unidad4 --remote --file=db/schema.sql --yes
   npx wrangler d1 execute unidad4 --remote --command="PRAGMA table_info(titles)"
   ```

3. Copio `netflix_titles.csv` en la carpeta `data`, genero el SQL y lo cargo:

   ```
   node scripts/csv_a_sql.mjs
   npx wrangler d1 execute unidad4 --remote --file=db/datos.sql --yes
   ```

4. Verifico que la carga quedó completa:

   ```
   npx wrangler d1 execute unidad4 --remote --command="SELECT COUNT(*) AS total FROM titles"
   npx wrangler d1 execute unidad4 --remote --command="SELECT type, COUNT(*) AS cantidad FROM titles GROUP BY type"
   npx wrangler d1 execute unidad4 --remote --command="SELECT COUNT(*) AS sin_director FROM titles WHERE director IS NULL"
   ```

5. Despliego y abro la dirección `workers.dev` que muestra la terminal:

   ```
   npx wrangler deploy
   ```

## Probar en mi computador antes de desplegar (opcional)

```
npx wrangler d1 execute unidad4 --local --file=db/schema.sql --yes
npx wrangler d1 execute unidad4 --local --file=db/datos.sql --yes
npx wrangler dev
```

La aplicación queda en http://localhost:8787 con una copia local de la base.
