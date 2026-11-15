import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Globe,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RotateCcw,
  Scale,
  Send,
  ShieldCheck,
  Square,
  TrendingUp,
  Volume2,
} from 'lucide-react';
import { EconomySummaryResult } from '../engines/economyEngine';
import { COMUNIDADES_AUTONOMAS_LABELS, simulateIrpfComparison } from '../engines/irpfEngine';
import { simulateMortgageAndTreasury } from '../engines/mortgageEngine';
import { EconomyWorkspaceState, MainSection } from '../types/economy';
import { MortgageSimulationInput } from '../types/finance';
import { formatEUR, formatPct } from '../utils/formatters';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  groundingSources?: Array<{ title: string; uri: string }>;
  timestamp: string;
}

interface LiveTranscriptItem {
  id: string;
  speaker: 'usuario' | 'asesor';
  text: string;
}

interface FinancialAdvisorPanelProps {
  state: EconomyWorkspaceState;
  summary: EconomySummaryResult;
  effectiveMortgageInput: MortgageSimulationInput;
  irpfHabilitado: boolean;
  onNavigate: (sec: MainSection) => void;
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export const FinancialAdvisorPanel: React.FC<FinancialAdvisorPanelProps> = ({
  state,
  summary,
  effectiveMortgageInput,
  irpfHabilitado,
  onNavigate,
}) => {
  const [advisorTab, setAdvisorTab] = useState<'chat' | 'live'>('chat');
  const [advisorMode, setAdvisorMode] = useState<'experto' | 'rapido'>('experto');
  const [useSearch, setUseSearch] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Transcripción de audio desde micrófono (gemini-3.5-transcribe)
  const [recordingMic, setRecordingMic] = useState(false);
  const [transcribingMic, setTranscribingMic] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Conversación de voz en tiempo real (gemini-3.8-live)
  const [liveStatus, setLiveStatus] = useState<
    'idle' | 'connecting' | 'ready' | 'error'
  >('idle');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveTranscripts, setLiveTranscripts] = useState<LiveTranscriptItem[]>([]);
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isLiveReadyRef = useRef<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const irpfComparison = useMemo(
    () => simulateIrpfComparison(state.irpfInput),
    [state.irpfInput]
  );

  const mortgageSummary = useMemo(
    () => simulateMortgageAndTreasury(effectiveMortgageInput),
    [effectiveMortgageInput]
  );

  const actingMember = state.members.find((m) => m.id === state.actingMemberId);
  const ccaaLabel =
    COMUNIDADES_AUTONOMAS_LABELS[state.irpfInput.comunidadAutonoma] ??
    state.irpfInput.comunidadAutonoma;

  const overBudgetGoals = useMemo(
    () =>
      summary.monthlyBudgetGoals.filter(
        (g) => g.presupuestado > 0 && (g.pctUso >= 100 || g.superado > 0)
      ),
    [summary.monthlyBudgetGoals]
  );

  const nearBudgetGoals = useMemo(
    () =>
      summary.monthlyBudgetGoals.filter(
        (g) => g.presupuestado > 0 && g.pctUso >= 80 && g.pctUso < 100 && g.superado === 0
      ),
    [summary.monthlyBudgetGoals]
  );

