import React, { useMemo } from 'react';
import { Maximize2, Minimize2, Printer } from 'lucide-react';
import { simulateIrpfComparison } from '../engines/irpfEngine';
import { simulateMortgageAndTreasury } from '../engines/mortgageEngine';
import { ProfileDefinition, ProfileState } from '../types/finance';
import {
  formatEUR,
  formatYYYYMM,
  toAnnualAmount,
  toMonthlyEquivalent,
} from '../utils/formatters';

interface PosterLandscapeViewProps {
  profile: ProfileDefinition;
  state: ProfileState;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const PosterLandscapeView: React.FC<PosterLandscapeViewProps> = ({
  profile,
  state,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const budgetSummary = useMemo(() => {
    let ingresos = 0;
    let gastosOrd = 0;
    let gastosExtraAnual = 0;
    for (const item of state.budgetItems) {
      if (!item.activo) continue;
      if (item.tipo === 'ingreso') {
        ingresos += toMonthlyEquivalent(item.importe, item.frecuencia);
      } else if (item.tipo === 'gasto_ordinario') {
        gastosOrd += toMonthlyEquivalent(item.importe, item.frecuencia);
      } else {
        gastosExtraAnual += toAnnualAmount(item.importe, item.frecuencia);
      }
    }
    const gastosTotales = gastosOrd + gastosExtraAnual / 12;
    return { ingresos, gastosOrd, gastosExtraAnual, gastosTotales };
  }, [state.budgetItems]);

  const mortgageResult = useMemo(
    () => simulateMortgageAndTreasury(state.mortgageInput),
    [state.mortgageInput]
  );

  const irpfResult = useMemo(
    () => (profile.irpfHabilitado ? simulateIrpfComparison(state.irpfInput) : null),
    [profile.irpfHabilitado, state.irpfInput]
  );

  const aeatAnualActual = irpfResult
    ? irpfResult.modalidadOptima === 'individual'
      ? irpfResult.sumaIndividualesResultado
      : irpfResult.conjunta.resultadoDeclaracion
    : 0;

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 overflow-auto bg-white p-6 text-slate-900 lg:p-10 dark:bg-slate-950 dark:text-slate-100'
          : 'space-y-6'
      }
    >
      <div className="mx-auto max-w-[1440px] space-y-6">
        {/* Cabecera Póster */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-slate-900 pb-4 dark:border-slate-200">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 lg:text-3xl dark:text-white">
              Póster Ejecutivo Landscape · {profile.nombre}
            </h2>
            <p className="mt-1 text-base text-slate-600 dark:text-slate-300">
              Lectura de alto contraste anti-presbicia · Capital amortizado separado de intereses
              bancarios y previsión AEAT
            </p>
          </div>
          <div className="no-print flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base font-semibold text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <Printer className="h-5 w-5" />
              Imprimir Landscape
            </button>
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-base font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-5 w-5" />
                  Salir de pantalla completa
                </>
              ) : (
                <>
                  <Maximize2 className="h-5 w-5" />
                  Pantalla completa
                </>
              )}
            </button>
          </div>
        </header>

