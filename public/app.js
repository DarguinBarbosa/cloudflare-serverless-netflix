// Interfaz: pide los datos al Worker con fetch y los pinta. Nunca habla con la base directamente.
const $ = (id) => document.getElementById(id);
const numero = new Intl.NumberFormat("es-CO");
const estado = { pagina: 1, totalPaginas: 1, tipo: "", q: "" };

const ETIQUETAS = [
  ["show_id", "ID"], ["type", "Tipo"], ["director", "Director"], ["cast", "Reparto", true],
  ["country", "País"], ["date_added", "Agregado a Netflix"], ["release_year", "Año de estreno"],
  ["rating", "Clasificación"], ["duration", "Duración"], ["listed_in", "Géneros", true],
  ["description", "Descripción", true],
];

function esc(valor) {
  return String(valor).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const celda = (v) => (v === null || v === undefined || v === "" ? '<span class="vacio">Sin dato</span>' : esc(v));
const tipoEs = (t) => (t === "Movie" ? "Película" : "Serie");
const color = (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim();

async function api(ruta) {
  const respuesta = await fetch(ruta);
  const datos = await respuesta.json();
  if (!respuesta.ok) throw Object.assign(new Error(datos.error || "Error"), { estado: respuesta.status });
  return datos;
}

// Tarjetas y gráficas
async function cargarEstadisticas() {
  const e = await api("/api/estadisticas");
  const pct = (n) => `${((n / e.total) * 100).toFixed(1).replace(".", ",")} % del catálogo`;
  $("kpi-total").textContent = numero.format(e.total);
  $("kpi-peliculas").textContent = numero.format(e.peliculas);
  $("kpi-series").textContent = numero.format(e.series);
  $("kpi-peliculas-pct").textContent = pct(e.peliculas);
  $("kpi-series-pct").textContent = pct(e.series);

  const texto = color("--texto-suave");
  const rejilla = color("--borde");
  Chart.defaults.color = texto;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

  new Chart($("grafica-anios"), {
    type: "bar",
    data: {
      labels: e.porAnio.map((r) => r.anio),
      datasets: [{ label: "Títulos agregados", data: e.porAnio.map((r) => r.cantidad), backgroundColor: color("--acento"), borderRadius: 4 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${numero.format(c.raw)} títulos` } } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: rejilla }, ticks: { callback: (v) => numero.format(v) } } },
    },
  });

  new Chart($("grafica-tipos"), {
    type: "doughnut",
    data: {
      labels: ["Películas", "Series"],
      datasets: [{ data: [e.peliculas, e.series], backgroundColor: [color("--pelicula"), color("--serie")], borderColor: color("--superficie"), borderWidth: 3 }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (c) => `${c.label}: ${numero.format(c.raw)}` } } },
    },
  });

  const maximo = Math.max(...e.porClasificacion.map((r) => r.cantidad));
  $("lista-clasificaciones").innerHTML = e.porClasificacion.map((r) => `
    <li>
      <span>${esc(r.rating)}</span>
      <span class="pista"><span class="relleno" style="width:${(r.cantidad / maximo) * 100}%"></span></span>
      <span class="numero">${numero.format(r.cantidad)}</span>
    </li>`).join("");
}

// Tabla paginada
async function cargarTabla() {
  const parametros = new URLSearchParams({ pagina: estado.pagina });
  if (estado.tipo) parametros.set("tipo", estado.tipo);
  if (estado.q) parametros.set("q", estado.q);
  const cuerpo = $("cuerpo-tabla");
  cuerpo.innerHTML = '<tr><td colspan="8" class="vacio">Consultando…</td></tr>';

  try {
    const d = await api(`/api/titulos?${parametros}`);
    estado.totalPaginas = d.totalPaginas;
    cuerpo.innerHTML = d.resultados.length
      ? d.resultados.map((t) => `
        <tr data-id="${esc(t.show_id)}">
          <td><code>${esc(t.show_id)}</code></td>
          <td><span class="insignia ${t.type === "Movie" ? "Movie" : "TV"}">${tipoEs(t.type)}</span></td>
          <td class="titulo">${esc(t.title)}</td>
          <td>${celda(t.country?.split(",")[0])}</td>
          <td>${celda(t.date_added)}</td>
          <td>${celda(t.release_year)}</td>
          <td>${celda(t.rating)}</td>
          <td>${celda(t.duration)}</td>
        </tr>`).join("")
      : '<tr><td colspan="8" class="vacio">No hay títulos con ese filtro.</td></tr>';
    $("estado-pagina").textContent =
      `Página ${numero.format(d.pagina)} de ${numero.format(d.totalPaginas)} · ${numero.format(d.total)} títulos`;
  } catch (error) {
    cuerpo.innerHTML = `<tr><td colspan="8" class="aviso">${esc(error.message)}</td></tr>`;
  }
  $("btn-anterior").disabled = estado.pagina <= 1;
  $("btn-siguiente").disabled = estado.pagina >= estado.totalPaginas;
}

// Búsqueda por ID
async function buscarId(id) {
  const destino = $("resultado-id");
  destino.innerHTML = '<p class="vacio">Consultando…</p>';
  try {
    const t = await api(`/api/titulos/${encodeURIComponent(id)}`);
    destino.innerHTML = `
      <dl class="ficha">
        <div class="ancho"><dt>Título</dt><dd class="titulo-ficha">${esc(t.title)}</dd></div>
        ${ETIQUETAS.map(([clave, nombre, ancho]) => `
          <div class="${ancho ? "ancho" : ""}"><dt>${nombre}</dt>
          <dd>${clave === "type" ? tipoEs(t.type) : celda(t[clave])}</dd></div>`).join("")}
      </dl>`;
  } catch (error) {
    destino.innerHTML = `<p class="aviso">${esc(error.message)}</p>`;
  }
}

$("form-id").addEventListener("submit", (e) => {
  e.preventDefault();
  const id = $("campo-id").value.trim();
  if (id) buscarId(id);
});

$("form-filtros").addEventListener("submit", (e) => {
  e.preventDefault();
  estado.tipo = $("filtro-tipo").value;
  estado.q = $("filtro-titulo").value.trim();
  estado.pagina = 1;
  cargarTabla();
});

$("btn-anterior").addEventListener("click", () => { estado.pagina--; cargarTabla(); });
$("btn-siguiente").addEventListener("click", () => { estado.pagina++; cargarTabla(); });

$("cuerpo-tabla").addEventListener("click", (e) => {
  const fila = e.target.closest("tr[data-id]");
  if (!fila) return;
  $("campo-id").value = fila.dataset.id;
  buscarId(fila.dataset.id);
  $("seccion-id").scrollIntoView({ behavior: "smooth", block: "start" });
});

cargarEstadisticas().catch((error) => {
  $("kpi-total").textContent = "Error";
  console.error(error);
});
cargarTabla();
