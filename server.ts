import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;
const MODEL_ID = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

interface SimpleCategory {
  id: string;
  nombre: string;
  tipo: string;
  subcategorias: string[];
}

interface SimpleAccount {
  id: string;
  nombre: string;
}

interface SimpleMember {
  id: string;
  nombre: string;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(getGeminiClient()),
      model: MODEL_ID,
    });
  });

  // Fase 7 + OCR Tickets/Facturas (estilo Google Lens + lenguaje natural)
  app.post('/api/gemini/parse-movement', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Falta configurar la clave GEMINI_API_KEY en el servidor para usar el asistente y el OCR.',
      });
      return;
    }

    try {
      const body = req.body as {
        text?: string;
        imageBase64?: string;
        imageMimeType?: string;
        categories?: SimpleCategory[];
        accounts?: SimpleAccount[];
        members?: SimpleMember[];
        todayISO?: string;
      };

      const textInput = (body.text ?? '').trim();
      const imageBase64 = body.imageBase64?.trim();
      const imageMimeType = body.imageMimeType?.trim() || 'image/jpeg';

      if (!textInput && !imageBase64) {
        res.status(400).json({
          error: 'Envía una descripción en texto o una imagen del ticket/factura.',
        });
        return;
      }

      const categories = body.categories ?? [];
      const accounts = body.accounts ?? [];
      const members = body.members ?? [];
      const todayISO = body.todayISO || new Date().toISOString().slice(0, 10);

      const categoryCatalogText = categories
        .map(
          (c) =>
            `- id="${c.id}" | nombre="${c.nombre}" | tipo="${c.tipo}" | subcategorias=[${c.subcategorias.join(', ')}]`
        )
        .join('\n');

      const accountsText = accounts.map((a) => `- id="${a.id}" | nombre="${a.nombre}"`).join('\n');
      const membersText = members.map((m) => `- id="${m.id}" | nombre="${m.nombre}"`).join('\n');

      const systemInstruction = `Eres un asistente de clasificación contable y OCR para economía doméstica y fiscalidad española (catálogo COICOP INE).
Tu función es EXCLUSIVAMENTE extraer e interpretar movimientos económicos reales desde texto libre o imágenes de tickets/facturas (OCR visual de recibos españoles).
REGLAS ESTRICTAS:
1. Nunca inventes importes si no aparecen; si es un ticket borroso indica confianza "baja".
2. Asigna SIEMPRE un categoriaId exacto del catálogo proporcionado y una subcategoria válida de esa categoría.
3. Si el texto o ticket indica financiación a plazos (ej. "en 12 meses", "financiado", "mensualidades"), marca financiadoSugerido=true, indica mensualidadesSugeridas e importeTotalFinanciado.
4. Si parece un gasto profesional deducible para autónomos (ej. gestoría, luz/internet despacho, material técnico, RETA), marca esDeducibleAutonomo=true.
5. Usa fecha por defecto ${todayISO} si no consta fecha en el texto o ticket (interpreta "ayer", "el lunes", etc. respecto a ${todayISO}).
6. Si el usuario describe varios conceptos distintos (p. ej. dos tickets o dos gastos en la misma frase), devuelve varios elementos en "movements".`;

      const promptParts: Array<
        string | { inlineData: { data: string; mimeType: string } }
      > = [];

      if (imageBase64) {
        const cleanBase64 = imageBase64.includes(',')
          ? imageBase64.split(',')[1]
          : imageBase64;
        promptParts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: imageMimeType,
          },
        });
      }

      promptParts.push(
        `Analiza la entrada y extrae el/los movimiento(s) estructurados.
Fecha de referencia: ${todayISO}
Texto del usuario: ${textInput || '(Lectura OCR directa de la imagen adjunta)'}

Catálogo COICOP disponible:
${categoryCatalogText}

Cuentas disponibles:
${accountsText}

Miembros disponibles:
${membersText}`
      );

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: promptParts,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ocrTextoDetectado: {
                type: Type.STRING,
                description: 'Resumen breve del texto OCR leído en el ticket o factura si hay imagen',
              },
              movements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    tipo: {
                      type: Type.STRING,
                      enum: ['gasto', 'ingreso', 'transferencia', 'devolucion'],
                    },
                    importe: { type: Type.NUMBER },
                    fecha: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    concepto: { type: Type.STRING },
                    emisor: { type: Type.STRING },
                    categoriaId: { type: Type.STRING },
                    subcategoria: { type: Type.STRING },
                    cuentaId: { type: Type.STRING },
                    miembroId: { type: Type.STRING },
                    recurrencia: {
                      type: Type.STRING,
                      enum: ['puntual', 'mensual', 'trimestral', 'anual'],
                    },
                    esDeducibleAutonomo: { type: Type.BOOLEAN },
                    financiadoSugerido: { type: Type.BOOLEAN },
                    mensualidadesSugeridas: { type: Type.INTEGER },
                    confianza: {
                      type: Type.STRING,
                      enum: ['alta', 'media', 'baja'],
                    },
                    explicacion: { type: Type.STRING },
                  },
                  required: [
                    'tipo',
                    'importe',
                    'fecha',
                    'concepto',
                    'categoriaId',
                    'subcategoria',
                    'recurrencia',
                    'confianza',
                    'explicacion',
                  ],
                },
              },
            },
            required: ['movements'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{"movements":[]}');
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al procesar con Gemini';
      console.error('Error /api/gemini/parse-movement:', err);
      res.status(500).json({ error: message });
    }
  });

  // Rastreo de facturas recibidas en Gmail -> extracción estructurada para revisión previa
  app.post('/api/gemini/parse-email-invoice', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Falta configurar GEMINI_API_KEY para analizar facturas del correo.',
      });
      return;
    }

    try {
      const body = req.body as {
        subject?: string;
        from?: string;
        date?: string;
        bodyText?: string;
        categories?: SimpleCategory[];
        todayISO?: string;
      };

      const categories = body.categories ?? [];
      const categoryCatalogText = categories
        .filter((c) => c.tipo === 'gasto')
        .map(
          (c) =>
            `- id="${c.id}" | nombre="${c.nombre}" | subcategorias=[${c.subcategorias.join(', ')}]`
        )
        .join('\n');

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Analiza este correo electrónico recibido y determina si contiene una factura, recibo bancario o cargo real a pagar/pagado.
Remitente: ${body.from ?? ''}
Asunto: ${body.subject ?? ''}
Fecha correo: ${body.date ?? ''}
Contenido / fragmento:
${(body.bodyText ?? '').slice(0, 6000)}

Categorías COICOP de gasto disponibles:
${categoryCatalogText}`,
        config: {
          systemInstruction:
            'Extrae únicamente facturas/recibos reales (luz, agua, telefonía, compras, seguros, suscripciones, impuestos). Descarta newsletters, publicidad o notificaciones sin importe facturable (esFactura=false).',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              esFactura: { type: Type.BOOLEAN },
              emisor: { type: Type.STRING },
              numeroFactura: { type: Type.STRING },
              importe: { type: Type.NUMBER },
              fecha: { type: Type.STRING, description: 'YYYY-MM-DD' },
              concepto: { type: Type.STRING },
              categoriaId: { type: Type.STRING },
              subcategoria: { type: Type.STRING },
              esDeducibleAutonomo: { type: Type.BOOLEAN },
              resumen: { type: Type.STRING },
            },
            required: ['esFactura', 'emisor', 'importe', 'fecha', 'concepto', 'categoriaId', 'subcategoria', 'resumen'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{"esFactura":false}');
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error analizando factura de correo';
      console.error('Error /api/gemini/parse-email-invoice:', err);
      res.status(500).json({ error: message });
    }
  });

  // Explicación en lenguaje claro de cálculos deterministas (sin recalcular ni alterar cifras)
  app.post('/api/gemini/explain', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Falta configurar GEMINI_API_KEY para generar explicaciones.',
      });
      return;
    }

    try {
      const body = req.body as {
        topic?: string;
        deterministicSummary?: unknown;
      };

      const response = await ai.models.generateContent({
        model: MODEL_ID,
        contents: `Tema: ${body.topic ?? 'Análisis económico y fiscal'}
Resultados exactos calculados por el motor determinista (PROHIBIDO modificar o inventar cifras):
${JSON.stringify(body.deterministicSummary, null, 2)}`,
        config: {
          systemInstruction:
            'Explica en español claro, directo y estructurado (máximo 4 puntos breves) qué significan estos resultados deterministas para la economía del hogar. Cita exactamente las cifras proporcionadas sin recalcularlas ni inventar datos.',
        },
      });

      res.json({ explanation: response.text ?? '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error generando explicación';
      console.error('Error /api/gemini/explain:', err);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        if (url.startsWith('/api/')) {
          next();
          return;
        }
        const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const transformed = await vite.transformIndexHtml(url, indexHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (err) {
        next(err);
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Patrimonio & IRPF España server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
