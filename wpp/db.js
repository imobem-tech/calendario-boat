// ============================================================
// HELPERS DE BANCO DE DADOS — Allmax®2605222230
// ============================================================

export async function buscarGrupoInfo(pool, grupoId) {
  const rs = await pool.query(
    `SELECT pb, cota FROM public.wpp_grupos_agenda WHERE grupowppid = $1 LIMIT 1`,
    [grupoId]
  )
  return rs.rowCount > 0 ? rs.rows[0] : null
}

export async function buscarAutorizado(pool, pb, cota) {
  if (!cota) {
    const rs = await pool.query(
      `SELECT "Cod_Pessoa" AS cod_pessoa, "Gropo_letra" AS gropo_letra
         FROM public."P_BOAT_4_Autorizados"
        WHERE "Cod_Embarcacao" = $1
          AND "Dt_Desautorizacao" IS NULL
          AND "Dt_Cancelamento" IS NULL
        ORDER BY "Código" DESC LIMIT 1`,
      [pb]
    )
    return rs.rowCount > 0 ? rs.rows[0] : null
  }

  const rs = await pool.query(
    `SELECT "Cod_Pessoa" AS cod_pessoa, "Gropo_letra" AS gropo_letra
       FROM public."P_BOAT_4_Autorizados"
      WHERE "Cod_Embarcacao" = $1
        AND UPPER("Gropo_letra") = UPPER($2)
        AND "Dt_Desautorizacao" IS NULL
        AND "Dt_Cancelamento" IS NULL
      LIMIT 1`,
    [pb, cota]
  )
  return rs.rowCount > 0 ? rs.rows[0] : null
}
