import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {
  Content,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 3000;
const MODEL_ID = 'gemini-4-hydrogen';
const FAST_MODEL_ID = 'gemini-3.1-flash-lite';
const TRANSCRIBE_MODEL_ID = 'gemini-3.5-transcribe';
const LIVE_MODEL_ID = 'gemini-3.8-live';

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

  // Asesor Fiscal y Económico multi-turno (sin modelos de pago: usa gemini-4-hydrogen + Google Search o gemini-3.1-flash-lite)
  app.post('/api/gemini/advisor-chat', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Falta configurar GEMINI_API_KEY en el servidor para consultar al Asesor Fiscal y Económico.',
      });
      return;
    }

    try {
      const body = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'model'; text: string }>;
        mode?: 'experto' | 'rapido';
        useSearch?: boolean;
        financialContext?: unknown;
      };

      const userMessage = (body.message ?? '').trim();
      if (!userMessage) {
        res.status(400).json({ error: 'Escribe una consulta económica o fiscal.' });
        return;
      }

      const mode = body.mode === 'rapido' ? 'rapido' : 'experto';
      const selectedModel = mode === 'rapido' ? FAST_MODEL_ID : MODEL_ID;
      const enableSearch = selectedModel === MODEL_ID && body.useSearch !== false;

      const contextJson = JSON.stringify(body.financialContext ?? {}, null, 2);
      const systemInstruction = `Eres un Asesor Fiscal y Economista Colegiado especializado en economía doméstica española, IRPF (Ley 35/2006 AEAT), presupuestos familiares COICOP, tesorería remunerada e hipotecas.
Tu misión es ANALIZAR y ASESORAR de forma práctica, empática y rigurosa para mejorar la salud financiera del usuario o de su unidad familiar.

REGLAS OBLIGATORIAS:
1. Responde siempre en español claro y accionable, estructurando con viñetas breves y pasos concretos.
2. NUNCA sustituyas ni recalcules de cero las cifras deterministas del motor: cita exactamente los datos reales del usuario proporcionados abajo (saldos, tasa de ahorro anual proyectada, presupuestos COICOP, cuota hipotecaria, comparativa IRPF Individual vs Conjunta, deducibilidad autónomos).
3. Detecta proactivamente oportunidades de mejora: categorías COICOP cerca o por encima del límite mensual, exceso de liquidez parada vs rentabilidad TAE/amortización anticipada de hipoteca, elección óptima entre tributación Individual vs Conjunta, aportaciones deducibles o gastos deducibles AEAT si es autónomo.
4. Si utilizas búsqueda en Google Search para normativa AEAT vigente, tipos de interés o ayudas actuales, resume el dato aplicable a España y no inventes legislación.
5. Incluye al final una breve nota orientativa recordando confirmar decisiones fiscales vinculantes ante la AEAT o asesoría colegiada cuando corresponda.

DATOS DETERMINISTAS ACTUALES DEL USUARIO (NO ALTERAR):
${contextJson}`;

      // Limpiar y asegurar historial alternante empezando por 'user'
      const rawHistory = Array.isArray(body.history) ? body.history : [];
      const sanitizedHistory: Content[] = [];
      for (const item of rawHistory) {
        const cleanText = (item?.text ?? '').trim();
        if (!cleanText) continue;
        const role = item.role === 'model' ? 'model' : 'user';
        if (sanitizedHistory.length === 0 && role !== 'user') continue;
        const last = sanitizedHistory[sanitizedHistory.length - 1];
        if (last && last.role === role) {
          last.parts = [{ text: `${last.parts?.[0]?.text ?? ''}\n${cleanText}` }];
        } else {
          sanitizedHistory.push({ role, parts: [{ text: cleanText }] });
        }
      }
      // Si el último elemento del historial es 'user', quitarlo o fusionar; la API espera terminar en 'model' antes de sendMessage
      if (
        sanitizedHistory.length > 0 &&
        sanitizedHistory[sanitizedHistory.length - 1].role === 'user'
      ) {
        sanitizedHistory.pop();
      }

      const chatConfig: Record<string, unknown> = {
        systemInstruction,
      };
      if (selectedModel === MODEL_ID) {
        chatConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
        if (enableSearch) {
          chatConfig.tools = [{ googleSearch: {} }];
        }
      }

      const chat = ai.chats.create({
        model: selectedModel,
        history: sanitizedHistory,
        config: chatConfig,
      });

      const response = await chat.sendMessage({ message: userMessage });
      const groundingChunks =
        response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const groundingSources: Array<{ title: string; uri: string }> = [];
      const seenUris = new Set<string>();
      for (const chunk of groundingChunks) {
        const web = (chunk as { web?: { uri?: string; title?: string } }).web;
        if (web?.uri && !seenUris.has(web.uri)) {
          seenUris.add(web.uri);
          groundingSources.push({
            title: web.title || web.uri,
            uri: web.uri,
          });
        }
      }

      res.json({
        reply: response.text ?? 'No se pudo generar una respuesta en este momento.',
        modelUsed: selectedModel,
        groundingSources,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error en el asesor fiscal y económico';
      console.error('Error /api/gemini/advisor-chat:', err);
      res.status(500).json({ error: message });
    }
  });

  // Transcripción de audio desde micrófono (gemini-3.5-transcribe)
  app.post('/api/gemini/transcribe', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Falta configurar GEMINI_API_KEY para transcribir audio.',
      });
      return;
    }

    try {
      const body = req.body as { audioBase64?: string; mimeType?: string };
      const rawAudio = (body.audioBase64 ?? '').trim();
      if (!rawAudio) {
        res.status(400).json({ error: 'No se recibió audio para transcribir.' });
        return;
      }

      const cleanBase64 = rawAudio.includes(',') ? rawAudio.split(',')[1] : rawAudio;
      const mimeType = (body.mimeType ?? 'audio/webm').split(';')[0].trim() || 'audio/webm';

      const response = await ai.models.generateContent({
        model: TRANSCRIBE_MODEL_ID,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: 'Transcribe fielmente este audio en español. Mantén con exactitud los importes en euros, porcentajes y términos financieros o fiscales sin añadir explicaciones adicionales.',
            },
          ],
        },
      });

      res.json({ transcript: (response.text ?? '').trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al transcribir el audio';
      console.error('Error /api/gemini/transcribe:', err);
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

  // Puente WebSocket para Conversación de Voz en Tiempo Real (gemini-3.8-live)
  const liveWss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/api/gemini/live')) {
      liveWss.handleUpgrade(request, socket, head, (ws) => {
        liveWss.emit('connection', ws, request);
      });
    }
  });

  liveWss.on('connection', (clientWs: WebSocket) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          error: 'Falta configurar GEMINI_API_KEY para iniciar la sesión de voz en directo.',
        })
      );
      clientWs.close();
      return;
    }

    let liveSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    let connecting = false;

    const startLiveSession = async (contextSummary: string) => {
      if (liveSession || connecting) return;
      connecting = true;
      try {
        const systemInstruction = `Eres un asesor fiscal y económico español cercano, claro y riguroso que conversa por voz en directo con el usuario.
Ayudas a mejorar su economía particular o familiar (IRPF Ley 35/2006, control de gastos COICOP, ahorro anual, hipoteca y liquidez).
Responde siempre en español natural, con explicaciones breves, concretas y directas aptas para conversación por voz.
Respeta estrictamente las cifras deterministas del usuario incluidas a continuación sin inventar otros saldos:
${contextSummary}`;

        liveSession = await ai.live.connect({
          model: LIVE_MODEL_ID,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction,
          },
          callbacks: {
            onopen: () => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'ready' }));
              }
            },
            onmessage: (message: LiveServerMessage) => {
              if (clientWs.readyState !== WebSocket.OPEN) return;
              const content = message.serverContent;
              if (content?.inputTranscription?.text) {
                clientWs.send(
                  JSON.stringify({
                    type: 'inputTranscript',
                    text: content.inputTranscription.text,
                  })
                );
              }
              if (content?.outputTranscription?.text) {
                clientWs.send(
                  JSON.stringify({
                    type: 'outputTranscript',
                    text: content.outputTranscription.text,
                  })
                );
              }
              for (const part of content?.modelTurn?.parts ?? []) {
                if (part.inlineData?.data) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'audio',
                      audio: part.inlineData.data,
                    })
                  );
                }
              }
              if (content?.interrupted) {
                clientWs.send(JSON.stringify({ type: 'interrupted' }));
              }
              if (content?.turnComplete) {
                clientWs.send(JSON.stringify({ type: 'turnComplete' }));
              }
            },
            onerror: (err) => {
              console.error('Gemini Live API error:', err);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(
                  JSON.stringify({
                    type: 'error',
                    error: 'Se produjo un error en la sesión de voz con Gemini Live.',
                  })
                );
              }
            },
            onclose: () => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'closed' }));
              }
            },
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo conectar con Gemini Live.';
        console.error('Error connecting Gemini Live:', err);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'error', error: msg }));
          clientWs.close();
        }
      } finally {
        connecting = false;
      }
    };

    clientWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          contextSummary?: string;
          audio?: string;
          text?: string;
        };

        if (msg.type === 'init') {
          void startLiveSession(msg.contextSummary ?? 'Sin contexto adicional.');
          return;
        }

        if (msg.type === 'audio' && msg.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
          return;
        }

        if (msg.type === 'text' && msg.text && liveSession) {
          liveSession.sendRealtimeInput({ text: msg.text });
        }
      } catch (err) {
        console.error('Error handling Live client WS message:', err);
      }
    });

    clientWs.on('close', () => {
      try {
        liveSession?.close();
      } catch {
        // Ignorar cierre si la sesión ya finalizó
      }
      liveSession = null;
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Patrimonio & IRPF España server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
