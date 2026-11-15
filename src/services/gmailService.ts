import { CategoryConfig } from '../types/economy';

export interface DetectedEmailInvoice {
  messageId: string;
  subject: string;
  from: string;
  dateISO: string;
  emisor: string;
  numeroFactura: string;
  importe: number;
  concepto: string;
  categoriaId: string;
  subcategoria: string;
  esDeducibleAutonomo: boolean;
  resumen: string;
  attachmentName?: string;
}

interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessageResponse {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailMessagePart[];
  };
}

function decodeBase64Url(base64Url: string): string {
  try {
    const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBodyAndAttachment(
  part: GmailMessagePart | undefined
): { text: string; attachmentName?: string } {
  if (!part) return { text: '' };

  let text = '';
  let attachmentName: string | undefined;

  if (part.filename && part.filename.trim().length > 0) {
    attachmentName = part.filename.trim();
  }

  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (part.mimeType === 'text/plain') {
      text += `\n${decoded}`;
    } else if (part.mimeType === 'text/html' && !text) {
      text += `\n${stripHtml(decoded)}`;
    }
  }

  if (Array.isArray(part.parts)) {
    for (const child of part.parts) {
      const sub = extractBodyAndAttachment(child);
      if (sub.text) text += `\n${sub.text}`;
      if (sub.attachmentName && !attachmentName) {
        attachmentName = sub.attachmentName;
      }
    }
  }

  return { text: text.trim(), attachmentName };
}

export async function scanGmailForInvoices(
  accessToken: string,
  categories: CategoryConfig[],
  processedMessageIds: Set<string>
): Promise<DetectedEmailInvoice[]> {
  const query = '(factura OR recibo OR invoice OR "tu factura" OR "importe a pagar") newer_than:60d';
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
    query
  )}&maxResults=10`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Gmail API error (${listRes.status}): ${errText}`);
  }

  const listJson = (await listRes.json()) as { messages?: { id: string }[] };
  const messageRefs = (listJson.messages ?? []).filter(
    (m) => !processedMessageIds.has(m.id)
  );

  if (messageRefs.length === 0) {
    return [];
  }

  const simpleCategories = categories
    .filter((c) => !c.oculta)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      subcategorias: c.subcategorias,
    }));

  const detected: DetectedEmailInvoice[] = [];

  for (const ref of messageRefs.slice(0, 8)) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${ref.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;

    const msg = (await msgRes.json()) as GmailMessageResponse;
    const headers = msg.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const subject = getHeader('Subject') || '(Sin asunto)';
    const from = getHeader('From') || 'Remitente desconocido';
    const dateRaw = getHeader('Date');
    const dateISO = msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const extracted = extractBodyAndAttachment(msg.payload);
    const bodyText = extracted.text || msg.snippet || '';

    const parseRes = await fetch('/api/gemini/parse-email-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        from,
        date: dateRaw || dateISO,
        bodyText,
        categories: simpleCategories,
        todayISO: new Date().toISOString().slice(0, 10),
      }),
    });

    if (!parseRes.ok) continue;
    const parsed = (await parseRes.json()) as {
      esFactura?: boolean;
      emisor?: string;
      numeroFactura?: string;
      importe?: number;
      fecha?: string;
      concepto?: string;
      categoriaId?: string;
      subcategoria?: string;
      esDeducibleAutonomo?: boolean;
      resumen?: string;
    };

    if (!parsed.esFactura || !parsed.importe || parsed.importe <= 0) {
      continue;
    }

    const validCat =
      categories.find((c) => c.id === parsed.categoriaId && c.tipo === 'gasto') ??
      categories.find((c) => c.id === 'cat-vivienda') ??
      categories[0];

    detected.push({
      messageId: msg.id,
      subject,
      from,
      dateISO: /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha ?? '') ? parsed.fecha! : dateISO,
      emisor: parsed.emisor || from,
      numeroFactura: parsed.numeroFactura || '',
      importe: Math.round(Number(parsed.importe) * 100) / 100,
      concepto: parsed.concepto || subject,
      categoriaId: validCat?.id ?? 'cat-extraordinarios',
      subcategoria: parsed.subcategoria || validCat?.subcategorias[0] || 'General',
      esDeducibleAutonomo: Boolean(parsed.esDeducibleAutonomo),
      resumen: parsed.resumen || msg.snippet || '',
      attachmentName: extracted.attachmentName,
    });
  }

  return detected;
}
