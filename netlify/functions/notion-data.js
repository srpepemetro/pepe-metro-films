const TX_DB        = 'da4e0b19ec444696be241775c6659bb9';
const PROYECTOS_DB = '78105918-71a1-4786-a0d6-e04e24fbc808';

exports.handler = async function () {
  const token = process.env.NOTION_TOKEN;
  if (!token) return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  const fetchAll = async (dbId, extra = {}) => {
    let all = [], cursor;
    do {
      const body = { page_size: 100, ...extra };
      if (cursor) body.start_cursor = cursor;
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      all = all.concat(data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return all;
  };

  try {
    const [txResults, projResults] = await Promise.all([
      fetchAll(TX_DB),
      fetchAll(PROYECTOS_DB, {
        filter: {
          and: [
            { property: 'Estado', select: { does_not_equal: 'Archivado' } },
            { property: 'Estado', select: { does_not_equal: 'Cancelado' } },
          ],
        },
        sorts: [{ property: 'Fecha de rodaje', direction: 'ascending' }],
      }).catch(() => []),
    ]);

    const transactions = txResults.map(page => {
      const p = page.properties;
      return {
        id:           page.id,
        fecha:        p['Fecha']?.date?.start ?? null,
        descripcion:  p['Descripción']?.title?.[0]?.plain_text ?? '',
        tipo:         p['Tipo']?.select?.name ?? '',
        categoria:    p['Categoría']?.select?.name ?? '',
        importe_neto: p['Bruto cobrado']?.number ?? p['Total €']?.formula?.number ?? 0,
        iva_pct:      p['IVA %']?.number ?? 0,
        iva_eur:      p['IVA €']?.formula?.number ?? 0,
        estado:       p['Estado']?.select?.name ?? '',
        ambito:       p['Ámbito']?.select?.name ?? 'Negocio',
      };
    }).filter(t => t.fecha);

    const projects = projResults.map(page => {
      const p = page.properties;
      return {
        id:            page.id,
        proyecto:      p['Proyecto']?.title?.[0]?.plain_text ?? '',
        tipo:          p['Tipo']?.select?.name ?? '',
        estado:        p['Estado']?.select?.name ?? '',
        fecha_rodaje:  p['Fecha de rodaje']?.date?.start ?? null,
        fecha_entrega: p['Fecha de entrega']?.date?.start ?? null,
        presupuesto:   p['Presupuesto']?.number ?? null,
      };
    }).filter(p => p.proyecto);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions, projects }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
