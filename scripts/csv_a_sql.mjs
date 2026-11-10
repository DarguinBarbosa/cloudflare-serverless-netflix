// Convierte data/netflix_titles.csv en db/datos.sql: una instrucción INSERT por título.
// Uso: node scripts/csv_a_sql.mjs [entrada.csv] [salida.sql]
import { readFileSync, writeFileSync } from "node:fs";

const entrada = process.argv[2] ?? "data/netflix_titles.csv";
const salida = process.argv[3] ?? "db/datos.sql";

const COLUMNAS = [
  "show_id", "type", "title", "director", "cast", "country",
  "date_added", "release_year", "rating", "duration", "listed_in", "description",
];
const MESES = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const LIMITE_INSTRUCCION = 100_000; // bytes por instrucción SQL en D1

function fallar(mensaje) {
  console.error(`Error: ${mensaje}`);
  process.exit(1);
}

// Lector de CSV (RFC 4180): comillas, comillas dobles escapadas y saltos de línea dentro de un campo.
function leerCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo); campo = "";
      if (fila.length > 1 || fila[0] !== "") filas.push(fila);
      fila = [];
    } else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  if (entreComillas) fallar("el archivo termina con unas comillas sin cerrar");
  return filas;
}

// "September 25, 2021" -> "2021-09-25"
function convertirFecha(valor, id) {
  const m = valor.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  const mes = m && MESES[m[1].toLowerCase()];
  if (!mes) fallar(`fecha no reconocida en ${id}: "${valor}"`);
  return `${m[3]}-${String(mes).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const texto = (() => {
  try { return readFileSync(entrada, "utf8").replace(/^﻿/, ""); }
  catch { return fallar(`no encuentro ${entrada}. Copio ahí el CSV descargado de Kaggle.`); }
})();

const [encabezado, ...filas] = leerCsv(texto);
if (encabezado.join(",") !== COLUMNAS.join(",")) {
  fallar(`el encabezado no coincide.\n  Esperado: ${COLUMNAS.join(",")}\n  Leído:    ${encabezado.join(",")}`);
}

const sqlTexto = (v) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
const columnasSql = COLUMNAS.map((c) => (c === "cast" ? '"cast"' : c)).join(", ");
const ids = new Set();
const resumen = { filas: 0, peliculas: 0, series: 0, fechas: 0, sinFecha: 0, sinDirector: 0 };
const instrucciones = [];

for (const [n, crudo] of filas.entries()) {
  if (crudo.length !== COLUMNAS.length) {
    fallar(`la fila ${n + 2} tiene ${crudo.length} columnas y deberían ser ${COLUMNAS.length}`);
  }
  const v = crudo.map((x) => (x.trim() === "" ? null : x.trim()));
  const [id, tipo, titulo, director] = v;

  if (!id) fallar(`la fila ${n + 2} no tiene show_id`);
  if (ids.has(id)) fallar(`show_id repetido: ${id}`);
  ids.add(id);
  if (tipo !== "Movie" && tipo !== "TV Show") fallar(`tipo inválido en ${id}: "${tipo}"`);
  if (!titulo) fallar(`${id} no tiene título`);

  const anio = Number(v[7]);
  if (!Number.isInteger(anio)) fallar(`release_year inválido en ${id}: "${v[7]}"`);

  if (v[6] === null) resumen.sinFecha++;
  else { v[6] = convertirFecha(v[6], id); resumen.fechas++; }

  resumen.filas++;
  if (tipo === "Movie") resumen.peliculas++; else resumen.series++;
  if (director === null) resumen.sinDirector++;

  const valores = v.map((x, i) => (i === 7 ? String(anio) : sqlTexto(x))).join(", ");
  const instruccion = `INSERT INTO titles (${columnasSql}) VALUES (${valores});`;
  if (Buffer.byteLength(instruccion) > LIMITE_INSTRUCCION) {
    fallar(`la instrucción de ${id} supera los 100 KB que permite D1`);
  }
  instrucciones.push(instruccion);
}

// Sin BEGIN ni COMMIT: la importación de D1 no los admite dentro del archivo.
writeFileSync(salida, instrucciones.join("\n") + "\n", "utf8");

console.log(`Archivo leído:        ${entrada}`);
console.log(`Filas leídas:         ${resumen.filas}`);
console.log(`  Películas:          ${resumen.peliculas}`);
console.log(`  Series:             ${resumen.series}`);
console.log(`Fechas convertidas:   ${resumen.fechas}`);
console.log(`Fechas vacías (NULL): ${resumen.sinFecha}`);
console.log(`Sin director (NULL):  ${resumen.sinDirector}`);
console.log(`Archivo generado:     ${salida} (${instrucciones.length} instrucciones INSERT)`);
