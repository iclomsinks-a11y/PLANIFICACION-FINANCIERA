import React, { useMemo, useState } from 'react';
import { GitCompare, Loader2, MessageSquareText, RotateCcw, Save } from 'lucide-react';
import { computeEconomySummary } from '../engines/economyEngine';
import { simulateIrpfComparison } from '../engines/irpfEngine';
import { simulateMortgageAndTreasury } from '../engines/mortgageEngine';
import { SavedSupuesto } from '../types/economy';
import { EstrategiaAmortizacion, MortgageSimulationInput } from '../types/finance';
import { formatEUR, formatYYYYMM } from '../utils/formatters';

interface ScenarioComparatorProps {
  activeSupuesto: SavedSupuesto;
  effectiveMortgageInput: MortgageSimulationInput;
  supuestos: SavedSupuesto[];
  nextSupuestoNumber: number;
  onSaveWhatIfAsSupuesto: (
    name: string,
    nextMortgageInput: MortgageSimulationInput,
    deltaMonthlyExpense: number
  ) => void;
  onSelectSupuesto: (id: string) => void;
}

export const ScenarioComparator: React.FC<ScenarioComparatorProps> = ({
  activeSupuesto,
  effectiveMortgageInput,
  supuestos,
  nextSupuestoNumber,
  onSaveWhatIfAsSupuesto,
  onSelectSupuesto,
}) => {
  const [amortExtraHoy, setAmortExtraHoy] = useState<number>(5000);
  const [deltaTinPct, setDeltaTinPct] = useState<number>(0);
  const [deltaTaePct, setDeltaTaePct] = useState<number>(0);
  const [deltaGastoMensual, setDeltaGastoMensual] = useState<number>(0);
  const [whatIfStrategy, setWhatIfStrategy] = useState<EstrategiaAmortizacion>(
    effectiveMortgageInput.estrategia
  );

  const [selectedSupuestoIds, setSelectedSupuestoIds] = useState<string[]>(() =>
    supuestos.slice(0, 4).map((s) => s.id)
  );
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const baseResult = useMemo(
    () => simulateMortgageAndTreasury(effectiveMortgageInput),
    [effectiveMortgageInput]
  );

  const whatIfMortgageInput = useMemo<MortgageSimulationInput>(() => {
    const nextCap = Math.max(0, effectiveMortgageInput.capitalPendienteInicial - amortExtraHoy);
    const nextTin = Math.max(0, effectiveMortgageInput.tinPostCarencia + deltaTinPct);
    const nextTae = Math.max(0, effectiveMortgageInput.taeCuentaRemunerada + deltaTaePct);
    // Si sube el gasto mensual (+), baja el ahorro mensual disponible (-); si baja el gasto (-), sube el ahorro (+)
    const nextAhorro = Math.max(
      0,
      effectiveMortgageInput.ahorroNetoMensualSinHipoteca - deltaGastoMensual
    );

    return {
      ...effectiveMortgageInput,
      capitalPendienteInicial: nextCap,
      tinPostCarencia: nextTin,
      taeCuentaRemunerada: nextTae,
      ahorroNetoMensualSinHipoteca: nextAhorro,
      estrategia: whatIfStrategy,
    };
  }, [
    effectiveMortgageInput,
    amortExtraHoy,
    deltaTinPct,
    deltaTaePct,
    deltaGastoMensual,
    whatIfStrategy,
  ]);

  const whatIfResult = useMemo(
    () => simulateMortgageAndTreasury(whatIfMortgageInput),
    [whatIfMortgageInput]
  );

  const monthsDelta = baseResult.mesesTotales - whatIfResult.mesesTotales;
  const interestDelta =
    baseResult.totalInteresesBancarios - whatIfResult.totalInteresesBancarios;
  const aeatDelta = whatIfResult.totalDevolucionesAEAT - baseResult.totalDevolucionesAEAT;
  const finalCashDelta =
    whatIfResult.saldoFinalCuentaRemunerada - baseResult.saldoFinalCuentaRemunerada;

  // Datos para gráfica SVG comparativa Año a Año
  const maxYears = Math.max(
    baseResult.annualSummaries.length,
    whatIfResult.annualSummaries.length,
    1
  );
  const maxChartY = Math.max(
    effectiveMortgageInput.capitalPendienteInicial,
    ...baseResult.annualSummaries.map((a) =>
      Math.max(a.capitalPendienteFinAnio, a.saldoCuentaFinAnio)
    ),
    ...whatIfResult.annualSummaries.map((a) =>
      Math.max(a.capitalPendienteFinAnio, a.saldoCuentaFinAnio)
    ),
    1000
  );

  const svgW = 860;
  const svgH = 260;
  const padL = 72;
  const padR = 24;
  const padT = 18;
  const padB = 34;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const getX = (idx: number) =>
    maxYears <= 1 ? padL : padL + (idx / (maxYears - 1)) * plotW;
  const getY = (val: number) => padT + plotH - (val / maxChartY) * plotH;

  const baseDebtLine = baseResult.annualSummaries
    .map((d, i) => `${getX(i).toFixed(1)},${getY(d.capitalPendienteFinAnio).toFixed(1)}`)
    .join(' ');
  const whatIfDebtLine = whatIfResult.annualSummaries
    .map((d, i) => `${getX(i).toFixed(1)},${getY(d.capitalPendienteFinAnio).toFixed(1)}`)
    .join(' ');
  const baseCashLine = baseResult.annualSummaries
    .map((d, i) => `${getX(i).toFixed(1)},${getY(d.saldoCuentaFinAnio).toFixed(1)}`)
    .join(' ');
  const whatIfCashLine = whatIfResult.annualSummaries
    .map((d, i) => `${getX(i).toFixed(1)},${getY(d.saldoCuentaFinAnio).toFixed(1)}`)
    .join(' ');

  // Comparativa determinista entre Supuestos Guardados
  const comparedSupuestos = useMemo(() => {
    const activeIds = selectedSupuestoIds.filter((id) =>
      supuestos.some((s) => s.id === id)
    );
    const targetList =
      activeIds.length > 0
        ? supuestos.filter((s) => activeIds.includes(s.id))
        : supuestos.slice(0, 3);

    return targetList.map((sup) => {
      const econ = computeEconomySummary(sup.state, 'mes_actual');
      const mort = simulateMortgageAndTreasury({
        ...sup.state.mortgageInput,
        ajustesSalarioFuturo: econ.ajustesSalarioFuturo,
      });
      const irpf = simulateIrpfComparison(sup.state.irpfInput);
      const irpfOptResultado =
        irpf.modalidadOptima === 'conjunta'
          ? irpf.conjunta.resultadoDeclaracion
          : irpf.sumaIndividualesResultado;

      return {
        supuesto: sup,
        ingresosMes: econ.ingresosPeriodo,
        gastosMes: econ.gastosPeriodo,
        ahorroMes: econ.ahorroNetoPeriodo,
        disponible: econ.dineroRealmenteDisponible,
        cancelacion:
          sup.state.mortgageInput.capitalPendienteInicial > 0
            ? formatYYYYMM(mort.fechaCancelacionExacta)
            : 'Sin hipoteca',
        interesesBanco: mort.totalInteresesBancarios,
        irpfModalidad: irpf.modalidadOptima,
        irpfResultado: irpfOptResultado,
      };
    });
  }, [supuestos, selectedSupuestoIds]);

  const handleExplainDeterministic = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/gemini/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: `Comparador ¿Y si? sobre ${activeSupuesto.nombre}`,
          deterministicSummary: {
            supuestoBase: activeSupuesto.nombre,
            parametrosWhatIf: {
              amortizacionExtraInicialEur: amortExtraHoy,
              variacionTinHipotecaPct: deltaTinPct,
              variacionTaeRemuneradaPct: deltaTaePct,
              variacionGastoMensualEur: deltaGastoMensual,
              estrategia: whatIfStrategy,
            },
            base: {
              fechaCancelacion: baseResult.fechaCancelacionExacta,
              mesesTotales: baseResult.mesesTotales,
              interesesBancariosTotales: baseResult.totalInteresesBancarios,
              devolucionesAEAT: baseResult.totalDevolucionesAEAT,
              saldoFinalCuenta: baseResult.saldoFinalCuentaRemunerada,
            },
            whatIf: {
              fechaCancelacion: whatIfResult.fechaCancelacionExacta,
              mesesTotales: whatIfResult.mesesTotales,
              interesesBancariosTotales: whatIfResult.totalInteresesBancarios,
              devolucionesAEAT: whatIfResult.totalDevolucionesAEAT,
              saldoFinalCuenta: whatIfResult.saldoFinalCuentaRemunerada,
            },
            diferenciaMeses: monthsDelta,
            ahorroInteresesEur: interestDelta,
          },
        }),
      });
      const json = (await res.json()) as { explanation?: string; error?: string };
      if (!res.ok) throw new Error(json.error || 'Error al generar explicación');
      setAiExplanation(json.explanation ?? '');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error al conectar con Gemini');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sección 1: Simulador interactivo "¿Y si...?" */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Comparador Visual de Escenarios («¿Y si...?»)
            </h2>
            <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
              Simula en tiempo real cambios sobre <strong>{activeSupuesto.nombre}</strong> con el motor determinista (sin alterar tus datos actuales hasta que decidas guardarlo).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setAmortExtraHoy(0);
                setDeltaTinPct(0);
                setDeltaTaePct(0);
                setDeltaGastoMensual(0);
                setWhatIfStrategy(effectiveMortgageInput.estrategia);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <RotateCcw className="h-4 w-4" />
              Igualar a base
            </button>
            <button
              type="button"
              onClick={() =>
                onSaveWhatIfAsSupuesto(
                  `Supuesto ${nextSupuestoNumber} (¿Y si?)`,
                  whatIfMortgageInput,
                  deltaGastoMensual
                )
              }
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              <Save className="h-4 w-4" />
              Guardar como Supuesto {nextSupuestoNumber}
            </button>
          </div>
        </div>

        {/* Controles "¿Y si...?" */}
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-300">
              <span>¿Y si amortizo X hoy?</span>
              <span className="font-mono text-blue-700 tabular-nums dark:text-blue-400">
                {formatEUR(amortExtraHoy, false)}
              </span>
            </label>
            <input
              type="range"
              min="0"
              max={Math.max(10000, Math.round(effectiveMortgageInput.capitalPendienteInicial))}
              step="500"
              value={amortExtraHoy}
              onChange={(e) => setAmortExtraHoy(Number(e.target.value) || 0)}
              className="w-full accent-blue-700"
            />
            <input
              type="number"
              min="0"
              step="250"
              value={amortExtraHoy}
              onChange={(e) => setAmortExtraHoy(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-300">
              <span>Variación TIN hipoteca</span>
              <span className="font-mono tabular-nums">
                {deltaTinPct >= 0 ? '+' : ''}
                {deltaTinPct.toFixed(2)}%
              </span>
            </label>
            <input
              type="range"
              min="-2"
              max="2.5"
              step="0.1"
              value={deltaTinPct}
              onChange={(e) => setDeltaTinPct(Number(e.target.value))}
              className="w-full accent-blue-700"
            />
            <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              TIN resultante: {whatIfMortgageInput.tinPostCarencia.toFixed(2)}%
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-300">
              <span>Variación TAE cuenta</span>
              <span className="font-mono tabular-nums">
                {deltaTaePct >= 0 ? '+' : ''}
                {deltaTaePct.toFixed(2)}%
              </span>
            </label>
            <input
              type="range"
              min="-2"
              max="2.5"
              step="0.1"
              value={deltaTaePct}
              onChange={(e) => setDeltaTaePct(Number(e.target.value))}
              className="w-full accent-blue-700"
            />
            <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              TAE resultante: {whatIfMortgageInput.taeCuentaRemunerada.toFixed(2)}%
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center justify-between text-sm font-semibold text-slate-700 dark:text-slate-300">
              <span>Cambio gasto mensual</span>
              <span
                className={`font-mono tabular-nums ${
                  deltaGastoMensual > 0
                    ? 'text-red-700 dark:text-red-400'
                    : deltaGastoMensual < 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : ''
                }`}
              >
                {deltaGastoMensual >= 0 ? '+' : ''}
                {formatEUR(deltaGastoMensual, false)}/mes
              </span>
            </label>
            <input
              type="range"
              min="-600"
              max="600"
              step="25"
              value={deltaGastoMensual}
              onChange={(e) => setDeltaGastoMensual(Number(e.target.value))}
              className="w-full accent-blue-700"
            />
            <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
              Ahorro pre-hipoteca: {formatEUR(whatIfMortgageInput.ahorroNetoMensualSinHipoteca, false)}/mes
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Estrategia amortización
            </label>
            <select
              value={whatIfStrategy}
              onChange={(e) => setWhatIfStrategy(e.target.value as EstrategiaAmortizacion)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="reducir_cuota">Reducir cuota</option>
              <option value="reducir_plazo">Reducir plazo</option>
              <option value="hibrida">Híbrida (cuota → plazo)</option>
            </select>
          </div>
        </div>

        {/* 4 Tarjetas Comparativas Base vs ¿Y si? */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Fecha de Cancelación
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold text-slate-900 dark:text-white">
              {whatIfMortgageInput.capitalPendienteInicial > 0
                ? formatYYYYMM(whatIfResult.fechaCancelacionExacta)
                : 'Cancelada'}
            </p>
            <p className="mt-1 text-sm tabular-nums text-slate-600 dark:text-slate-400">
              Base: {formatYYYYMM(baseResult.fechaCancelacionExacta)} ·{' '}
              <span
                className={
                  monthsDelta > 0
                    ? 'font-bold text-emerald-700 dark:text-emerald-400'
                    : monthsDelta < 0
                      ? 'font-bold text-red-700 dark:text-red-400'
                      : 'font-semibold'
                }
              >
                {monthsDelta > 0
                  ? `${monthsDelta} meses antes`
                  : monthsDelta < 0
                    ? `${Math.abs(monthsDelta)} meses más`
                    : 'Sin cambio'}
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Intereses Totales Banco
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {formatEUR(whatIfResult.totalInteresesBancarios, false)}
            </p>
            <p className="mt-1 text-sm tabular-nums text-slate-600 dark:text-slate-400">
              Base: {formatEUR(baseResult.totalInteresesBancarios, false)} ·{' '}
              <span
                className={
                  interestDelta >= 0
                    ? 'font-bold text-emerald-700 dark:text-emerald-400'
                    : 'font-bold text-red-700 dark:text-red-400'
                }
              >
                {interestDelta >= 0 ? 'Ahorras ' : 'Pagas +'}
                {formatEUR(Math.abs(interestDelta), false)}
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Devoluciones AEAT Totales
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-blue-700 tabular-nums dark:text-blue-400">
              {formatEUR(whatIfResult.totalDevolucionesAEAT, false)}
            </p>
            <p className="mt-1 text-sm tabular-nums text-slate-600 dark:text-slate-400">
              Base: {formatEUR(baseResult.totalDevolucionesAEAT, false)} ({aeatDelta >= 0 ? '+' : ''}
              {formatEUR(aeatDelta, false)})
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Saldo Final Cuenta Remunerada
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-white">
              {formatEUR(whatIfResult.saldoFinalCuentaRemunerada, false)}
            </p>
            <p className="mt-1 text-sm tabular-nums text-slate-600 dark:text-slate-400">
              Diferencia: {finalCashDelta >= 0 ? '+' : ''}
              {formatEUR(finalCashDelta, false)}
            </p>
          </div>
        </div>

        {/* Gráfica Visual Trayectoria Deuda y Liquidez (Base vs ¿Y si?) */}
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <h3 className="font-bold text-slate-900 dark:text-white">
              Evolución Anual: Escenario Base vs Simulación «¿Y si...?»
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-slate-400" />
                Deuda Base
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-red-600" />
                Deuda «¿Y si?»
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-blue-400" />
                Liquidez Base
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-emerald-600" />
                Liquidez «¿Y si?»
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="h-64 w-full min-w-[600px]"
              role="img"
              aria-label="Comparativa de evolución de deuda y tesorería"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const yVal = maxChartY * frac;
                const yPx = getY(yVal);
                return (
                  <g key={frac}>
                    <line
                      x1={padL}
                      y1={yPx}
                      x2={svgW - padR}
                      y2={yPx}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeWidth="1"
                    />
                    <text
                      x={padL - 8}
                      y={yPx + 4}
                      textAnchor="end"
                      className="fill-slate-500 font-mono text-[11px]"
                    >
                      {Math.round(yVal / 1000)}k€
                    </text>
                  </g>
                );
              })}

              {baseDebtLine && (
                <polyline
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  points={baseDebtLine}
                />
              )}
              {whatIfDebtLine && (
                <polyline
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="2.5"
                  points={whatIfDebtLine}
                />
              )}
              {baseCashLine && (
                <polyline
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  points={baseCashLine}
                />
              )}
              {whatIfCashLine && (
                <polyline
                  fill="none"
                  stroke="#059669"
                  strokeWidth="2.5"
                  points={whatIfCashLine}
                />
              )}

              {baseResult.annualSummaries.map((a, idx) => {
                if (
                  maxYears > 12 &&
                  idx % 2 !== 0 &&
                  idx !== baseResult.annualSummaries.length - 1
                ) {
                  return null;
                }
                return (
                  <text
                    key={a.anio}
                    x={getX(idx)}
                    y={svgH - 8}
                    textAnchor="middle"
                    className="fill-slate-500 font-mono text-[11px]"
                  >
                    {a.anio}
                  </text>
                );
              })}
            </svg>
          </div>

          {/* Explicación opcional con Gemini sobre cifras deterministas */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={handleExplainDeterministic}
              disabled={aiLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resumiendo cifras exactas...
                </>
              ) : (
                <>
                  <MessageSquareText className="h-4 w-4" />
                  Explicar impacto con Gemini (sin alterar cifras)
                </>
              )}
            </button>
          </div>

          {aiError && (
            <p className="text-sm text-red-700 dark:text-red-400">{aiError}</p>
          )}

          {aiExplanation && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed whitespace-pre-line text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
              {aiExplanation}
            </div>
          )}
        </div>
      </section>

      {/* Sección 2: Comparativa entre Supuestos Guardados */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <GitCompare className="h-5 w-5 text-blue-700 dark:text-blue-400" />
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Comparativa Directa de Supuestos Guardados
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Selecciona los supuestos a comparar lado a lado (tesorería mensual, hipoteca y Renta IRPF óptima).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {supuestos.map((sup) => {
              const checked = selectedSupuestoIds.includes(sup.id);
              return (
                <button
                  key={sup.id}
                  type="button"
                  onClick={() =>
                    setSelectedSupuestoIds((prev) =>
                      prev.includes(sup.id)
                        ? prev.length > 1
                          ? prev.filter((id) => id !== sup.id)
                          : prev
                        : [...prev, sup.id]
                    )
                  }
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                    checked
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  #{sup.numero} · {sup.nombre}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <th className="py-3.5 pl-4 pr-3">Supuesto</th>
                <th className="px-3 py-3.5 text-right">Ingresos mes</th>
                <th className="px-3 py-3.5 text-right">Gastos mes</th>
                <th className="px-3 py-3.5 text-right">Ahorro neto</th>
                <th className="px-3 py-3.5 text-right">Disponible</th>
                <th className="px-3 py-3.5">Cancelación hipoteca</th>
                <th className="px-3 py-3.5 text-right">Intereses banco</th>
                <th className="py-3.5 pl-3 pr-4 text-right">IRPF óptimo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {comparedSupuestos.map((row) => (
                <tr
                  key={row.supuesto.id}
                  className={
                    row.supuesto.id === activeSupuesto.id
                      ? 'bg-blue-50/40 dark:bg-blue-950/20'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                  }
                >
                  <td className="py-3.5 pl-4 pr-3">
                    <button
                      type="button"
                      onClick={() => onSelectSupuesto(row.supuesto.id)}
                      className="text-left font-bold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      #{row.supuesto.numero} · {row.supuesto.nombre}
                    </button>
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-emerald-700 tabular-nums dark:text-emerald-400">
                    {formatEUR(row.ingresosMes, false)}
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono text-red-700 tabular-nums dark:text-red-400">
                    {formatEUR(row.gastosMes, false)}
                  </td>
                  <td
                    className={`px-3 py-3.5 text-right font-mono font-bold tabular-nums ${
                      row.ahorroMes >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {formatEUR(row.ahorroMes, false)}
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                    {formatEUR(row.disponible, false)}
                  </td>
                  <td className="px-3 py-3.5 font-medium text-slate-800 dark:text-slate-200">
                    {row.cancelacion}
                  </td>
                  <td className="px-3 py-3.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {formatEUR(row.interesesBanco, false)}
                  </td>
                  <td className="py-3.5 pl-3 pr-4 text-right font-mono font-semibold tabular-nums">
                    <span
                      className={
                        row.irpfResultado <= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-700 dark:text-red-400'
                      }
                    >
                      {formatEUR(row.irpfResultado, false)}
                    </span>
                    <span className="ml-1.5 text-xs font-sans text-slate-500">
                      ({row.irpfModalidad})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
