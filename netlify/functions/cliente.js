exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const pageId = event.queryStringParameters?.id;
  if (!pageId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing id' }),
    };
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
      },
    });

    if (res.status === 404 || res.status === 403) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Not found' }),
      };
    }

    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Notion error' }) };
    }

    const page = await res.json();
    const p = page.properties;

    const project = {
      proyecto:        p['Proyecto']?.title?.[0]?.plain_text ?? '',
      tipo:            p['Tipo']?.select?.name ?? '',
      estado:          p['Estado']?.select?.name ?? '',
      fecha_rodaje:    p['Fecha de rodaje']?.date?.start ?? null,
      fecha_entrega:   p['Fecha de entrega']?.date?.start ?? null,
      localizacion:    p['Localización']?.url ?? null,
      link_entrega:    p['Link entrega']?.url ?? null,
      mensaje_cliente: p['Mensaje cliente']?.rich_text?.map(r => r.plain_text).join('') ?? '',
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(project),
    };
  } catch (err) {
    console.error('Cliente API error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
