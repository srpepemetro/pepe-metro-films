export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pageId = url.searchParams.get('id');

  if (!pageId) {
    return new Response(JSON.stringify({ error: 'Missing id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = env.NOTION_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
      },
    });

    if (res.status === 404 || res.status === 403) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Notion error' }), { status: 502 });
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

    return new Response(JSON.stringify(project), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
