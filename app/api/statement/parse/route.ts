// Ruta en desuso: la lectura de PDF ahora ocurre en el navegador (sin API externa). Se puede borrar este archivo.
export function POST() {
  return Response.json({ error: "Esta ruta ya no se usa." }, { status: 410 });
}
