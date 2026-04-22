const DB_ID = 'da4e0b19ec444696be241775c6659bb9';

exports.handler = async function () {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'NOTION_TOKEN not set' }) };
  }

  let allResults = [];
  let cursor = undefined;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return { statusCode: 502, body: JSON.stringify({ error: err }) };
    }

    const data = await res.json();
    allResults = allResults.concat(data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  const transactions = allResults.map(page => {
    const p = page.properties;
    return {
      id:           page.id,
      fecha:        p['Fecha']?.date?.start ?? null,
      descripcion:  p['Descripción']?.title?.[0]?.plain_text ?? '',
      tipo:         p['Tipo']?.select?.name ?? '',
      categoria:    p['Categoría']?.select?.name ?? '',
      importe_neto: p['Importe neto']?.number ?? 0,
      iva_pct:      p['IVA %']?.number ?? 0,
      iva_eur:      p['IVA €']?.formula?.number ?? 0,
      estado:       p['Estado']?.select?.name ?? '',
    };
  }).filter(t => t.fecha);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  };
};
