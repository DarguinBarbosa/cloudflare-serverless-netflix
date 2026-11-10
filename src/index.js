// Worker: la API que consulta la base D1. Cloudflare lo ejecuta solo cuando
// la ruta pedida no es un archivo de la carpeta public (en la práctica, /api/...).
const POR_PAGINA = 20;
const TIPOS = ["Movie", "TV Show"];
const COLUMNAS_LISTA =
  "show_id, type, title, country, date_added, release_year, rating, duration";

function json(datos, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// Patrón para LIKE: escapa % y _ y respeta el límite de 50 bytes de D1.
function patronLike(texto) {
  let q = texto.trim().slice(0, 30);
  const armar = (s) => `%${s.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  while (new TextEncoder().encode(armar(q)).length > 50) q = q.slice(0, -1);
  return armar(q);
}

async function listarTitulos(url, env) {
  const pagina = Math.max(1, parseInt(url.searchParams.get("pagina") ?? "1", 10) || 1);
  const tipo = url.searchParams.get("tipo");
  const q = (url.searchParams.get("q") ?? "").trim();

  const condiciones = [];
  const valores = [];
  if (TIPOS.includes(tipo)) {
    condiciones.push("type = ?");
    valores.push(tipo);
  }
  if (q) {
    condiciones.push("title LIKE ? ESCAPE '\\'");
    valores.push(patronLike(q));
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  // Las dos consultas viajan juntas a D1 en un solo batch.
  const [conteo, filas] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM titles ${where}`).bind(...valores),
    env.DB.prepare(
      `SELECT ${COLUMNAS_LISTA} FROM titles ${where}
       ORDER BY date_added IS NULL, date_added DESC, show_id
       LIMIT ? OFFSET ?`
    ).bind(...valores, POR_PAGINA, (pagina - 1) * POR_PAGINA),
  ]);

  const total = conteo.results[0].total;
  return json({
    pagina,
    porPagina: POR_PAGINA,
    total,
    totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
    resultados: filas.results,
  });
}

async function buscarPorId(id, env) {
  const titulo = await env.DB
    .prepare("SELECT * FROM titles WHERE show_id = ?")
    .bind(id)
    .first();
  return titulo
    ? json(titulo)
    : json({ error: `No existe un título con el ID ${id}` }, 404);
}

async function estadisticas(env) {
  const [porTipo, porAnio, porClasificacion] = await env.DB.batch([
    env.DB.prepare("SELECT type, COUNT(*) AS cantidad FROM titles GROUP BY type"),
    env.DB.prepare(
      `SELECT CAST(strftime('%Y', date_added) AS INTEGER) AS anio, COUNT(*) AS cantidad
       FROM titles WHERE date_added IS NOT NULL GROUP BY anio ORDER BY anio`
    ),
    env.DB.prepare(
      `SELECT rating, COUNT(*) AS cantidad FROM titles
       WHERE rating IS NOT NULL GROUP BY rating ORDER BY cantidad DESC LIMIT 8`
    ),
  ]);

  const cantidad = (t) => porTipo.results.find((r) => r.type === t)?.cantidad ?? 0;
  return json({
    total: porTipo.results.reduce((suma, r) => suma + r.cantidad, 0),
    peliculas: cantidad("Movie"),
    series: cantidad("TV Show"),
    porAnio: porAnio.results,
    porClasificacion: porClasificacion.results,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ruta = url.pathname;

    if (request.method !== "GET") {
      return json({ error: "Solo se aceptan peticiones GET" }, 405);
    }

    try {
      if (ruta === "/api/titulos") return await listarTitulos(url, env);

      const porId = ruta.match(/^\/api\/titulos\/([A-Za-z0-9]{1,20})$/);
      if (porId) return await buscarPorId(porId[1], env);

      if (ruta === "/api/estadisticas") return await estadisticas(env);

      return json({ error: "Ruta no encontrada" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "Error al consultar la base de datos" }, 500);
    }
  },
};