  const financialContext = useMemo(
    () => ({
      modalidad: state.mode,
      usuarioOperando: actingMember
        ? `${actingMember.nombre} (${actingMember.rol}, ${actingMember.situacionActual ?? 'sin especificar'})`
        : 'Titular',
      comunidadAutonoma: ccaaLabel,
      periodoEvaluado: summary.periodRange.label,
      resumenEconomico: {
        ingresosPeriodo: summary.ingresosPeriodo,
        gastosPeriodo: summary.gastosPeriodo,
        ahorroNetoPeriodo: summary.ahorroNetoPeriodo,
        totalEnCuentas: summary.totalEnCuentas,
        totalReservadoFondos: summary.totalReservadoFondos,
        dineroRealmenteDisponible: summary.dineroRealmenteDisponible,
        tasaAhorroAnualProyectadaPct: Number(
          summary.projectedAnnualSavings.tasaAhorroAnualPct.toFixed(2)
        ),
        ahorroAnualProyectado: summary.projectedAnnualSavings.ahorroAnualProyectado,
        nivelSaludFinanciera: summary.projectedAnnualSavings.nivelSalud,
      },
      objetivosPresupuestoMesActual: summary.monthlyBudgetGoals
        .filter((g) => g.presupuestado > 0 || g.gastado > 0)
        .map((g) => ({
          categoria: g.category.nombre,
          gastadoMes: g.gastado,
          limiteMensual: g.presupuestado,
          pctUso: Number(g.pctUso.toFixed(1)),
          superado: g.superado,
        })),
      cuentas: summary.accountBalances.map((b) => ({
        nombre: b.account.nombre,
        tipo: b.account.tipo,
        saldoActual: b.saldoActual,
        taePct: b.account.taePct,
      })),
      hipotecaYTesoreria: {
        capitalPendiente: effectiveMortgageInput.capitalPendienteInicial,
        taeHipotecaPct: effectiveMortgageInput.tinPostCarencia,
        taeCuentaRemuneradaPct: effectiveMortgageInput.taeCuentaRemunerada,
        cuotaMensualEstimada: mortgageSummary.cuotaOrdinariaInicialPostCBP,
        fechaCancelacionExacta: mortgageSummary.fechaCancelacionExacta,
        ahorroInteresesBancarios: mortgageSummary.ahorroInteresesBancarios,
        totalDevolucionesAEAT: mortgageSummary.totalDevolucionesAEAT,
      },
      irpfAEAT: irpfHabilitado
        ? {
            tipoUnidadFamiliar: state.irpfInput.tipoUnidadFamiliar,
            modalidadOptima: irpfComparison.modalidadOptima,
            ahorroFiscalOptimoAnual: irpfComparison.ahorroFiscalOptimo,
            resultadoIndividualTotal: irpfComparison.sumaIndividualesResultado,
            resultadoConjunta: irpfComparison.conjunta.elegible
              ? irpfComparison.conjunta.resultadoDeclaracion
              : null,
            declarante1EsAutonomo: state.irpfInput.declarante1.esAutonomo,
            declarante1AportacionViviendaPre2013:
              state.irpfInput.declarante1.aportacionViviendaPre2013,
            advertenciasLegales: irpfComparison.advertenciasLegales,
          }
        : { nota: 'Perfil sin obligación o sin módulo IRPF activo.' },
    }),
    [
      state.mode,
      state.irpfInput,
      actingMember,
      ccaaLabel,
      summary,
      effectiveMortgageInput,
      mortgageSummary,
      irpfHabilitado,
      irpfComparison,
    ]
  );

  const liveContextText = useMemo(() => {
    return [
      `Perfil: ${state.mode === 'familiar' ? 'Unidad Familiar' : 'Personal'}, ${ccaaLabel}.`,
      `Saldo total cuentas: ${formatEUR(summary.totalEnCuentas)}, Disponible real: ${formatEUR(summary.dineroRealmenteDisponible)}, Reservado en fondos: ${formatEUR(summary.totalReservadoFondos)}.`,
      `Tasa ahorro anual proyectada: ${formatPct(summary.projectedAnnualSavings.tasaAhorroAnualPct)} (${formatEUR(summary.projectedAnnualSavings.ahorroAnualProyectado)}/año).`,
      `Categorías COICOP superadas este mes: ${overBudgetGoals.length}; cerca del límite (>=80%): ${nearBudgetGoals.length}.`,
      `Hipoteca pendiente: ${formatEUR(effectiveMortgageInput.capitalPendienteInicial)} al ${effectiveMortgageInput.tinPostCarencia}% TIN; Cuenta remunerada al ${effectiveMortgageInput.taeCuentaRemunerada}% TAE.`,
      irpfHabilitado
        ? `IRPF óptimo: ${irpfComparison.modalidadOptima.toUpperCase()} con ahorro de ${formatEUR(irpfComparison.ahorroFiscalOptimo)} frente a la alternativa (Individual total: ${formatEUR(irpfComparison.sumaIndividualesResultado)}).`
        : 'Módulo IRPF desactivado para este perfil.',
    ].join('\n');
  }, [
    state.mode,
    ccaaLabel,
    summary,
    overBudgetGoals.length,
    nearBudgetGoals.length,
    effectiveMortgageInput,
    irpfHabilitado,
    irpfComparison,
  ]);

