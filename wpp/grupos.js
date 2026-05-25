// ============================================================
// SINCRONIZAÇÃO DE GRUPOS AGENDA — Allmax®2605222230
// ============================================================

export function extrairGrupoAgenda(nome, grupoId) {
  const nomeLimpo = String(nome || '').trim()

  if (!/^\d{3}/.test(nomeLimpo)) return null

  const comCota = nomeLimpo.match(/^(\d{3})-([A-Z]\d)\b/i)
  if (comCota) {
    return {
      pb: Number(comCota[1]),
      cota: comCota[2].toUpperCase(),
      nomeGrupoWpp: nomeLimpo,
      grupoWppId: grupoId
    }
  }

  const semCota = nomeLimpo.match(/^(\d{3})/)
  return {
    pb: Number(semCota[1]),
    cota: null,
    nomeGrupoWpp: nomeLimpo,
    grupoWppId: grupoId
  }
}

export async function sincronizarGruposAgenda(pool, sock, conectado) {
  if (!conectado || !sock) throw new Error('WhatsApp não conectado')

  const grupos = await sock.groupFetchAllParticipating()
  const client = await pool.connect()

  try {
    let inseridos = 0, atualizados = 0, ignorados = 0, removidos = 0
    const idsAtuais = []

    await client.query(`DROP INDEX IF EXISTS ux_wpp_grupos_agenda_pb_cota`)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_wpp_grupos_agenda_grupowppid
      ON public.wpp_grupos_agenda (grupowppid)
    `)

    for (const g of Object.values(grupos)) {
      const item = extrairGrupoAgenda(g.subject, g.id)
      if (!item) { ignorados++; continue }

      idsAtuais.push(item.grupoWppId)

      const rsExiste = await client.query(
        `SELECT id FROM public.wpp_grupos_agenda WHERE grupowppid = $1 LIMIT 1`,
        [item.grupoWppId]
      )

      if (rsExiste.rowCount === 0) {
        await client.query(
          `INSERT INTO public.wpp_grupos_agenda (pb, cota, nomegrupowpp, grupowppid, dataatualizacao)
           VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'America/Sao_Paulo')`,
          [item.pb, item.cota, item.nomeGrupoWpp, item.grupoWppId]
        )
        inseridos++
      } else {
        await client.query(
          `UPDATE public.wpp_grupos_agenda
              SET pb = $1, cota = $2, nomegrupowpp = $3,
                  dataatualizacao = NOW() AT TIME ZONE 'America/Sao_Paulo'
            WHERE grupowppid = $4`,
          [item.pb, item.cota, item.nomeGrupoWpp, item.grupoWppId]
        )
        atualizados++
      }
    }

    if (idsAtuais.length > 0) {
      const rsDelete = await client.query(
        `DELETE FROM public.wpp_grupos_agenda WHERE NOT (grupowppid = ANY($1::text[]))`,
        [idsAtuais]
      )
      removidos = rsDelete.rowCount
    }

    return { inseridos, atualizados, ignorados, removidos }

  } finally {
    client.release()
  }
}
