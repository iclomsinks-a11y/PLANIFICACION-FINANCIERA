import React from 'react';
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  COMUNIDADES_AUTONOMAS_LABELS,
  simulateIrpfComparison,
} from '../engines/irpfEngine';
import {
  ComunidadAutonoma,
  ContribuyenteIrpfInput,
  DeclaracionBreakdown,
  EficienciaEnergeticaTipo,
  IrpfSimulationInput,
  ProfileDefinition,
  UnidadFamiliarTipo,
} from '../types/finance';
import { formatEUR } from '../utils/formatters';

interface IrpfSimulatorProps {
  profile: ProfileDefinition;
  irpfInput: IrpfSimulationInput;
  onUpdateIrpf: (next: IrpfSimulationInput) => void;
  onSyncFromBudgetAndMortgage: () => void;
}

export const IrpfSimulator: React.FC<IrpfSimulatorProps> = ({
  profile,
  irpfInput,
  onUpdateIrpf,
  onSyncFromBudgetAndMortgage,
}) => {
  if (!profile.irpfHabilitado) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Módulo IRPF (Ley 35/2006) no aplicable al perfil adolescente
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
          El simulador experto de Declaración de la Renta está habilitado exclusivamente para los
          perfiles adultos (<strong>Unidad Familiar</strong>, <strong>Hombre Adulto</strong> y{' '}
          <strong>Mujer Adulta</strong>).
        </p>
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/60 dark:bg-amber-950/30">
          <h3 className="text-base font-bold text-amber-900 dark:text-amber-300">
            Regla crítica del Art. 58 LIRPF para hijos adolescentes con becas o trabajos de verano
          </h3>
          <p className="mt-1.5 text-base text-amber-900/90 dark:text-amber-200">
            Para que los progenitores mantengan el derecho al{' '}
            <strong>Mínimo por Descendientes</strong> (2.400 € – 4.500 €), el hijo menor de 25 años
            no puede obtener rentas anuales sujetas superiores a{' '}
            <span className="font-mono font-semibold tabular-nums">8.000,00 €</span> ni presentar
            declaración individual del IRPF con rentas superiores a{' '}
            <span className="font-mono font-semibold tabular-nums">1.800,00 €</span>.
          </p>
        </div>
      </section>
    );
  }

  const result = simulateIrpfComparison(irpfInput);
  const haySegundo =
    irpfInput.tipoUnidadFamiliar === 'matrimonio' ||
    irpfInput.tipoUnidadFamiliar === 'pareja_de_hecho';

  const updateD1 = (patch: Partial<ContribuyenteIrpfInput>) => {
    onUpdateIrpf({
      ...irpfInput,
      declarante1: { ...irpfInput.declarante1, ...patch },
    });
  };

  const updateD2 = (patch: Partial<ContribuyenteIrpfInput>) => {
    onUpdateIrpf({
      ...irpfInput,
      declarante2: { ...irpfInput.declarante2, ...patch },
    });
  };

  const handleAddDescendiente = () => {
    const nextOrder = irpfInput.descendientes.length + 1;
    onUpdateIrpf({
      ...irpfInput,
      descendientes: [
        ...irpfInput.descendientes,
        {
          id: `desc-${Date.now()}`,
          edad: 10,
          discapacidad33: false,
          rentasSuperiores8000: false,
          presentaIrpfMas1800: false,
          orden: nextOrder,
        },
      ],
    });
  };

  const handleRemoveDescendiente = (id: string) => {
    onUpdateIrpf({
      ...irpfInput,
      descendientes: irpfInput.descendientes.filter((d) => d.id !== id),
    });
  };

  const formatResultadoLabel = (val: number) => {
    if (val < -0.01) {
      return `${formatEUR(Math.abs(val))} a devolver`;
    }
    if (val > 0.01) {
      return `${formatEUR(val)} a ingresar`;
    }
    return '0,00 € (Cuota cero)';
  };

  const renderContribuyenteCard = (
    label: string,
    c: ContribuyenteIrpfInput,
    onChange: (patch: Partial<ContribuyenteIrpfInput>) => void
  ) => (
    <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{label}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Rendimientos del trabajo, actividad económica (EDS) y deducciones personales
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
          <input
            type="checkbox"
            checked={c.esAutonomo}
            onChange={(e) => onChange({ esAutonomo: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-blue-700"
          />
          Autónomo (Estimación Directa Simplificada)
        </label>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Edad del contribuyente
          </label>
          <input
            type="number"
            min="18"
            max="100"
            value={c.edad}
            onChange={(e) => onChange({ edad: Number(e.target.value) || 18 })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={c.discapacidad33}
              onChange={(e) => onChange({ discapacidad33: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-700"
            />
            Discapacidad ≥ 33%
          </label>
        </div>

        {/* Rendimientos del trabajo */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Salario bruto anual (€)
          </label>
          <input
            type="number"
            min="0"
            step="100"
            value={c.salarioBrutoAnual}
            onChange={(e) => onChange({ salarioBrutoAnual: Number(e.target.value) || 0 })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Cotización Seg. Social anual (€)
          </label>
          <input
            type="number"
            min="0"
            step="50"
            value={c.cotizacionSeguridadSocial}
            onChange={(e) =>
              onChange({ cotizacionSeguridadSocial: Number(e.target.value) || 0 })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Retenciones IRPF nómina (€)
          </label>
          <input
            type="number"
            min="0"
            step="50"
            value={c.retencionesTrabajo}
            onChange={(e) => onChange({ retencionesTrabajo: Number(e.target.value) || 0 })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Intereses brutos Cuenta Remunerada (€)
          </label>
          <input
            type="number"
            min="0"
            step="10"
            value={c.interesesCuentaRemunerada}
            onChange={(e) => {
              const intereses = Number(e.target.value) || 0;
              onChange({
                interesesCuentaRemunerada: intereses,
                retencionCapital19: Math.round(intereses * 0.19 * 100) / 100,
              });
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
      </div>

      {/* Bloque Autónomo EDS */}
      {c.esAutonomo && (
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-800">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Ingresos íntegros actividad (€)
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={c.ingresosAutonomoAnuales}
              onChange={(e) =>
                onChange({ ingresosAutonomoAnuales: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Cuota RETA anual deducible (€)
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={c.cuotaRetaAnual}
              onChange={(e) => onChange({ cuotaRetaAnual: Number(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Gestoría, seguros y otros gastos (€)
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={c.gestoriaYOtrosGastos}
              onChange={(e) =>
                onChange({ gestoriaYOtrosGastos: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              % vivienda afecta (aplica 30% legal suministros)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={c.porcentajeViviendaAfecta}
                onChange={(e) =>
                  onChange({ porcentajeViviendaAfecta: Number(e.target.value) || 0 })
                }
                className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <input
                type="number"
                min="0"
                value={c.suministrosViviendaAnuales}
                onChange={(e) =>
                  onChange({ suministrosViviendaAnuales: Number(e.target.value) || 0 })
                }
                title="Suministros anuales de vivienda (€)"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Retenciones soportadas en facturas (€)
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={c.retencionesProfesionales}
              onChange={(e) =>
                onChange({ retencionesProfesionales: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Pagos fraccionados Modelo 130 ingresados (€)
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={c.pagosFraccionadosMod130}
              onChange={(e) =>
                onChange({ pagosFraccionadosMod130: Number(e.target.value) || 0 })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>
      )}

      {/* Bloque Deducciones DT 18ª, Eficiencia Energética y Autonómicas */}
      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2 dark:border-slate-800">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Hipoteca pre-2013 + seguros vinculados (€/año)
          </label>
          <input
            type="number"
            min="0"
            step="100"
            value={c.aportacionViviendaPre2013}
            onChange={(e) =>
              onChange({ aportacionViviendaPre2013: Number(e.target.value) || 0 })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Obras Eficiencia Energética / Placas Solares
          </label>
          <select
            value={c.tipoEficienciaEnergetica}
            onChange={(e) =>
              onChange({ tipoEficienciaEnergetica: e.target.value as EficienciaEnergeticaTipo })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ninguna">Sin obras de eficiencia</option>
            <option value="20_demanda">20% · Reducción ≥7% demanda calef./refrig. (máx 5.000 €)</option>
            <option value="40_primaria">40% · Reducción ≥30% energía primaria o A/B (máx 7.500 €)</option>
            <option value="60_edificio">60% · Rehabilitación energética edificio (máx 5.000 €/año)</option>
          </select>
        </div>

        {c.tipoEficienciaEnergetica !== 'ninguna' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Inversión en placas/eficiencia (€)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={c.gastosEficienciaEnergetica}
                onChange={(e) =>
                  onChange({ gastosEficienciaEnergetica: Number(e.target.value) || 0 })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={c.tieneCeePrevioYPosterior}
                  onChange={(e) => onChange({ tieneCeePrevioYPosterior: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700"
                />
                Dispone de CEE previo y posterior registrados
              </label>
            </div>
          </>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Gastos educativos idiomas/informática (CC. AA.) (€)
          </label>
          <input
            type="number"
            min="0"
            step="50"
            value={c.gastosEducativosIdiomasInformatica}
            onChange={(e) =>
              onChange({ gastosEducativosIdiomasInformatica: Number(e.target.value) || 0 })
            }
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Gastos alquiler vivienda habitual (€/año)
          </label>
          <input
            type="number"
            min="0"
            step="100"
            value={c.gastosAlquilerAnuales}
            onChange={(e) => onChange({ gastosAlquilerAnuales: Number(e.target.value) || 0 })}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
      </div>
    </div>
  );

  const columns: { key: string; data: DeclaracionBreakdown | null }[] = [
    { key: 'ind1', data: result.individual1 },
    ...(result.individual2 ? [{ key: 'ind2', data: result.individual2 }] : []),
    { key: 'conj', data: result.conjunta },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs Veredicto AEAT (>= 24px) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Modalidad Óptima AEAT
          </p>
          <p className="mt-2 flex items-center gap-2 font-display text-2xl font-extrabold text-emerald-700 lg:text-3xl dark:text-emerald-400">
            <CheckCircle2 className="h-7 w-7 shrink-0" />
            {result.modalidadOptima === 'individual' ? 'Individual' : 'Conjunta'}
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {result.conjunta.elegible
              ? `Ahorro fiscal neto: ${formatEUR(result.ahorroFiscalOptimo)}`
              : 'Conjunta no elegible según Art. 82 LIRPF'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Resultado Suma Individual
          </p>
          <p
            className={`mt-2 font-mono text-2xl font-bold tabular-nums lg:text-3xl ${
              result.sumaIndividualesResultado <= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {formatEUR(Math.abs(result.sumaIndividualesResultado))}
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {result.sumaIndividualesResultado <= 0 ? 'Resultado: A devolver' : 'Resultado: A ingresar'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Resultado Tributación Conjunta
          </p>
          <p
            className={`mt-2 font-mono text-2xl font-bold tabular-nums lg:text-3xl ${
              !result.conjunta.elegible
                ? 'text-slate-400'
                : result.conjunta.resultadoDeclaracion <= 0
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-red-700 dark:text-red-400'
            }`}
          >
            {result.conjunta.elegible
              ? formatEUR(Math.abs(result.conjunta.resultadoDeclaracion))
              : 'No elegible'}
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {result.conjunta.elegible
              ? result.conjunta.resultadoDeclaracion <= 0
                ? 'Resultado: A devolver'
                : 'Resultado: A ingresar'
              : 'Art. 82 Ley 35/2006'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Deducción Vivienda DT 18.ª (Óptima)
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-blue-700 tabular-nums lg:text-3xl dark:text-blue-400">
            {formatEUR(
              result.modalidadOptima === 'individual'
                ? result.sumaIndividualesDeduccionVivienda
                : result.conjunta.deduccionViviendaHabitual
            )}
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Tope Ind.: {haySegundo ? '18.080 € (2.712 €)' : '9.040 € (1.356 €)'} · Conj.: 9.040 €
          </p>
        </div>
      </section>

      {/* Advertencias Legales AEAT */}
      {result.advertenciasLegales.length > 0 && (
        <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900/70 dark:bg-amber-950/30">
          {result.advertenciasLegales.map((adv, idx) => (
            <div key={idx} className="flex items-start gap-3 text-base text-amber-950 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <span>{adv}</span>
            </div>
          ))}
        </section>
      )}

      {/* Parámetros Legales Unidad Familiar y Descendientes */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Configuración Legal de la Unidad Familiar (Art. 82 LIRPF) y CC. AA.
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Ley 35/2006 del IRPF · Mínimos personales/familiares (Arts. 57 y 58) y escalas autonómicas
            </p>
          </div>
          <button
            type="button"
            onClick={onSyncFromBudgetAndMortgage}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
            Sincronizar desde Hipoteca y Presupuesto
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Comunidad Autónoma de residencia fiscal
            </label>
            <select
              value={irpfInput.comunidadAutonoma}
              onChange={(e) =>
                onUpdateIrpf({
                  ...irpfInput,
                  comunidadAutonoma: e.target.value as ComunidadAutonoma,
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {Object.entries(COMUNIDADES_AUTONOMAS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Modalidad de Unidad Familiar (Art. 82 LIRPF)
            </label>
            <select
              value={irpfInput.tipoUnidadFamiliar}
              onChange={(e) =>
                onUpdateIrpf({
                  ...irpfInput,
                  tipoUnidadFamiliar: e.target.value as UnidadFamiliarTipo,
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="matrimonio">Matrimonio (Reducción conjunta 3.400 €)</option>
              <option value="pareja_de_hecho">Pareja de hecho (Sin conjunta entre miembros)</option>
              <option value="monoparental">Monoparental (Reducción 2.150 € si no convive)</option>
              <option value="individual">Contribuyente individual sin hijos</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Título de Familia Numerosa
            </label>
            <select
              value={irpfInput.familiaNumerosa}
              onChange={(e) =>
                onUpdateIrpf({
                  ...irpfInput,
                  familiaNumerosa: e.target.value as 'ninguna' | 'general' | 'especial',
                })
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="ninguna">No aplica</option>
              <option value="general">Categoría General (1.200 €/año)</option>
              <option value="especial">Categoría Especial (2.400 €/año)</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6">
          {irpfInput.tipoUnidadFamiliar === 'monoparental' && (
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={irpfInput.conviveOtroProgenitor}
                onChange={(e) =>
                  onUpdateIrpf({ ...irpfInput, conviveOtroProgenitor: e.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              Convive con el otro progenitor (anula reducción 2.150 € Art. 84.2.4.º)
            </label>
          )}
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={irpfInput.custodiaCompartida}
              onChange={(e) =>
                onUpdateIrpf({ ...irpfInput, custodiaCompartida: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-blue-700"
            />
            Guarda y custodia compartida (prorrateo 50% mínimo por descendientes)
          </label>
        </div>

        {/* Descendientes */}
        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Descendientes a cargo (Art. 58 LIRPF: 2.400 € · 2.700 € · 4.000 € · 4.500 €)
            </h3>
            <button
              type="button"
              onClick={handleAddDescendiente}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Plus className="h-4 w-4" />
              Añadir hijo/a
            </button>
          </div>

          {irpfInput.descendientes.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              No hay descendientes registrados. Pulsa «Añadir hijo/a» si deseas simular el mínimo
              por descendientes.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {irpfInput.descendientes.map((d, idx) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Hijo/a {idx + 1}
                    </span>
                    <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                      Edad:
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={d.edad}
                        onChange={(e) => {
                          const edad = Number(e.target.value) || 0;
                          onUpdateIrpf({
                            ...irpfInput,
                            descendientes: irpfInput.descendientes.map((x) =>
                              x.id === d.id ? { ...x, edad } : x
                            ),
                          });
                        }}
                        className="w-16 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={d.discapacidad33}
                        onChange={(e) =>
                          onUpdateIrpf({
                            ...irpfInput,
                            descendientes: irpfInput.descendientes.map((x) =>
                              x.id === d.id ? { ...x, discapacidad33: e.target.checked } : x
                            ),
                          })
                        }
                      />
                      Disc. ≥33%
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveDescendiente(d.id)}
                    className="text-slate-400 hover:text-red-700"
                    title="Eliminar descendiente"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Formularios de Declarante 1 y Declarante 2 */}
      <section className={`grid grid-cols-1 gap-6 ${haySegundo ? 'lg:grid-cols-2' : ''}`}>
        {renderContribuyenteCard('Declarante 1', irpfInput.declarante1, updateD1)}
        {haySegundo && renderContribuyenteCard('Declarante 2', irpfInput.declarante2, updateD2)}
      </section>

      {/* Tabla Comparativa Exacta Individual vs Conjunta (>= 16px) */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 p-6 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Liquidación Comparativa AEAT: Individual vs. Tributación Conjunta
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Cálculo exacto tramo a tramo (Estatal + {COMUNIDADES_AUTONOMAS_LABELS[irpfInput.comunidadAutonoma]} + Base del Ahorro)
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-3.5 pl-6 pr-4">Concepto Tributario (Ley 35/2006)</th>
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3.5 text-right">
                    {col.data?.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  Rendimiento neto trabajo reducido (Art. 20)
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-right font-mono tabular-nums">
                    {col.data?.elegible ? formatEUR(col.data.rendimientoNetoTrabajoReducido) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  Rendimiento neto autónomos (EDS - 5% difícil justif.)
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-right font-mono tabular-nums">
                    {col.data?.elegible ? formatEUR(col.data.rendimientoNetoAutonomo) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  Reducción tributación conjunta (Art. 84.2)
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-right font-mono tabular-nums">
                    {col.data?.elegible ? formatEUR(col.data.reduccionTributacionConjunta) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  Base liquidable general
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                    {col.data?.elegible ? formatEUR(col.data.baseLiquidableGeneral) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  Base liquidable del ahorro (Cuenta remunerada)
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-right font-mono tabular-nums">
                    {col.data?.elegible ? formatEUR(col.data.baseLiquidableAhorro) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  Mínimo personal y familiar (Contribuyente + Descendientes)
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-right font-mono tabular-nums">
                    {col.data?.elegible ? formatEUR(col.data.minimoTotal) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  Cuota íntegra total (Estatal + Autonómica + Ahorro)
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                    {col.data?.elegible ? formatEUR(col.data.cuotaIntegraTotal) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-blue-800 dark:text-blue-300">
                  Deducción vivienda habitual DT 18.ª (15%)
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-3 text-right font-mono font-semibold text-blue-700 tabular-nums dark:text-blue-400"
                  >
                    {col.data?.elegible ? `-${formatEUR(col.data.deduccionViviendaHabitual)}` : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  Eficiencia energética + Autonómicas + Maternidad/Fam. Num.
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-right font-mono tabular-nums">
                    {col.data?.elegible
                      ? `-${formatEUR(
                          col.data.deduccionEficienciaEnergetica +
                            col.data.deduccionAutonomica +
                            col.data.deduccionMaternidadYGuarderia +
                            col.data.deduccionFamiliaNumerosa
                        )}`
                      : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 pl-6 pr-4 font-medium text-slate-800 dark:text-slate-200">
                  Retenciones y pagos a cuenta (Nómina + Mod. 130 + 19% Ahorro)
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-right font-mono tabular-nums">
                    {col.data?.elegible ? `-${formatEUR(col.data.retencionesYPagosCuenta)}` : '—'}
                  </td>
                ))}
              </tr>
              <tr className="bg-slate-50 font-bold dark:bg-slate-950/60">
                <td className="py-4 pl-6 pr-4 text-lg text-slate-900 dark:text-white">
                  Resultado de la Declaración (Cuota Diferencial)
                </td>
                {columns.map((col) => {
                  const res = col.data?.resultadoDeclaracion ?? 0;
                  return (
                    <td
                      key={col.key}
                      className={`px-4 py-4 text-right font-mono text-lg tabular-nums ${
                        !col.data?.elegible
                          ? 'text-slate-400'
                          : res <= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {col.data?.elegible ? formatResultadoLabel(res) : 'No elegible'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
