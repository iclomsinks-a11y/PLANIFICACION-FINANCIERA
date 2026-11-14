import React, { useMemo, useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { simulateMortgageAndTreasury } from '../engines/mortgageEngine';
import {
  EstrategiaAmortizacion,
  ModalidadFiscalHipoteca,
  MortgageSimulationInput,
} from '../types/finance';
import {
  downloadTextFile,
  formatEUR,
  formatPct,
  formatYYYYMM,
} from '../utils/formatters';

interface MortgageTreasurySimulatorProps {
  input: MortgageSimulationInput;
  budgetFreeCashflowPreMortgage: number;
  onUpdateInput: (next: MortgageSimulationInput) => void;
  onOpenPosterMode: () => void;
}

export const MortgageTreasurySimulator: React.FC<MortgageTreasurySimulatorProps> = ({
  input,
  budgetFreeCashflowPreMortgage,
  onUpdateInput,
  onOpenPosterMode,
}) => {
  const [ledgerGranularity, setLedgerGranularity] = useState<'anual' | 'mensual'>('anual');

  const result = useMemo(() => simulateMortgageAndTreasury(input), [input]);

  const updateField = <K extends keyof MortgageSimulationInput>(
    key: K,
    value: MortgageSimulationInput[K]
  ) => {
    onUpdateInput({ ...input, [key]: value });
  };

  const handleExportCsv = () => {
    const headers = [
      'Mes_Indice',
      'Fecha',
      'Fase',
      'Capital_Inicial',
      'Cuota_Ordinaria',
      'Interes_Bancario',
      'Principal_Ordinario',
      'Amort_Extra_Enero',
      'Amort_Extra_AEAT',
      'Capital_Final',
      'Saldo_Cuenta_Remunerada',
      'Devolucion_AEAT_Cobrada',
    ];
    const lines = result.rows.map((r) =>
      [
        r.indiceMes,
        r.fechaYYYYMM,
        `"${r.fase}"`,
        r.capitalInicialMes.toFixed(2),
        r.cuotaOrdinaria.toFixed(2),
        r.interesBancario.toFixed(2),
        r.principalOrdinario.toFixed(2),
        r.amortizacionExtraEnero.toFixed(2),
        r.amortizacionExtraAEAT.toFixed(2),
        r.capitalFinalMes.toFixed(2),
        r.saldoCuentaFinal.toFixed(2),
        r.devolucionAEATCobrada.toFixed(2),
      ].join(';')
    );
    downloadTextFile(
      `cuadro-amortizacion-tesoreria-${input.fechaInicio}.csv`,
      '\uFEFF' + [headers.join(';'), ...lines].join('\n'),
      'text/csv;charset=utf-8;'
    );
  };

  // Construcción de gráfica SVG limpia (Trayectoria Anual Deuda vs Cuenta Remunerada)
  const chartData = result.annualSummaries;
  const maxChartY = Math.max(
    input.capitalPendienteInicial,
    input.colchonSeguridad * 1.5,
    ...chartData.map((d) => Math.max(d.capitalPendienteFinAnio, d.saldoCuentaFinAnio)),
    1000
  );

  const svgWidth = 860;
  const svgHeight = 280;
  const padLeft = 72;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 38;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const getX = (idx: number) =>
    chartData.length <= 1 ? padLeft : padLeft + (idx / (chartData.length - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - (val / maxChartY) * plotH;

  const debtPoints = chartData
    .map((d, i) => `${getX(i).toFixed(1)},${getY(d.capitalPendienteFinAnio).toFixed(1)}`)
    .join(' ');
  const cashPoints = chartData
    .map((d, i) => `${getX(i).toFixed(1)},${getY(d.saldoCuentaFinAnio).toFixed(1)}`)
    .join(' ');
  const bufferY = getY(input.colchonSeguridad);

  return (
    <div className="space-y-6">
      {/* KPIs Principales (>= 24px) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Fecha Exacta de Cancelación
          </p>
          <p className="mt-2 font-display text-2xl font-extrabold text-emerald-700 lg:text-3xl dark:text-emerald-400">
            {input.capitalPendienteInicial > 0
              ? formatYYYYMM(result.fechaCancelacionExacta)
              : 'Sin deuda hipotecaria'}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            {input.capitalPendienteInicial > 0
              ? `${result.mesesTotales} meses (${result.mesesAhorradosVsVencimiento} meses antes de ${formatYYYYMM(input.fechaVencimiento, true)})`
              : 'Simulación pura de cuenta remunerada'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Principal vs Intereses Bancarios
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums lg:text-3xl dark:text-white">
            {formatEUR(result.totalPrincipalPagado, false)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            Intereses banco: {formatEUR(result.totalInteresesBancarios, false)} · Ahorras{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {formatEUR(result.ahorroInteresesBancarios, false)}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Devoluciones AEAT Acumuladas
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-blue-700 tabular-nums lg:text-3xl dark:text-blue-400">
            {formatEUR(result.totalDevolucionesAEAT, false)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            {input.reinvertirDevolucionAEAT
              ? 'Reinvertidas automáticamente en junio'
              : 'Ahorradas en cuenta remunerada'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Saldo Cuenta Remunerada al Cierre
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums lg:text-3xl dark:text-white">
            {formatEUR(result.saldoFinalCuentaRemunerada, false)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            Intereses brutos cuenta: {formatEUR(result.totalInteresesCuentaBrutos, false)}
          </p>
        </div>
      </section>

      {/* Panel de Parámetros Configurables */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Simulador de Eliminación de Hipoteca, Carencia CBP y Tesorería
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Cálculo determinista mes a mes · Inyección óptima cada 1 de enero clavando el tope
              fiscal sin perforar el colchón mínimo de seguridad
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                updateField(
                  'ahorroNetoMensualSinHipoteca',
                  Math.round(Math.max(0, budgetFreeCashflowPreMortgage))
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <RefreshCw className="h-4 w-4" />
              Sincronizar ahorro ({formatEUR(budgetFreeCashflowPreMortgage, false)}/mes)
            </button>
            <button
              type="button"
              onClick={onOpenPosterMode}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 whitespace-nowrap"
            >
              Abrir Póster Landscape
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {/* Bloque Hipoteca */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Capital pendiente inicial (€)
            </label>
            <input
              type="number"
              min="0"
              step="250"
              value={input.capitalPendienteInicial}
              onChange={(e) =>
                updateField('capitalPendienteInicial', Number(e.target.value) || 0)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Fecha inicio / Vencimiento contrato
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input
                type="month"
                value={input.fechaInicio}
                onChange={(e) => updateField('fechaInicio', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <input
                type="month"
                value={input.fechaVencimiento}
                onChange={(e) => updateField('fechaVencimiento', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              TIN post-carencia (% anual)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="15"
                step="0.05"
                value={input.tinPostCarencia}
                onChange={(e) => updateField('tinPostCarencia', Number(e.target.value) || 0)}
                className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
                TAE est.: {formatPct(result.taeRealEstimada)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Cuota ordinaria post-carencia
            </label>
            <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-base font-bold text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              {formatEUR(result.cuotaOrdinariaInicialPostCBP)} / mes
            </div>
          </div>

          {/* Bloque Carencia CBP */}
          <div className="flex flex-col justify-center">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={input.enCarenciaCBP}
                onChange={(e) => updateField('enCarenciaCBP', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              En carencia Código Buenas Prácticas (CBP)
            </label>
            <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Solo abona intereses durante el periodo CBP (principal ordinario = 0 €)
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Fin carencia CBP y cuota mensual (€)
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input
                type="month"
                disabled={!input.enCarenciaCBP}
                value={input.fechaFinCarenciaCBP}
                onChange={(e) => updateField('fechaFinCarenciaCBP', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <input
                type="number"
                min="0"
                step="1"
                disabled={!input.enCarenciaCBP}
                value={input.cuotaInteresesCBP}
                onChange={(e) => updateField('cuotaInteresesCBP', Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-base tabular-nums disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Bloque Liquidez y Cuenta Remunerada */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Saldo inicial efectivo (€) / TAE cuenta (%)
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                step="500"
                value={input.saldoInicialEfectivo}
                onChange={(e) =>
                  updateField('saldoInicialEfectivo', Number(e.target.value) || 0)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={input.taeCuentaRemunerada}
                onChange={(e) =>
                  updateField('taeCuentaRemunerada', Number(e.target.value) || 0)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Ahorro neto mensual pre-hipoteca (€)
            </label>
            <input
              type="number"
              step="25"
              value={input.ahorroNetoMensualSinHipoteca}
              onChange={(e) =>
                updateField('ahorroNetoMensualSinHipoteca', Number(e.target.value) || 0)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Colchón de seguridad */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Colchón mínimo intocable (€)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="500"
                value={input.colchonSeguridad}
                onChange={(e) => updateField('colchonSeguridad', Number(e.target.value) || 0)}
                className="w-28 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {[6000, 8000, 10000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => updateField('colchonSeguridad', preset)}
                  className={`rounded-md px-2 py-1.5 font-mono text-xs font-medium ${
                    input.colchonSeguridad === preset
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {preset / 1000}k
                </button>
              ))}
            </div>
          </div>

          {/* Estrategia */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Estrategia de amortización
            </label>
            <select
              value={input.estrategia}
              onChange={(e) =>
                updateField('estrategia', e.target.value as EstrategiaAmortizacion)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="hibrida">Híbrida (Cuota hasta umbral → Plazo)</option>
              <option value="reducir_plazo">Reducir Plazo (máximo ahorro intereses)</option>
              <option value="reducir_cuota">Reducir Cuota (máxima liquidez mensual)</option>
            </select>
          </div>

          {input.estrategia === 'hibrida' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Umbral cambio a Reducir Plazo (€/mes)
              </label>
              <input
                type="number"
                min="50"
                step="25"
                value={input.umbralCuotaHibrida}
                onChange={(e) =>
                  updateField('umbralCuotaHibrida', Number(e.target.value) || 300)
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          )}

          {/* Fiscalidad DT 18ª */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Tope fiscal DT 18.ª (pre-2013)
            </label>
            <select
              value={input.modalidadFiscal}
              onChange={(e) =>
                updateField('modalidadFiscal', e.target.value as ModalidadFiscalHipoteca)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="individual_18080">2 Titulares Individual (Tope 18.080 €/año)</option>
              <option value="conjunta_9040">Conjunta o 1 Titular (Tope 9.040 €/año)</option>
              <option value="ninguna">Sin deducción (Compra ≥ 2013)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Seguros vinculados/año (€) y cuota IRPF
            </label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input
                type="number"
                min="0"
                step="50"
                value={input.segurosVinculadosAnuales}
                onChange={(e) =>
                  updateField('segurosVinculadosAnuales', Number(e.target.value) || 0)
                }
                title="Seguros hogar/vida obligatorios en escritura (€/año)"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <input
                type="number"
                min="0"
                step="250"
                value={input.cuotaIntegraDisponibleAnual}
                onChange={(e) =>
                  updateField('cuotaIntegraDisponibleAnual', Number(e.target.value) || 0)
                }
                title="Cuota íntegra IRPF disponible para absorber devolución"
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center lg:col-span-2">
            <label className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={input.reinvertirDevolucionAEAT}
                onChange={(e) => updateField('reinvertirDevolucionAEAT', e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              Reinvertir automáticamente la devolución de la AEAT en junio como amortización de
              principal (optimizando la inyección previa del 1 de enero)
            </label>
          </div>
        </div>

        {result.primerMesCambioHibrido && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <span>
              Cambio automático de Estrategia Híbrida activado en{' '}
              <strong>{formatYYYYMM(result.primerMesCambioHibrido)}</strong>: la cuota ordinaria
              bajó de {formatEUR(input.umbralCuotaHibrida)}/mes y el algoritmo conmutó a{' '}
              <strong>Reducir Plazo</strong>.
            </span>
          </div>
        )}

        {input.ajustesSalarioFuturo && input.ajustesSalarioFuturo.length > 0 && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
            <span className="font-semibold">Salarios futuros aplicados en tesorería: </span>
            {input.ajustesSalarioFuturo.map((adj, idx) => (
              <span key={adj.id}>
                {idx > 0 ? ' · ' : ''}
                {adj.nombre} desde <strong>{formatYYYYMM(adj.fechaYYYYMM)}</strong> (
                <span className="font-mono font-semibold tabular-nums">
                  {adj.deltaMensual >= 0 ? '+' : ''}
                  {formatEUR(adj.deltaMensual)}/mes
                </span>
                )
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Gráfica SVG Trayectoria Deuda vs Tesorería */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Evolución Anual: Capital Pendiente Hipoteca vs. Saldo Cuenta Remunerada
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Comparativa de desapalancamiento frente al colchón mínimo intocable de{' '}
              {formatEUR(input.colchonSeguridad, false)}
            </p>
          </div>
          <div className="flex items-center gap-5 text-sm font-medium">
            <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <span className="h-3 w-3 rounded-sm bg-red-600" />
              Capital pendiente
            </span>
            <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <span className="h-3 w-3 rounded-sm bg-blue-700" />
              Saldo cuenta remunerada
            </span>
            <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-amber-600" />
              Colchón seguridad
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="h-64 w-full min-w-[600px]"
            role="img"
            aria-label="Evolución anual del capital pendiente frente a la cuenta remunerada"
          >
            {/* Guías horizontales Y */}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const val = maxChartY * t;
              const y = getY(val);
              return (
                <g key={t}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 font-mono text-[11px]"
                  >
                    {Math.round(val / 1000)}k €
                  </text>
                </g>
              );
            })}

            {/* Colchón mínimo intocable */}
            <line
              x1={padLeft}
              y1={bufferY}
              x2={svgWidth - padRight}
              y2={bufferY}
              stroke="#d97706"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />

            {/* Líneas de deuda y tesorería */}
            {chartData.length > 1 && (
              <>
                <polyline
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth="2.75"
                  strokeLinejoin="round"
                  points={debtPoints}
                />
                <polyline
                  fill="none"
                  stroke="#1d4ed8"
                  strokeWidth="2.75"
                  strokeLinejoin="round"
                  points={cashPoints}
                />
              </>
            )}

            {/* Puntos y etiquetas de años */}
            {chartData.map((d, i) => {
              const x = getX(i);
              const showLabel =
                chartData.length <= 12 || i % Math.ceil(chartData.length / 10) === 0 || i === chartData.length - 1;
              return (
                <g key={d.anio}>
                  <circle cx={x} cy={getY(d.capitalPendienteFinAnio)} r="3.5" fill="#dc2626" />
                  <circle cx={x} cy={getY(d.saldoCuentaFinAnio)} r="3.5" fill="#1d4ed8" />
                  {showLabel && (
                    <text
                      x={x}
                      y={svgHeight - 10}
                      textAnchor="middle"
                      className="fill-slate-500 font-mono text-[11px]"
                    >
                      {d.anio}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Tabla Determinista de Amortización y Tesorería (>= 16px) */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLedgerGranularity('anual')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                ledgerGranularity === 'anual'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Resumen Anual ({result.annualSummaries.length} años)
            </button>
            <button
              type="button"
              onClick={() => setLedgerGranularity('mensual')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                ledgerGranularity === 'mensual'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              Detalle Mes a Mes ({result.rows.length} meses)
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            Exportar cuadro CSV
          </button>
        </div>

        <div className="max-h-[540px] overflow-auto">
          {ledgerGranularity === 'anual' ? (
            <table className="w-full border-collapse text-left text-base">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
                <tr className="border-b border-slate-200 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-3.5 pl-5 pr-3">Año</th>
                  <th className="px-3 py-3.5 text-right">Cuotas Pagadas</th>
                  <th className="px-3 py-3.5 text-right">Intereses Banco</th>
                  <th className="px-3 py-3.5 text-right">Principal Ordinario</th>
                  <th className="px-3 py-3.5 text-right">Amort. Extra (1 Ene + AEAT)</th>
                  <th className="px-3 py-3.5 text-right">Devolución AEAT</th>
                  <th className="px-3 py-3.5 text-right">Capital Pendiente</th>
                  <th className="py-3.5 pl-3 pr-5 text-right">Cuenta Remunerada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {result.annualSummaries.map((yr) => (
                  <tr key={yr.anio} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 pl-5 pr-3 font-mono font-bold text-slate-900 tabular-nums dark:text-white">
                      {yr.anio}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums">
                      {formatEUR(yr.cuotasPagadas)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-red-700 tabular-nums dark:text-red-400">
                      {formatEUR(yr.interesesPagados)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-emerald-700 tabular-nums dark:text-emerald-400">
                      {formatEUR(yr.principalOrdinario)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-semibold text-blue-700 tabular-nums dark:text-blue-400">
                      {formatEUR(yr.amortizacionExtra)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono text-emerald-700 tabular-nums dark:text-emerald-400">
                      {formatEUR(yr.devolucionAEATGenerada)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-bold tabular-nums">
                      {formatEUR(yr.capitalPendienteFinAnio)}
                    </td>
                    <td className="py-3.5 pl-3 pr-5 text-right font-mono font-semibold text-slate-900 tabular-nums dark:text-white">
                      {formatEUR(yr.saldoCuentaFinAnio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-left text-base">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950">
                <tr className="border-b border-slate-200 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <th className="py-3.5 pl-5 pr-3">Mes</th>
                  <th className="px-3 py-3.5">Fase</th>
                  <th className="px-3 py-3.5 text-right">Cuota Ord.</th>
                  <th className="px-3 py-3.5 text-right">Interés Banco</th>
                  <th className="px-3 py-3.5 text-right">Principal Ord.</th>
                  <th className="px-3 py-3.5 text-right">Extra (Ene/AEAT)</th>
                  <th className="px-3 py-3.5 text-right">Capital Final</th>
                  <th className="py-3.5 pl-3 pr-5 text-right">Saldo Cuenta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {result.rows.map((r) => (
                  <tr key={r.indiceMes} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3 pl-5 pr-3 font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap dark:text-white">
                      {formatYYYYMM(r.fechaYYYYMM, true)}
                    </td>
                    <td className="px-3 py-3 text-sm text-slate-600 whitespace-nowrap dark:text-slate-300">
                      {r.fase}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {formatEUR(r.cuotaOrdinaria)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-red-700 tabular-nums dark:text-red-400">
                      {formatEUR(r.interesBancario)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-700 tabular-nums dark:text-emerald-400">
                      {formatEUR(r.principalOrdinario)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-blue-700 tabular-nums dark:text-blue-400">
                      {r.amortizacionExtraTotal > 0 ? formatEUR(r.amortizacionExtraTotal) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold tabular-nums">
                      {formatEUR(r.capitalFinalMes)}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right font-mono font-semibold tabular-nums">
                      {formatEUR(r.saldoCuentaFinal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
