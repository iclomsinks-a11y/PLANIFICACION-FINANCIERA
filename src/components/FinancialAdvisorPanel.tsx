import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  ExternalLink,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { EconomySummaryResult } from '../engines/economyEngine';
import {
  COMUNIDADES_AUTONOMAS_LABELS,
  simulateIrpfComparison,
} from '../engines/irpfEngine';
import { simulateMortgageAndTreasury } from '../engines/mortgageEngine';
import { EconomyWorkspaceState } from '../types/economy';
import { MortgageSimulationInput } from '../types/finance';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingSources?: Array<{ title: string; uri: string }>;
}

interface FinancialAdvisorPanelProps {
  isOpen: boolean;
  state: EconomyWorkspaceState;
  summary: EconomySummaryResult;
  effectiveMortgageInput: MortgageSimulationInput;
  irpfHabilitado: boolean;
  onClose: () => void;
}

export const FinancialAdvisorPanel: React.FC<FinancialAdvisorPanelProps> = ({
  isOpen,
  state,
  summary,
  effectiveMortgageInput,
  irpfHabilitado,
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 60);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [isOpen, onClose]);

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

  const handleSendChat = async (
    customPrompt?: string,
    options?: { isRetry?: boolean }
  ) => {
    const query = (customPrompt ?? inputText).trim();
    if (!query || chatLoading) return;

    setChatError(null);
    setLastFailedQuery(null);

    let historyForRequest = messages;
    if (!options?.isRetry) {
      const userMsg: ChatMessage = {
        id: `msg-u-${Date.now()}`,
        role: 'user',
        text: query,
      };
      setMessages((prev) => [...prev, userMsg]);
      if (!customPrompt) setInputText('');
    } else if (
      messages.length > 0 &&
      messages[messages.length - 1].role === 'user'
    ) {
      historyForRequest = messages.slice(0, -1);
    }

    setChatLoading(true);

    try {
      const response = await fetch('/api/gemini/advisor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          history: historyForRequest.map((m) => ({ role: m.role, text: m.text })),
          mode: 'experto',
          useSearch: true,
          financialContext,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        reply?: string;
        groundingSources?: Array<{ title: string; uri: string }>;
      };

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo obtener respuesta.');
      }

      const modelMsg: ChatMessage = {
        id: `msg-m-${Date.now()}`,
        role: 'model',
        text: data.reply || 'Sin respuesta disponible.',
        groundingSources: data.groundingSources,
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err) {
      setLastFailedQuery(query);
      setChatError(
        err instanceof Error ? err.message : 'Error al enviar la consulta.'
      );
    } finally {
      setChatLoading(false);
    }
  };

  if (!isOpen) return null;

  const headerEdition = state.mode === 'familiar' ? 'Fam' : 'Pro';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`GESTARIAN ${headerEdition}`}
      className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col bg-white text-slate-900 dark:bg-black dark:text-white"
    >
      {/* Cabecera mínima: fondo negro y texto blanco */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/15 bg-black px-3 text-white sm:px-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <h1 className="flex items-baseline gap-1.5 whitespace-nowrap text-base text-white">
          <span className="font-extralight tracking-[0.2em] text-white">GESTARIAN</span>
          <span className="font-normal tracking-normal text-white">
            {headerEdition}
          </span>
        </h1>

        <div className="flex min-w-[44px] justify-end">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setChatError(null);
                setLastFailedQuery(null);
              }}
              aria-label="Nueva conversación"
              title="Nueva conversación"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {/* Hilo limpio a pantalla completa (texto x1.5) */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center text-[27px] font-light tracking-tight text-slate-400 sm:text-[30px] dark:text-white/40">
                ¿En qué puedo ayudarte?
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'user' ? (
                    <div className="max-w-[88%] rounded-2xl bg-slate-900 px-5 py-3 text-[22.5px] leading-[1.45] text-white whitespace-pre-wrap dark:bg-white dark:text-black">
                      {msg.text}
                    </div>
                  ) : (
                    <div className="w-full max-w-[94%] text-[22.5px] leading-[1.55] text-slate-800 whitespace-pre-wrap dark:text-white/90">
                      {msg.text}
                      {msg.groundingSources && msg.groundingSources.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[18px] text-slate-500 dark:text-white/50">
                          {msg.groundingSources.map((src) => (
                            <a
                              key={src.uri}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 hover:text-slate-900 hover:underline dark:hover:text-white"
                            >
                              <span className="max-w-[280px] truncate">{src.title}</span>
                              <ExternalLink className="h-4 w-4 shrink-0" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-center gap-2.5 text-[21px] text-slate-400 dark:text-white/45">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Pensando...</span>
                </div>
              )}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Error discreto con reintento */}
      {chatError && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2 sm:px-6">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[21px] leading-snug text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{chatError}</span>
            </div>
            {lastFailedQuery && (
              <button
                type="button"
                disabled={chatLoading}
                onClick={() => void handleSendChat(lastFailedQuery, { isRetry: true })}
                className="shrink-0 font-semibold underline hover:no-underline disabled:opacity-50"
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Barra de entrada minimalista (texto x1.5) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSendChat();
        }}
        className="shrink-0 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6"
      >
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2.5 rounded-2xl border border-slate-300 bg-white px-4 py-2.5 focus-within:border-slate-900 dark:border-white/20 dark:bg-zinc-950 dark:focus-within:border-white/60">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendChat();
              }
            }}
            placeholder="Escribe tu consulta..."
            aria-label="Escribe tu consulta"
            className="max-h-44 min-h-[44px] flex-1 resize-none bg-transparent py-1.5 text-[22.5px] leading-[1.45] text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-white/40"
          />
          <button
            type="submit"
            disabled={chatLoading || !inputText.trim()}
            aria-label="Enviar consulta"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition-opacity hover:opacity-90 disabled:opacity-30 dark:bg-white dark:text-black"
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
};