        {/* 6 Macro KPIs Anti-Presbicia (>= 24px -> 30px-36px) */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border-2 border-slate-300 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
              Ingresos Mensuales Netos
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums lg:text-4xl dark:text-white">
              {formatEUR(budgetSummary.ingresos)}
            </p>
            <p className="mt-2 text-base text-slate-600 tabular-nums dark:text-slate-300">
              Anualizado: {formatEUR(budgetSummary.ingresos * 12, false)}
            </p>
          </div>

          <div className="rounded-xl border-2 border-slate-300 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
              Gastos Totales Mensuales
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums lg:text-4xl dark:text-white">
              {formatEUR(budgetSummary.gastosTotales)}
            </p>
            <p className="mt-2 text-base text-slate-600 tabular-nums dark:text-slate-300">
              Extraordinarios: {formatEUR(budgetSummary.gastosExtraAnual, false)} / año
            </p>
          </div>

          <div className="rounded-xl border-2 border-slate-300 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
              Saldo Cuenta Remunerada
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-blue-700 tabular-nums lg:text-4xl dark:text-blue-400">
              {formatEUR(state.mortgageInput.saldoInicialEfectivo, false)} →{' '}
              {formatEUR(mortgageResult.saldoFinalCuentaRemunerada, false)}
            </p>
            <p className="mt-2 text-base text-slate-600 tabular-nums dark:text-slate-300">
              Colchón intocable: {formatEUR(state.mortgageInput.colchonSeguridad, false)} · TAE{' '}
              {state.mortgageInput.taeCuentaRemunerada.toFixed(2)}%
            </p>
          </div>

          <div className="rounded-xl border-2 border-slate-300 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
              Capital Amortizado vs Intereses Banco
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-emerald-700 tabular-nums lg:text-4xl dark:text-emerald-400">
              {formatEUR(mortgageResult.totalPrincipalPagado, false)}
            </p>
            <p className="mt-2 text-base font-medium text-red-700 tabular-nums dark:text-red-400">
              Intereses bancarios totales: {formatEUR(mortgageResult.totalInteresesBancarios, false)}
            </p>
          </div>

          <div className="rounded-xl border-2 border-slate-300 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-base font-semibold text-slate-600 dark:text-slate-400">
              Devolución AEAT (Renta y DT 18.ª)
            </p>
            <p className="mt-2 font-mono text-3xl font-bold text-emerald-700 tabular-nums lg:text-4xl dark:text-emerald-400">
              {irpfResult
                ? aeatAnualActual <= 0
                  ? `${formatEUR(Math.abs(aeatAnualActual))} / año`
                  : `${formatEUR(aeatAnualActual)} a ingresar`
                : 'No aplica'}
            </p>
            <p className="mt-2 text-base text-slate-600 tabular-nums dark:text-slate-300">
              Total acumulado hipoteca: {formatEUR(mortgageResult.totalDevolucionesAEAT, false)}
            </p>
          </div>

          <div className="rounded-xl border-2 border-slate-900 bg-slate-900 p-6 text-white dark:border-white dark:bg-white dark:text-slate-900">
            <p className="text-base font-semibold opacity-80">Fecha Exacta de Cancelación</p>
            <p className="mt-2 font-display text-3xl font-extrabold tabular-nums lg:text-4xl">
              {state.mortgageInput.capitalPendienteInicial > 0
                ? formatYYYYMM(mortgageResult.fechaCancelacionExacta)
                : 'Sin hipoteca'}
            </p>
            <p className="mt-2 text-base opacity-85 tabular-nums">
              {state.mortgageInput.capitalPendienteInicial > 0
                ? `${mortgageResult.mesesAhorradosVsVencimiento} meses antes · Ahorro ${formatEUR(mortgageResult.ahorroInteresesBancarios, false)}`
                : `Patrimonio acumulado: ${formatEUR(mortgageResult.saldoFinalCuentaRemunerada, false)}`}
            </p>
          </div>
        </section>

        {/* Tabla Anual de Alta Legibilidad (>= 16px) */}
        <section className="rounded-xl border-2 border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-300 px-6 py-4 dark:border-slate-700">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Hoja de Ruta Anual: Desglose Principal, Intereses Bancarios, AEAT y Tesorería
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-lg">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-100 text-base font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <th className="py-3.5 pl-6 pr-3">Año</th>
                  <th className="px-3 py-3.5 text-right">Principal Ordinario</th>
                  <th className="px-3 py-3.5 text-right">Amort. Extra (1 Ene + AEAT)</th>
                  <th className="px-3 py-3.5 text-right">Intereses Bancarios</th>
                  <th className="px-3 py-3.5 text-right">Devolución AEAT</th>
                  <th className="px-3 py-3.5 text-right">Capital Pendiente</th>
                  <th className="py-3.5 pl-3 pr-6 text-right">Cuenta Remunerada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {mortgageResult.annualSummaries.map((yr) => (
                  <tr key={yr.anio} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3.5 pl-6 pr-3 font-mono font-bold tabular-nums">{yr.anio}</td>
                    <td className="px-3 py-3.5 text-right font-mono font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                      {formatEUR(yr.principalOrdinario, false)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-semibold text-blue-700 tabular-nums dark:text-blue-400">
                      {formatEUR(yr.amortizacionExtra, false)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-semibold text-red-700 tabular-nums dark:text-red-400">
                      {formatEUR(yr.interesesPagados, false)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums">
                      {formatEUR(yr.devolucionAEATGenerada, false)}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-bold tabular-nums">
                      {formatEUR(yr.capitalPendienteFinAnio, false)}
                    </td>
                    <td className="py-3.5 pl-3 pr-6 text-right font-mono font-bold text-slate-900 tabular-nums dark:text-white">
                      {formatEUR(yr.saldoCuentaFinAnio, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