  const stopLiveSession = () => {
    isLiveReadyRef.current = false;
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignorar si ya terminó
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignorar
      }
      processorRef.current = null;
    }

    if (liveStreamRef.current) {
      for (const t of liveStreamRef.current.getTracks()) {
        t.stop();
      }
      liveStreamRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      void inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      void outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }

    if (liveWsRef.current) {
      try {
        liveWsRef.current.close();
      } catch {
        // Ignorar
      }
      liveWsRef.current = null;
    }
    setLiveStatus('idle');
  };

  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        for (const t of micStreamRef.current.getTracks()) t.stop();
      }
      stopLiveSession();
    };
  }, []);

  const handleSendChat = async (customPrompt?: string) => {
    const query = (customPrompt ?? inputText).trim();
    if (!query || chatLoading) return;

    setChatError(null);
    const userMsg: ChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!customPrompt) setInputText('');
    setChatLoading(true);

    try {
      const response = await fetch('/api/gemini/advisor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          mode: advisorMode,
          useSearch: advisorMode === 'experto' ? useSearch : false,
          financialContext,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        reply?: string;
        modelUsed?: string;
        groundingSources?: Array<{ title: string; uri: string }>;
      };

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo obtener respuesta del asesor.');
      }

      const modelMsg: ChatMessage = {
        id: `msg-m-${Date.now()}`,
        role: 'model',
        text: data.reply || 'Sin respuesta disponible.',
        modelUsed: data.modelUsed,
        groundingSources: data.groundingSources,
        timestamp: new Date().toLocaleTimeString('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : 'Error al consultar con el asesor fiscal.'
      );
    } finally {
      setChatLoading(false);
    }
  };

  // Dictado de consulta mediante gemini-3.5-transcribe
  const handleToggleMicTranscribe = async () => {
    setChatError(null);
    if (recordingMic && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecordingMic(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setChatError('Tu navegador no permite acceso al micrófono para transcribir audio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      recordedChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        for (const t of stream.getTracks()) t.stop();
        micStreamRef.current = null;
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size === 0) return;

        setTranscribingMic(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = typeof reader.result === 'string' ? reader.result : '';
            const res = await fetch('/api/gemini/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: blob.type || 'audio/webm',
              }),
            });
            const data = (await res.json()) as { transcript?: string; error?: string };
            if (!res.ok) {
              throw new Error(data.error || 'Error transcribiendo el audio.');
            }
            if (data.transcript) {
              setInputText((prev) =>
                prev.trim() ? `${prev.trim()} ${data.transcript}` : data.transcript!
              );
            }
          } catch (err) {
            setChatError(
              err instanceof Error ? err.message : 'No se pudo transcribir la nota de voz.'
            );
          } finally {
            setTranscribingMic(false);
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setRecordingMic(true);
    } catch {
      setChatError('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    }
  };

  const playPcm24kChunk = (base64Audio: string) => {
    const ctx = outputAudioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const float32 = base64Pcm16ToFloat32(base64Audio);
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  };

  const appendLiveTranscript = (speaker: 'usuario' | 'asesor', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLiveTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text} ${trimmed}` },
        ];
      }
      return [
        ...prev,
        { id: `lt-${Date.now()}-${Math.random()}`, speaker, text: trimmed },
      ];
    });
  };

  // Conversación de voz en tiempo real mediante gemini-3.8-live
  const handleStartLiveVoice = async () => {
    if (liveStatus === 'connecting' || liveStatus === 'ready') return;
    setLiveError(null);
    setLiveTranscripts([]);
    setLiveStatus('connecting');

    if (!navigator.mediaDevices?.getUserMedia) {
      setLiveError('Tu navegador no soporta captura de micrófono en tiempo real.');
      setLiveStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      liveStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/api/gemini/live`);
      liveWsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'init',
            contextSummary: liveContextText,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type?: string;
            audio?: string;
            text?: string;
            error?: string;
          };

          if (msg.type === 'ready') {
            isLiveReadyRef.current = true;
            setLiveStatus('ready');

            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              if (
                !isLiveReadyRef.current ||
                !liveWsRef.current ||
                liveWsRef.current.readyState !== WebSocket.OPEN
              ) {
                return;
              }
              const pcmBase64 = float32ToPcm16Base64(e.inputBuffer.getChannelData(0));
              liveWsRef.current.send(
                JSON.stringify({ type: 'audio', audio: pcmBase64 })
              );
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
            return;
          }

          if (msg.type === 'audio' && msg.audio) {
            playPcm24kChunk(msg.audio);
            return;
          }

          if (msg.type === 'inputTranscript' && msg.text) {
            appendLiveTranscript('usuario', msg.text);
            return;
          }

          if (msg.type === 'outputTranscript' && msg.text) {
            appendLiveTranscript('asesor', msg.text);
            return;
          }

          if (msg.type === 'interrupted') {
            for (const src of activeSourcesRef.current) {
              try {
                src.stop();
              } catch {
                // Ignorar
              }
            }
            activeSourcesRef.current.clear();
            nextStartTimeRef.current = 0;
            return;
          }

          if (msg.type === 'error') {
            setLiveError(msg.error || 'Error en la sesión de voz en directo.');
            stopLiveSession();
            setLiveStatus('error');
            return;
          }

          if (msg.type === 'closed') {
            stopLiveSession();
          }
        } catch {
          // Ignorar mensaje malformado
        }
      };

      ws.onerror = () => {
        setLiveError('No se pudo establecer conexión WebSocket con el asesor de voz.');
        stopLiveSession();
        setLiveStatus('error');
      };

      ws.onclose = () => {
        if (isLiveReadyRef.current) {
          stopLiveSession();
        }
      };
    } catch {
      setLiveError('No se pudo iniciar el micrófono o la sesión de audio en tiempo real.');
      stopLiveSession();
      setLiveStatus('error');
    }
  };

  const quickPrompts = [
    '¿Me conviene tributar Individual o Conjunta en el IRPF según mis datos actuales?',
    'Analiza mi tasa de ahorro anual proyectada y dime en qué categorías COICOP puedo recortar gasto.',
    '¿Me compensa amortizar hipoteca anticipadamente o dejar el efectivo en la cuenta remunerada?',
    'Busca las deducciones fiscales vigentes en 2026 en mi Comunidad Autónoma aplicables a mi perfil.',
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Columna izquierda: Diagnóstico determinista en tiempo real que alimenta al asesor */}
      <aside className="space-y-4 lg:col-span-4">
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Asesor Fiscal y Económico
              </h1>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                Orientación experta sobre tus cifras reales sin alterar los cálculos del motor determinista.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Territorio fiscal</span>
              <span className="font-semibold text-slate-900 dark:text-white">{ccaaLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Liquidez real</span>
              <span className="font-mono font-bold tabular-nums text-blue-700 dark:text-blue-400">
                {formatEUR(summary.dineroRealmenteDisponible)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Tasa ahorro anual est.</span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  summary.projectedAnnualSavings.tasaAhorroAnualPct >= 20
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : summary.projectedAnnualSavings.tasaAhorroAnualPct >= 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-red-700 dark:text-red-400'
                }`}
              >
                {formatPct(summary.projectedAnnualSavings.tasaAhorroAnualPct)}
              </span>
            </div>
            {irpfHabilitado && (
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">IRPF óptimo estimado</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {irpfComparison.modalidadOptima === 'conjunta' ? 'Conjunta' : 'Individual'} (
                  {formatEUR(irpfComparison.ahorroFiscalOptimo)} ahorro)
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Presupuestos mes</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                {overBudgetGoals.length} superados · {nearBudgetGoals.length} alerta
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onNavigate('cuentas')}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Ver Objetivos COICOP
            </button>
            {irpfHabilitado && (
              <button
                type="button"
                onClick={() => onNavigate('irpf')}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Abrir Simulador IRPF
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('hipoteca')}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Ver Hipoteca
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
            Motores activos (nivel estándar sin coste adicional)
          </div>
          <ul className="mt-2.5 space-y-1.5">
            <li>• Consultas fiscales y búsqueda web: Gemini 4 Hydrogen + Google Search</li>
            <li>• Respuestas rápidas: Gemini 3.1 Flash Lite</li>
            <li>• Dictado de voz a texto: Gemini 3.5 Transcribe</li>
            <li>• Conversación de voz en directo: Gemini 3.8 Live</li>
          </ul>
          <p className="mt-3 border-t border-slate-200 pt-2.5 text-slate-500 dark:border-slate-800">
            Los modelos de pago avanzado (Gemini 4 Carbon y Argon) permanecen pospuestos hasta finalizar las pruebas de la aplicación.
          </p>
        </section>
      </aside>

      {/* Columna derecha: Chat Multi-turno + Búsqueda + Transcripción y Voz en Directo */}
      <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-8 dark:border-slate-800 dark:bg-slate-900">
        {/* Cabecera de modos */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                stopLiveSession();
                setAdvisorTab('chat');
              }}
              className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                advisorTab === 'chat'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              Chat Experto y Búsqueda
            </button>
            <button
              type="button"
              onClick={() => setAdvisorTab('live')}
              className={`inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                advisorTab === 'live'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <Phone className="h-4 w-4" />
              Voz en Tiempo Real
            </button>
          </div>

          {advisorTab === 'chat' && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={advisorMode}
                onChange={(e) =>
                  setAdvisorMode(e.target.value as 'experto' | 'rapido')
                }
                aria-label="Modo del asesor"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="experto">Análisis Fiscal Experto (Hydrogen)</option>
                <option value="rapido">Consulta Rápida (Flash Lite)</option>
              </select>

              {advisorMode === 'experto' && (
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={useSearch}
                    onChange={(e) => setUseSearch(e.target.checked)}
                  />
                  <Globe className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
                  Búsqueda Google AEAT
                </label>
              )}

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setChatError(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reiniciar hilo
                </button>
              )}
            </div>
          )}
        </div>

        {advisorTab === 'chat' ? (
          <>
            {/* Hilo desplazable de conversación multi-turno */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5" style={{ minHeight: '420px', maxHeight: '560px' }}>
              {messages.length === 0 ? (
                <div className="space-y-5 py-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                      <TrendingUp className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                      Consulta sobre tu economía particular o familiar
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      El asesor conoce automáticamente tu supuesto activo ({ccaaLabel}, tasa de ahorro proyectada de{' '}
                      <span className="font-mono font-semibold tabular-nums">
                        {formatPct(summary.projectedAnnualSavings.tasaAhorroAnualPct)}
                      </span>
                      , presupuestos COICOP, hipoteca y comparativa IRPF) y puede contrastar normativa vigente en Google Search.
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Preguntas recomendadas para empezar
                    </p>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {quickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => void handleSendChat(prompt)}
                          className="rounded-xl border border-slate-200 bg-white p-3.5 text-left text-sm font-medium text-slate-800 transition-colors hover:border-blue-300 hover:bg-blue-50/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-700 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-100'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-4 text-xs opacity-75">
                        <span className="font-semibold">
                          {msg.role === 'user'
                            ? 'Tú'
                            : `Asesor Fiscal · ${msg.modelUsed ?? 'Gemini'}`}
                        </span>
                        <span className="font-mono tabular-nums">{msg.timestamp}</span>
                      </div>
                      <div className="whitespace-pre-wrap">{msg.text}</div>

                      {msg.groundingSources && msg.groundingSources.length > 0 && (
                        <div className="mt-3 border-t border-slate-200 pt-2.5 dark:border-slate-700">
                          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <Globe className="h-3.5 w-3.5" />
                            Fuentes consultadas en Google Search:
                          </p>
                          <ul className="space-y-1 text-xs">
                            {msg.groundingSources.map((src) => (
                              <li key={src.uri}>
                                <a
                                  href={src.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-700 hover:underline dark:text-blue-400"
                                >
                                  <span className="truncate max-w-md">{src.title}</span>
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analizando tus datos económicos y normativa fiscal...
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {chatError && (
              <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{chatError}</span>
              </div>
            )}

            {/* Barra de entrada con dictado de audio (gemini-3.5-transcribe) */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendChat();
              }}
              className="border-t border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40"
            >
              <div className="flex flex-wrap items-end gap-2.5">
                <textarea
                  rows={2}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendChat();
                    }
                  }}
                  placeholder="Escribe o dicta tu pregunta fiscal/financiera (ej. '¿Cómo reduzco mi cuota de IRPF este año?')"
                  className="min-w-[240px] flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />

                <button
                  type="button"
                  onClick={() => void handleToggleMicTranscribe()}
                  disabled={transcribingMic || chatLoading}
                  title={
                    recordingMic
                      ? 'Detener grabación y transcribir'
                      : 'Dictar consulta por micrófono (Gemini 3.5 Transcribe)'
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    recordingMic
                      ? 'bg-red-700 text-white hover:bg-red-800'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  } disabled:opacity-60`}
                >
                  {transcribingMic ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Transcribiendo...
                    </>
                  ) : recordingMic ? (
                    <>
                      <Square className="h-4 w-4 fill-current" />
                      Detener dictado
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      Dictar audio
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={chatLoading || !inputText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
                >
                  <Send className="h-4 w-4" />
                  Consultar
                </button>
              </div>
            </form>
          </>
        ) : (
          /* Pestaña de Conversación por Voz en Tiempo Real (gemini-3.8-live) */
          <div className="flex flex-1 flex-col justify-between p-6" style={{ minHeight: '480px' }}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full ${
                      liveStatus === 'ready'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {liveStatus === 'ready' ? (
                      <Volume2 className="h-5 w-5" />
                    ) : (
                      <MicOff className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-900 dark:text-white">
                      {liveStatus === 'ready'
                        ? 'Sesión de voz en directo activa (Gemini 3.8 Live)'
                        : liveStatus === 'connecting'
                          ? 'Conectando micrófono y sesión de voz...'
                          : 'Asesor Fiscal por Voz en Tiempo Real'}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Habla con naturalidad sobre tu presupuesto, IRPF o hipoteca y escucha recomendaciones al instante.
                    </p>
                  </div>
                </div>

                {liveStatus === 'ready' || liveStatus === 'connecting' ? (
                  <button
                    type="button"
                    onClick={stopLiveSession}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 whitespace-nowrap"
                  >
                    <PhoneOff className="h-4 w-4" />
                    Finalizar llamada
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleStartLiveVoice()}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
                  >
                    <Phone className="h-4 w-4" />
                    Iniciar conversación por voz
                  </button>
                )}
              </div>

              {liveError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{liveError}</span>
                </div>
              )}

              <div className="h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                {liveTranscripts.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
                    {liveStatus === 'ready'
                      ? 'Escuchando... Haz tu consulta en voz alta (por ejemplo: "¿Cómo puedo ahorrar más este mes?").'
                      : 'Pulsa «Iniciar conversación por voz» para activar el micrófono y hablar directamente con el asesor fiscal.'}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {liveTranscripts.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-lg px-3.5 py-2.5 text-sm ${
                          item.speaker === 'usuario'
                            ? 'bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-200'
                            : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                        }`}
                      >
                        <span className="mr-2 font-semibold">
                          {item.speaker === 'usuario' ? 'Tú:' : 'Asesor:'}
                        </span>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Audio bidireccional PCM (16 kHz entrada / 24 kHz salida) con transcripción en vivo. Puedes interrumpir al asesor hablando en cualquier momento.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
