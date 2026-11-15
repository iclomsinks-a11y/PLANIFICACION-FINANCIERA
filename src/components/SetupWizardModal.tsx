import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  TEMPLATE_METADATA,
  createEconomyTemplateState,
} from '../data/economyTemplates';
import {
  COMUNIDADES_AUTONOMAS_LABELS,
} from '../engines/irpfEngine';
import { SITUACION_LABORAL_LABELS } from '../engines/economyEngine';
import {
  EconomyWorkspaceState,
  FinancialMovement,
  HouseholdMember,
  MemberRole,
  MovementRecurrence,
  SituacionLaboral,
  TemplateId,
} from '../types/economy';
import {
  ComunidadAutonoma,
  EstrategiaAmortizacion,
  ModalidadFiscalHipoteca,
  UnidadFamiliarTipo,
} from '../types/finance';
import { computeFinancedInstallment } from '../utils/financing';
import { formatEUR } from '../utils/formatters';

interface SetupWizardModalProps {
  initialState: EconomyWorkspaceState;
  initialSupuestoName: string;
  onClose: () => void;
  onApply: (nextState: EconomyWorkspaceState, supuestoName: string) => void;
}

const MODALITIES: { id: TemplateId; title: string; subtitle: string }[] = [
  {
    id: 'unidad_familiar',
    title: 'Familiar · Unidad Familiar',
    subtitle: '2 adultos y dependientes/adolescentes, cuentas compartidas, hipoteca e IRPF.',
  },
  {
    id: 'adulto_individual',
    title: 'Personal · Adulto Individual',
    subtitle: '1 adulto independiente con nómina o autónomo, presupuestos COICOP, hipoteca e IRPF.',
  },
  {
    id: 'adolescente',
    title: 'Personal · Adolescente',
    subtitle: '1 joven con paga o becas, límite de gasto parental y objetivos de ahorro.',
  },
];

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  initialState,
  initialSupuestoName,
  onClose,
  onApply,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [supuestoName, setSupuestoName] = useState(initialSupuestoName);
  const [draft, setDraft] = useState<EconomyWorkspaceState>(() =>
    structuredClone(initialState)
  );
  const [adolescentMonthlyAllowance, setAdolescentMonthlyAllowance] = useState<number>(() => {
    const mov = initialState.movements.find(
      (m) => m.tipo === 'ingreso' && m.recurrencia === 'mensual'
    );
    return mov?.importe ?? 85;
  });

  const [newExpConcept, setNewExpConcept] = useState('');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpCategory, setNewExpCategory] = useState('cat-vivienda');
  const [newExpRecurrence, setNewExpRecurrence] = useState<MovementRecurrence>('mensual');
  const [newExpFinanciado, setNewExpFinanciado] = useState(false);
  const [newExpMensualidades, setNewExpMensualidades] = useState('12');
  const [newExpTinPct, setNewExpTinPct] = useState('0');

  const isAdolescent = draft.templateId === 'adolescente';

  const steps = useMemo(() => {
    const base = [
      { id: 'modalidad', label: '1. Modalidad' },
      { id: 'miembros', label: '2. Miembros' },
      { id: 'ingresos', label: '3. Ingresos' },
      { id: 'gastos', label: '4. Listado de gastos' },
      { id: 'cuentas', label: '5. Cuentas y Colchón' },
      { id: 'presupuesto', label: '6. Presupuesto' },
    ];
    if (!isAdolescent) {
      base.push(
        { id: 'hipoteca', label: '7. Hipoteca CBP' },
        { id: 'irpf', label: '8. Renta IRPF' },
        { id: 'resumen', label: '9. Confirmar' }
      );
    } else {
      base.push({ id: 'resumen', label: '7. Confirmar' });
    }
    return base;
  }, [isAdolescent]);

  const currentStep = steps[stepIndex] ?? steps[0];

  const handleSelectModality = (tplId: TemplateId) => {
    if (tplId === draft.templateId) return;
    const fresh = createEconomyTemplateState(tplId);
    setDraft(fresh);
    if (tplId === 'adolescente') {
      const mov = fresh.movements.find(
        (m) => m.tipo === 'ingreso' && m.recurrencia === 'mensual'
      );
      setAdolescentMonthlyAllowance(mov?.importe ?? 85);
    }
  };

  const handleAddFamilyMember = () => {
    const nextIdx = draft.members.length + 1;
    const newMem: HouseholdMember = {
      id: `mem-${Date.now()}`,
      nombre: `Miembro ${nextIdx}`,
      rol: 'limitado',
      edad: 15,
      esTitularFiscal: false,
      limiteGastoMensual: 60,
    };
    setDraft((prev) => ({
      ...prev,
      members: [...prev.members, newMem],
    }));
  };

  const handleRemoveMember = (id: string) => {
    if (draft.members.length <= 1) return;
    setDraft((prev) => {
      const remaining = prev.members.filter((m) => m.id !== id);
      const fallbackId = remaining[0].id;
      return {
        ...prev,
        actingMemberId: prev.actingMemberId === id ? fallbackId : prev.actingMemberId,
        activeMemberScope: prev.activeMemberScope === id ? 'todos' : prev.activeMemberScope,
        members: remaining,
      };
    });
  };

  const handleAddWizardExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmount = Number(newExpAmount);
    if (!newExpConcept.trim() || Number.isNaN(rawAmount) || rawAmount <= 0) return;

    const catObj =
      draft.categories.find((c) => c.id === newExpCategory) ??
      draft.categories.find((c) => c.tipo === 'gasto');
    const primaryAcc = draft.accounts[0];
    const primaryMem = draft.members[0];

    const isFin = newExpFinanciado;
    const months = Math.max(2, Math.floor(Number(newExpMensualidades) || 12));
    const tin = Math.max(0, Number(newExpTinPct) || 0);
    const finCalc = isFin ? computeFinancedInstallment(rawAmount, months, tin) : null;

    const created: FinancialMovement = {
      id: `mov-wiz-exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tipo: 'gasto',
      importe: isFin && finCalc ? finCalc.cuotaMensual : rawAmount,
      fecha: '2026-11-13',
      concepto: newExpConcept.trim(),
      categoriaId: catObj?.id ?? 'cat-vivienda',
      subcategoria: catObj?.subcategorias[0] ?? 'General',
      cuentaId: primaryAcc?.id ?? '',
      miembroId: primaryMem?.id ?? draft.actingMemberId,
      visibilidad: draft.mode === 'familiar' ? 'compartida' : 'privada',
      recurrencia: isFin ? 'mensual' : newExpRecurrence,
      estado: 'confirmado',
      financiado: isFin || undefined,
      importeTotalFinanciado: isFin ? rawAmount : undefined,
      mensualidadesTotal: isFin ? months : undefined,
      tinFinanciacionPct: isFin ? tin : undefined,
      cuotaMensualFinanciada: isFin && finCalc ? finCalc.cuotaMensual : undefined,
    };

    setDraft((prev) => ({
      ...prev,
      movements: [created, ...prev.movements],
    }));
    setNewExpConcept('');
    setNewExpAmount('');
    setNewExpFinanciado(false);
  };

  const handleApplyAndFinish = () => {
    const finalName = supuestoName.trim() || initialSupuestoName;
    const primaryAccount = draft.accounts[0];
    const remuneratedAcc =
      draft.accounts.find((a) => a.tipo === 'remunerada') ??
      draft.accounts.find((a) => a.tipo === 'ahorro');

    // Sincronizar movimientos base de ingresos mensuales en 2026-11 para reflejar lo introducido en el asistente
    let updatedMovements: FinancialMovement[] = [...draft.movements];

    if (isAdolescent) {
      const idx = updatedMovements.findIndex(
        (m) => m.tipo === 'ingreso' && m.recurrencia === 'mensual'
      );
      if (idx >= 0) {
        updatedMovements[idx] = {
          ...updatedMovements[idx],
          importe: Math.max(0, adolescentMonthlyAllowance),
        };
      } else if (primaryAccount && adolescentMonthlyAllowance > 0) {
        updatedMovements.unshift({
          id: `mov-wiz-inc-${Date.now()}`,
          tipo: 'ingreso',
          importe: adolescentMonthlyAllowance,
          fecha: '2026-11-01',
          concepto: 'Paga o asignación mensual',
          categoriaId: 'cat-ingresos',
          subcategoria: 'Paga familiar / regalos',
          cuentaId: primaryAccount.id,
          miembroId: draft.members[0]?.id ?? draft.actingMemberId,
          visibilidad: 'compartida',
          recurrencia: 'mensual',
          estado: 'confirmado',
        });
      }
    } else {
      // Actualizar o crear ingresos mensuales por adulto según su situación actual
      const adultMembers = draft.members.filter((m) => m.rol !== 'limitado');
      for (const adult of adultMembers) {
        const sit: SituacionLaboral =
          adult.situacionActual ?? (adult.esNomina ? 'cuenta_ajena' : 'autonomo');
        const net = sit === 'desempleado' ? 0 : Math.max(0, adult.salarioNetoMensual ?? 0);

        const conceptLabel =
          sit === 'parado_con_subsidio'
            ? `Subsidio / prestación (${adult.nombre})`
            : sit === 'desempleado'
              ? `Sin ingresos laborales (${adult.nombre})`
              : sit === 'cuenta_ajena'
                ? `Nómina mensual (${adult.nombre})`
                : `Ingresos actividad (${adult.nombre})`;
        const subcatLabel =
          sit === 'parado_con_subsidio'
            ? 'Pensión / prestación'
            : sit === 'cuenta_ajena'
              ? 'Nómina'
              : sit === 'autonomo'
                ? 'Actividad autónoma'
                : 'Pensión / prestación';

        const existingIdx = updatedMovements.findIndex(
          (m) =>
            m.tipo === 'ingreso' &&
            m.recurrencia === 'mensual' &&
            m.miembroId === adult.id
        );
        if (existingIdx >= 0) {
          updatedMovements[existingIdx] = {
            ...updatedMovements[existingIdx],
            importe: net,
            concepto: conceptLabel,
            subcategoria: subcatLabel,
          };
        } else if (primaryAccount && net > 0) {
          updatedMovements.unshift({
            id: `mov-wiz-inc-${adult.id}-${Date.now()}`,
            tipo: 'ingreso',
            importe: net,
            fecha: '2026-11-01',
            concepto: conceptLabel,
            categoriaId: 'cat-ingresos',
            subcategoria: subcatLabel,
            cuentaId: primaryAccount.id,
            miembroId: adult.id,
            visibilidad: draft.mode === 'familiar' ? 'compartida' : 'privada',
            recurrencia: 'mensual',
            estado: 'confirmado',
          });
        }
      }
    }

    // Sincronizar saldo de cuenta remunerada con el simulador hipotecario si aplica
    const syncedMortgageInput = {
      ...draft.mortgageInput,
      saldoInicialEfectivo: remuneratedAcc
        ? remuneratedAcc.saldoInicial
        : draft.mortgageInput.saldoInicialEfectivo,
      taeCuentaRemunerada: remuneratedAcc
        ? remuneratedAcc.taePct
        : draft.mortgageInput.taeCuentaRemunerada,
    };

    onApply(
      {
        ...draft,
        movements: updatedMovements,
        mortgageInput: syncedMortgageInput,
      },
      finalName
    );
  };

  const totalMonthlyIncomePreview = isAdolescent
    ? adolescentMonthlyAllowance
    : draft.members
        .filter((m) => m.rol !== 'limitado')
        .reduce(
          (acc, m) =>
            acc + (m.situacionActual === 'desempleado' ? 0 : (m.salarioNetoMensual ?? 0)),
          0
        );

  const totalMonthlyBudgetPreview = draft.categories
    .filter((c) => !c.oculta && c.tipo === 'gasto')
    .reduce((acc, c) => acc + c.presupuestoMensual, 0);

  const totalAccountsInitial = draft.accounts.reduce(
    (acc, a) => acc + a.saldoInicial,
    0
  );

  const haySegundoDeclarante =
    draft.irpfInput.tipoUnidadFamiliar === 'matrimonio' ||
    draft.irpfInput.tipoUnidadFamiliar === 'pareja_de_hecho';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Asistente de configuración inicial"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Cabecera del Asistente */}
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Asistente Guiado de Configuración
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Paso {stepIndex + 1} de {steps.length} · {currentStep.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Cerrar asistente"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Indicador de Progreso por Pasos */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-6 py-2.5 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2">
            {steps.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStepIndex(idx)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  idx === stepIndex
                    ? 'bg-blue-700 text-white'
                    : idx < stepIndex
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenido del Paso Activo */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {currentStep.id === 'modalidad' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Escoge la modalidad y nombra este supuesto
                </h3>
                <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
                  El asistente adaptará automáticamente los pasos siguientes (miembros, ingresos,
                  hipoteca y Renta IRPF) según la modalidad elegida.
                </p>
              </div>

              <label className="block space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Nombre del supuesto</span>
                <input
                  type="text"
                  value={supuestoName}
                  onChange={(e) => setSupuestoName(e.target.value)}
                  placeholder="Ej. Supuesto 1"
                  className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {MODALITIES.map((mod) => {
                  const selected = draft.templateId === mod.id;
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => handleSelectModality(mod.id)}
                      className={`rounded-xl border-2 p-4 text-left transition-colors ${
                        selected
                          ? 'border-blue-700 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                      }`}
                    >
                      <p className="text-base font-bold text-slate-900 dark:text-white">
                        {mod.title}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                        {mod.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                Modalidad seleccionada:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {TEMPLATE_METADATA[draft.templateId].nombre}
                </strong>{' '}
                — {TEMPLATE_METADATA[draft.templateId].subtitulo}
              </div>
            </div>
          )}

          {currentStep.id === 'miembros' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Miembros del hogar, edades y control parental
                  </h3>
                  <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
                    Define quién forma parte del supuesto y si algún miembro tiene rol limitado con
                    tope mensual.
                  </p>
                </div>
                {draft.templateId === 'unidad_familiar' && (
                  <button
                    type="button"
                    onClick={handleAddFamilyMember}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Añadir miembro
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {draft.members.map((mem) => (
                  <div
                    key={mem.id}
                    className="grid grid-cols-1 gap-3 py-4 md:grid-cols-12 md:items-end"
                  >
                    <label className="space-y-1 text-sm font-semibold text-slate-700 md:col-span-4 dark:text-slate-300">
                      <span>Nombre</span>
                      <input
                        type="text"
                        value={mem.nombre}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            members: prev.members.map((m) =>
                              m.id === mem.id ? { ...m, nombre: e.target.value } : m
                            ),
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>

                    <label className="space-y-1 text-sm font-semibold text-slate-700 md:col-span-3 dark:text-slate-300">
                      <span>Rol</span>
                      <select
                        value={mem.rol}
                        onChange={(e) => {
                          const nextRol = e.target.value as MemberRole;
                          setDraft((prev) => ({
                            ...prev,
                            members: prev.members.map((m) =>
                              m.id === mem.id
                                ? {
                                    ...m,
                                    rol: nextRol,
                                    esTitularFiscal: nextRol !== 'limitado',
                                    limiteGastoMensual:
                                      nextRol === 'limitado'
                                        ? m.limiteGastoMensual ?? 80
                                        : undefined,
                                  }
                                : m
                            ),
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="admin">Administrador</option>
                        <option value="adulto">Adulto</option>
                        <option value="limitado">Limitado (Parental)</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-sm font-semibold text-slate-700 md:col-span-2 dark:text-slate-300">
                      <span>Edad</span>
                      <input
                        type="number"
                        min="1"
                        max="105"
                        value={mem.edad}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            members: prev.members.map((m) =>
                              m.id === mem.id
                                ? { ...m, edad: Math.max(1, Number(e.target.value) || 18) }
                                : m
                            ),
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>

                    <div className="md:col-span-2">
                      {mem.rol === 'limitado' && (
                        <label className="space-y-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
                          <span>Tope €/mes</span>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            value={mem.limiteGastoMensual ?? 0}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                members: prev.members.map((m) =>
                                  m.id === mem.id
                                    ? {
                                        ...m,
                                        limiteGastoMensual: Math.max(
                                          0,
                                          Number(e.target.value) || 0
                                        ),
                                      }
                                    : m
                                ),
                              }))
                            }
                            className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-amber-700 dark:bg-slate-800 dark:text-white"
                          />
                        </label>
                      )}
                    </div>

                    <div className="flex justify-end md:col-span-1">
                      {draft.members.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(mem.id)}
                          className="rounded-lg p-2 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          title="Eliminar miembro"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep.id === 'ingresos' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {isAdolescent
                    ? 'Paga mensual y asignaciones del joven'
                    : 'Situación laboral actual, ingresos y previsión futura'}
                </h3>
                <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
                  {isAdolescent
                    ? 'Indica el importe mensual habitual que recibe el perfil joven.'
                    : 'Selecciona la situación actual (parado con subsidio, desempleado, cuenta ajena o autónomo) y planifica si habrá una situación futura con mes, año y cuantía prevista.'}
                </p>
              </div>

              {isAdolescent ? (
                <label className="block max-w-sm space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span>Paga o ingreso mensual habitual (€/mes)</span>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={adolescentMonthlyAllowance}
                    onChange={(e) =>
                      setAdolescentMonthlyAllowance(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-lg font-bold tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {draft.members
                    .filter((m) => m.rol !== 'limitado')
                    .map((adult) => {
                      const sitActual: SituacionLaboral =
                        adult.situacionActual ??
                        (adult.esNomina ? 'cuenta_ajena' : 'autonomo');
                      const futureConfig = adult.situacionFutura ?? {
                        activo: Boolean(adult.salarioFuturo?.activo),
                        situacion: sitActual,
                        mes: adult.salarioFuturo?.mes ?? 1,
                        anio: adult.salarioFuturo?.anio ?? 2027,
                        cuantiaPrevision:
                          adult.salarioFuturo?.importePrevisto ??
                          Math.round((adult.salarioNetoMensual ?? 1800) * 1.05),
                      };

                      const amountLabel =
                        sitActual === 'parado_con_subsidio'
                          ? 'Cuantía del subsidio (€/mes)'
                          : sitActual === 'desempleado'
                            ? 'Cuantía actual (€/mes)'
                            : sitActual === 'cuenta_ajena'
                              ? 'Salario neto cuenta ajena (€/mes)'
                              : 'Ingreso neto autónomo (€/mes)';

                      return (
                        <div key={adult.id} className="space-y-4 py-4">
                          <p className="text-base font-bold text-slate-900 dark:text-white">
                            {adult.nombre}
                          </p>

                          {/* Situación Actual */}
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                              <span>Situación actual</span>
                              <select
                                value={sitActual}
                                onChange={(e) => {
                                  const nextSit = e.target.value as SituacionLaboral;
                                  setDraft((prev) => ({
                                    ...prev,
                                    members: prev.members.map((m) =>
                                      m.id === adult.id
                                        ? {
                                            ...m,
                                            situacionActual: nextSit,
                                            esNomina: nextSit === 'cuenta_ajena',
                                            salarioNetoMensual:
                                              nextSit === 'desempleado'
                                                ? 0
                                                : nextSit === 'parado_con_subsidio' &&
                                                    (m.salarioNetoMensual ?? 0) === 0
                                                  ? 480
                                                  : m.salarioNetoMensual ?? 1500,
                                          }
                                        : m
                                    ),
                                  }));
                                }}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                              >
                                {Object.entries(SITUACION_LABORAL_LABELS).map(([val, label]) => (
                                  <option key={val} value={val}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                              <span>{amountLabel}</span>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                disabled={sitActual === 'desempleado'}
                                value={
                                  sitActual === 'desempleado' ? 0 : (adult.salarioNetoMensual ?? 0)
                                }
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value) || 0);
                                  setDraft((prev) => ({
                                    ...prev,
                                    members: prev.members.map((m) =>
                                      m.id === adult.id
                                        ? { ...m, salarioNetoMensual: val }
                                        : m
                                    ),
                                  }));
                                }}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base font-bold text-emerald-700 tabular-nums disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400 dark:disabled:bg-slate-900"
                              />
                            </label>
                          </div>

                          {/* Situación Futura */}
                          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
                            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                              <input
                                type="checkbox"
                                checked={futureConfig.activo}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setDraft((prev) => ({
                                    ...prev,
                                    members: prev.members.map((m) =>
                                      m.id === adult.id
                                        ? {
                                            ...m,
                                            situacionFutura: {
                                              ...futureConfig,
                                              activo: checked,
                                            },
                                            salarioFuturo: {
                                              activo: checked,
                                              mes: futureConfig.mes,
                                              anio: futureConfig.anio,
                                              importePrevisto: futureConfig.cuantiaPrevision,
                                            },
                                          }
                                        : m
                                    ),
                                  }));
                                }}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              <span>Situación futura prevista (cambio laboral o de cuantía)</span>
                            </label>

                            {futureConfig.activo && (
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                                  <span>Situación futura</span>
                                  <select
                                    value={futureConfig.situacion}
                                    onChange={(e) => {
                                      const nextFutSit = e.target.value as SituacionLaboral;
                                      const nextPrevVal =
                                        nextFutSit === 'desempleado'
                                          ? 0
                                          : futureConfig.cuantiaPrevision;
                                      setDraft((prev) => ({
                                        ...prev,
                                        members: prev.members.map((m) =>
                                          m.id === adult.id
                                            ? {
                                                ...m,
                                                situacionFutura: {
                                                  ...futureConfig,
                                                  activo: true,
                                                  situacion: nextFutSit,
                                                  cuantiaPrevision: nextPrevVal,
                                                },
                                                salarioFuturo: {
                                                  activo: true,
                                                  mes: futureConfig.mes,
                                                  anio: futureConfig.anio,
                                                  importePrevisto: nextPrevVal,
                                                },
                                              }
                                            : m
                                        ),
                                      }));
                                    }}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                  >
                                    {Object.entries(SITUACION_LABORAL_LABELS).map(
                                      ([val, label]) => (
                                        <option key={val} value={val}>
                                          {label}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </label>

                                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                                  <span>Mes</span>
                                  <select
                                    value={futureConfig.mes}
                                    onChange={(e) => {
                                      const nextMes = Number(e.target.value);
                                      setDraft((prev) => ({
                                        ...prev,
                                        members: prev.members.map((m) =>
                                          m.id === adult.id
                                            ? {
                                                ...m,
                                                situacionFutura: {
                                                  ...futureConfig,
                                                  activo: true,
                                                  mes: nextMes,
                                                },
                                                salarioFuturo: {
                                                  activo: true,
                                                  mes: nextMes,
                                                  anio: futureConfig.anio,
                                                  importePrevisto: futureConfig.cuantiaPrevision,
                                                },
                                              }
                                            : m
                                        ),
                                      }));
                                    }}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                  >
                                    {Array.from({ length: 12 }, (_, idx) => idx + 1).map(
                                      (mNum) => (
                                        <option key={mNum} value={mNum}>
                                          {String(mNum).padStart(2, '0')}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </label>

                                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                                  <span>Año</span>
                                  <input
                                    type="number"
                                    min="2026"
                                    max="2060"
                                    value={futureConfig.anio}
                                    onChange={(e) => {
                                      const nextAnio = Number(e.target.value) || 2027;
                                      setDraft((prev) => ({
                                        ...prev,
                                        members: prev.members.map((m) =>
                                          m.id === adult.id
                                            ? {
                                                ...m,
                                                situacionFutura: {
                                                  ...futureConfig,
                                                  activo: true,
                                                  anio: nextAnio,
                                                },
                                                salarioFuturo: {
                                                  activo: true,
                                                  mes: futureConfig.mes,
                                                  anio: nextAnio,
                                                  importePrevisto: futureConfig.cuantiaPrevision,
                                                },
                                              }
                                            : m
                                        ),
                                      }));
                                    }}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                  />
                                </label>

                                <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                                  <span>Cuantía previsión (€/mes)</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="10"
                                    disabled={futureConfig.situacion === 'desempleado'}
                                    value={
                                      futureConfig.situacion === 'desempleado'
                                        ? 0
                                        : futureConfig.cuantiaPrevision
                                    }
                                    onChange={(e) => {
                                      const nextVal = Math.max(0, Number(e.target.value) || 0);
                                      setDraft((prev) => ({
                                        ...prev,
                                        members: prev.members.map((m) =>
                                          m.id === adult.id
                                            ? {
                                                ...m,
                                                situacionFutura: {
                                                  ...futureConfig,
                                                  activo: true,
                                                  cuantiaPrevision: nextVal,
                                                },
                                                salarioFuturo: {
                                                  activo: true,
                                                  mes: futureConfig.mes,
                                                  anio: futureConfig.anio,
                                                  importePrevisto: nextVal,
                                                },
                                              }
                                            : m
                                        ),
                                      }));
                                    }}
                                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-bold text-emerald-700 tabular-nums disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400 dark:disabled:bg-slate-900"
                                  />
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {currentStep.id === 'gastos' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Listado de gastos del supuesto
                </h3>
                <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
                  Revisa, edita o añade tus gastos fijos y puntuales (vivienda, alimentación,
                  suministros, seguros, ocio o extraordinarios).
                </p>
              </div>

              <form
                onSubmit={handleAddWizardExpense}
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-12">
                  <input
                    type="text"
                    required
                    value={newExpConcept}
                    onChange={(e) => setNewExpConcept(e.target.value)}
                    placeholder="Nuevo gasto (ej. Alquiler, Luz, Electrodoméstico...)"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm md:col-span-4 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <select
                    value={newExpCategory}
                    onChange={(e) => setNewExpCategory(e.target.value)}
                    aria-label="Categoría del gasto"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm md:col-span-3 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {draft.categories
                      .filter((c) => !c.oculta && c.tipo === 'gasto')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                  </select>
                  <select
                    value={newExpFinanciado ? 'mensual' : newExpRecurrence}
                    disabled={newExpFinanciado}
                    onChange={(e) => setNewExpRecurrence(e.target.value as MovementRecurrence)}
                    aria-label="Recurrencia del gasto"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm disabled:opacity-60 md:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="trimestral">Trimestral</option>
                    <option value="anual">Anual</option>
                    <option value="puntual">Puntual</option>
                  </select>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={newExpAmount}
                    onChange={(e) => setNewExpAmount(e.target.value)}
                    placeholder={newExpFinanciado ? 'Total financiado (€)' : 'Importe (€)'}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums md:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 md:col-span-1"
                    title="Añadir gasto al listado"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="md:hidden">Añadir</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newExpFinanciado}
                      onChange={(e) => setNewExpFinanciado(e.target.checked)}
                    />
                    <span>
                      Gasto extraordinario financiado (indicar importe total y mensualidades)
                    </span>
                  </label>

                  {newExpFinanciado && (
                    <>
                      <label className="inline-flex items-center gap-1.5">
                        <span>Mensualidades:</span>
                        <input
                          type="number"
                          min="2"
                          max="120"
                          value={newExpMensualidades}
                          onChange={(e) => setNewExpMensualidades(e.target.value)}
                          className="w-16 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs tabular-nums dark:border-slate-700 dark:bg-slate-800"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1.5">
                        <span>TIN (%):</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={newExpTinPct}
                          onChange={(e) => setNewExpTinPct(e.target.value)}
                          className="w-16 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs tabular-nums dark:border-slate-700 dark:bg-slate-800"
                        />
                      </label>
                      {Number(newExpAmount) > 0 && (
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          Cuota mensual:{' '}
                          {formatEUR(
                            computeFinancedInstallment(
                              Number(newExpAmount),
                              Number(newExpMensualidades) || 12,
                              Number(newExpTinPct) || 0
                            ).cuotaMensual
                          )}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </form>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {draft.movements.filter((m) => m.tipo === 'gasto').length === 0 ? (
                  <p className="py-6 text-center text-base text-slate-500 dark:text-slate-400">
                    No hay gastos en este listado todavía. Añade uno arriba para empezar.
                  </p>
                ) : (
                  draft.movements
                    .filter((m) => m.tipo === 'gasto')
                    .map((exp) => (
                      <div
                        key={exp.id}
                        className="grid grid-cols-1 gap-2.5 py-3 md:grid-cols-12 md:items-center"
                      >
                        <input
                          type="text"
                          value={exp.concepto}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              movements: prev.movements.map((m) =>
                                m.id === exp.id ? { ...m, concepto: e.target.value } : m
                              ),
                            }))
                          }
                          aria-label="Concepto de gasto"
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium md:col-span-4 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />

                        <select
                          value={exp.categoriaId}
                          onChange={(e) => {
                            const nextCat = draft.categories.find(
                              (c) => c.id === e.target.value
                            );
                            setDraft((prev) => ({
                              ...prev,
                              movements: prev.movements.map((m) =>
                                m.id === exp.id
                                  ? {
                                      ...m,
                                      categoriaId: e.target.value,
                                      subcategoria:
                                        nextCat?.subcategorias[0] ?? m.subcategoria,
                                    }
                                  : m
                              ),
                            }));
                          }}
                          aria-label="Categoría de gasto"
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm md:col-span-3 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          {draft.categories
                            .filter((c) => !c.oculta && c.tipo === 'gasto')
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                        </select>

                        <select
                          value={exp.recurrencia}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              movements: prev.movements.map((m) =>
                                m.id === exp.id
                                  ? {
                                      ...m,
                                      recurrencia: e.target.value as MovementRecurrence,
                                    }
                                  : m
                              ),
                            }))
                          }
                          aria-label="Recurrencia"
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm md:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="mensual">Mensual</option>
                          <option value="trimestral">Trimestral</option>
                          <option value="anual">Anual</option>
                          <option value="puntual">Puntual</option>
                        </select>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={exp.importe}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              movements: prev.movements.map((m) =>
                                m.id === exp.id
                                  ? {
                                      ...m,
                                      importe: Math.max(0, Number(e.target.value) || 0),
                                    }
                                  : m
                              ),
                            }))
                          }
                          aria-label="Importe del gasto"
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono text-sm font-semibold text-red-700 tabular-nums md:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-red-400"
                        />

                        <div className="flex justify-end md:col-span-1">
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                movements: prev.movements.filter((m) => m.id !== exp.id),
                              }))
                            }
                            title="Eliminar gasto"
                            className="rounded-lg p-1.5 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">
                  Total de gastos en listado:{' '}
                  <strong className="font-mono text-slate-900 tabular-nums dark:text-white">
                    {draft.movements.filter((m) => m.tipo === 'gasto').length}
                  </strong>
                </span>
                <span className="text-slate-600 dark:text-slate-400">
                  Suma de importes listados:{' '}
                  <strong className="font-mono text-red-700 tabular-nums dark:text-red-400">
                    {formatEUR(
                      draft.movements
                        .filter((m) => m.tipo === 'gasto')
                        .reduce((acc, m) => acc + m.importe, 0)
                    )}
                  </strong>
                </span>
              </div>
            </div>
          )}

          {currentStep.id === 'cuentas' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Saldos iniciales en cuentas, colchón de seguridad y fondos reservados
                </h3>
                <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
                  Indica el dinero actual en tus cuentas y cuánto quieres proteger como colchón o
                  fondo reservado.
                </p>
              </div>

              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {draft.accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="grid grid-cols-1 gap-3 py-3.5 md:grid-cols-4 md:items-center"
                  >
                    <div className="md:col-span-2">
                      <p className="font-semibold text-slate-900 dark:text-white">{acc.nombre}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {acc.visibilidad === 'compartida' ? 'Compartida' : 'Privada'}
                      </p>
                    </div>
                    <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <span>Saldo inicial (€)</span>
                      <input
                        type="number"
                        step="50"
                        value={acc.saldoInicial}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            accounts: prev.accounts.map((a) =>
                              a.id === acc.id
                                ? { ...a, saldoInicial: Number(e.target.value) || 0 }
                                : a
                            ),
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                      <span>TAE (%)</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={acc.taePct}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            accounts: prev.accounts.map((a) =>
                              a.id === acc.id
                                ? { ...a, taePct: Math.max(0, Number(e.target.value) || 0) }
                                : a
                            ),
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>
                  </div>
                ))}
              </div>

              {!isAdolescent && (
                <label className="block max-w-sm space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span>Colchón de seguridad intocable (€)</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={draft.mortgageInput.colchonSeguridad}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        mortgageInput: {
                          ...prev.mortgageInput,
                          colchonSeguridad: Math.max(0, Number(e.target.value) || 0),
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base font-bold text-blue-700 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
                  />
                </label>
              )}

              <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Fondos Reservados Iniciales
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {draft.savingsGoals.map((goal) => (
                    <div
                      key={goal.id}
                      className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <p className="col-span-2 text-sm font-bold text-slate-900 dark:text-white">
                        {goal.nombre}
                      </p>
                      <label className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <span>Reservado (€)</span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={goal.saldoReservado}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              savingsGoals: prev.savingsGoals.map((g) =>
                                g.id === goal.id
                                  ? {
                                      ...g,
                                      saldoReservado: Math.max(0, Number(e.target.value) || 0),
                                    }
                                  : g
                              ),
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </label>
                      <label className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <span>Meta objetivo (€)</span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={goal.importeObjetivo}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              savingsGoals: prev.savingsGoals.map((g) =>
                                g.id === goal.id
                                  ? {
                                      ...g,
                                      importeObjetivo: Math.max(0, Number(e.target.value) || 0),
                                    }
                                  : g
                              ),
                            }))
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'presupuesto' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Límites mensuales de gasto por categoría COICOP
                </h3>
                <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
                  Establece tu presupuesto mensual previsto. Total asignado:{' '}
                  <strong className="font-mono text-slate-900 tabular-nums dark:text-white">
                    {formatEUR(totalMonthlyBudgetPreview)} / mes
                  </strong>
                  .
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {draft.categories
                  .filter((c) => !c.oculta && c.tipo === 'gasto')
                  .map((cat) => (
                    <label
                      key={cat.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {cat.nombre}
                        </p>
                        <p className="text-xs text-slate-500">COICOP {cat.coicopCode}</p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={cat.presupuestoMensual}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            categories: prev.categories.map((c) =>
                              c.id === cat.id
                                ? {
                                    ...c,
                                    presupuestoMensual: Math.max(0, Number(e.target.value) || 0),
                                  }
                                : c
                            ),
                          }))
                        }
                        className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>
                  ))}
              </div>
            </div>
          )}

          {currentStep.id === 'hipoteca' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Préstamo Hipotecario y Carencia CBP
                  </h3>
                  <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
                    Si no tienes hipoteca activa, deja el capital pendiente en 0 € para simular solo
                    acumulación en cuenta remunerada.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={draft.mortgageInput.capitalPendienteInicial > 0}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        mortgageInput: {
                          ...prev.mortgageInput,
                          capitalPendienteInicial: e.target.checked
                            ? prev.mortgageInput.capitalPendienteInicial || 95000
                            : 0,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span>Tengo hipoteca activa</span>
                </label>
              </div>

              {draft.mortgageInput.capitalPendienteInicial > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Capital pendiente (€)</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={draft.mortgageInput.capitalPendienteInicial}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          mortgageInput: {
                            ...prev.mortgageInput,
                            capitalPendienteInicial: Math.max(0, Number(e.target.value) || 0),
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>TIN fase ordinaria (%)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.05"
                      value={draft.mortgageInput.tinPostCarencia}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          mortgageInput: {
                            ...prev.mortgageInput,
                            tinPostCarencia: Math.max(0, Number(e.target.value) || 0),
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Fecha vencimiento (AAAA-MM)</span>
                    <input
                      type="month"
                      value={draft.mortgageInput.fechaVencimiento}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          mortgageInput: {
                            ...prev.mortgageInput,
                            fechaVencimiento: e.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Deducción vivienda (DT 18.ª)</span>
                    <select
                      value={draft.mortgageInput.modalidadFiscal}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          mortgageInput: {
                            ...prev.mortgageInput,
                            modalidadFiscal: e.target.value as ModalidadFiscalHipoteca,
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="individual_18080">2 titulares individuales (18.080 €)</option>
                      <option value="conjunta_9040">1 titular / Conjunta (9.040 €)</option>
                      <option value="ninguna">Sin deducción (compra post-2013)</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Estrategia amortización</span>
                    <select
                      value={draft.mortgageInput.estrategia}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          mortgageInput: {
                            ...prev.mortgageInput,
                            estrategia: e.target.value as EstrategiaAmortizacion,
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="hibrida">Híbrida (bajar cuota → plazo)</option>
                      <option value="reducir_plazo">Reducir plazo</option>
                      <option value="reducir_cuota">Reducir cuota</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Seguros vinculados (€/año)</span>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={draft.mortgageInput.segurosVinculadosAnuales}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          mortgageInput: {
                            ...prev.mortgageInput,
                            segurosVinculadosAnuales: Math.max(0, Number(e.target.value) || 0),
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>

                  <div className="md:col-span-3 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={draft.mortgageInput.enCarenciaCBP}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            mortgageInput: {
                              ...prev.mortgageInput,
                              enCarenciaCBP: e.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span>En carencia Código de Buenas Prácticas (CBP)</span>
                    </label>

                    {draft.mortgageInput.enCarenciaCBP && (
                      <>
                        <label className="flex items-center gap-2 text-sm">
                          <span>Fin carencia:</span>
                          <input
                            type="month"
                            value={draft.mortgageInput.fechaFinCarenciaCBP}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                mortgageInput: {
                                  ...prev.mortgageInput,
                                  fechaFinCarenciaCBP: e.target.value,
                                },
                              }))
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <span>Cuota intereses CBP (€/mes):</span>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            value={draft.mortgageInput.cuotaInteresesCBP}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                mortgageInput: {
                                  ...prev.mortgageInput,
                                  cuotaInteresesCBP: Math.max(0, Number(e.target.value) || 0),
                                },
                              }))
                            }
                            className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-base text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  Hipoteca desactivada (capital pendiente 0 €). El simulador proyectará únicamente
                  la evolución de tus ahorros y cuenta remunerada.
                </div>
              )}
            </div>
          )}

          {currentStep.id === 'irpf' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Datos Fiscales para la Renta IRPF (Ley 35/2006)
                </h3>
                <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
                  Completa los datos anuales brutos y la situación familiar para calcular declaración
                  individual vs conjunta y devolución AEAT.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span>Comunidad Autónoma</span>
                  <select
                    value={draft.irpfInput.comunidadAutonoma}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        irpfInput: {
                          ...prev.irpfInput,
                          comunidadAutonoma: e.target.value as ComunidadAutonoma,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {Object.entries(COMUNIDADES_AUTONOMAS_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span>Unidad Familiar Fiscal</span>
                  <select
                    value={draft.irpfInput.tipoUnidadFamiliar}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        irpfInput: {
                          ...prev.irpfInput,
                          tipoUnidadFamiliar: e.target.value as UnidadFamiliarTipo,
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="matrimonio">Matrimonio</option>
                    <option value="pareja_de_hecho">Pareja de hecho</option>
                    <option value="monoparental">Monoparental</option>
                    <option value="individual">Individual</option>
                  </select>
                </label>

                <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span>Número de descendientes a cargo</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={draft.irpfInput.descendientes.length}
                    onChange={(e) => {
                      const targetCount = Math.max(0, Math.min(10, Number(e.target.value) || 0));
                      setDraft((prev) => {
                        const curr = [...prev.irpfInput.descendientes];
                        while (curr.length < targetCount) {
                          curr.push({
                            id: `desc-${Date.now()}-${curr.length + 1}`,
                            edad: 12,
                            discapacidad33: false,
                            rentasSuperiores8000: false,
                            presentaIrpfMas1800: false,
                            orden: curr.length + 1,
                          });
                        }
                        return {
                          ...prev,
                          irpfInput: {
                            ...prev.irpfInput,
                            descendientes: curr.slice(0, targetCount),
                          },
                        };
                      });
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>
              </div>

              {/* Declarante 1 */}
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  Declarante 1 ({draft.irpfInput.declarante1.nombre})
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>Salario bruto anual (€)</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={draft.irpfInput.declarante1.salarioBrutoAnual}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          irpfInput: {
                            ...prev.irpfInput,
                            declarante1: {
                              ...prev.irpfInput.declarante1,
                              salarioBrutoAnual: Math.max(0, Number(e.target.value) || 0),
                            },
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>Retenciones IRPF trabajo (€)</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={draft.irpfInput.declarante1.retencionesTrabajo}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          irpfInput: {
                            ...prev.irpfInput,
                            declarante1: {
                              ...prev.irpfInput.declarante1,
                              retencionesTrabajo: Math.max(0, Number(e.target.value) || 0),
                            },
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>Ingresos autónomo (€/año)</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={draft.irpfInput.declarante1.ingresosAutonomoAnuales}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        setDraft((prev) => ({
                          ...prev,
                          irpfInput: {
                            ...prev.irpfInput,
                            declarante1: {
                              ...prev.irpfInput.declarante1,
                              esAutonomo: val > 0,
                              ingresosAutonomoAnuales: val,
                            },
                          },
                        }));
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span>Alquiler vivienda (€/año)</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={draft.irpfInput.declarante1.gastosAlquilerAnuales}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          irpfInput: {
                            ...prev.irpfInput,
                            declarante1: {
                              ...prev.irpfInput.declarante1,
                              gastosAlquilerAnuales: Math.max(0, Number(e.target.value) || 0),
                            },
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>
                </div>
              </div>

              {/* Declarante 2 si aplica */}
              {haySegundoDeclarante && (
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    Declarante 2 ({draft.irpfInput.declarante2.nombre})
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                    <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <span>Salario bruto anual (€)</span>
                      <input
                        type="number"
                        min="0"
                        step="500"
                        value={draft.irpfInput.declarante2.salarioBrutoAnual}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            irpfInput: {
                              ...prev.irpfInput,
                              declarante2: {
                                ...prev.irpfInput.declarante2,
                                salarioBrutoAnual: Math.max(0, Number(e.target.value) || 0),
                              },
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <span>Retenciones IRPF trabajo (€)</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={draft.irpfInput.declarante2.retencionesTrabajo}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            irpfInput: {
                              ...prev.irpfInput,
                              declarante2: {
                                ...prev.irpfInput.declarante2,
                                retencionesTrabajo: Math.max(0, Number(e.target.value) || 0),
                              },
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <span>Ingresos autónomo (€/año)</span>
                      <input
                        type="number"
                        min="0"
                        step="500"
                        value={draft.irpfInput.declarante2.ingresosAutonomoAnuales}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setDraft((prev) => ({
                            ...prev,
                            irpfInput: {
                              ...prev.irpfInput,
                              declarante2: {
                                ...prev.irpfInput.declarante2,
                                esAutonomo: val > 0,
                                ingresosAutonomoAnuales: val,
                              },
                            },
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>
                    <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                      <span>Cuota RETA anual (€)</span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={draft.irpfInput.declarante2.cuotaRetaAnual}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            irpfInput: {
                              ...prev.irpfInput,
                              declarante2: {
                                ...prev.irpfInput.declarante2,
                                cuotaRetaAnual: Math.max(0, Number(e.target.value) || 0),
                              },
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep.id === 'resumen' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6 shrink-0" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Todo listo para aplicar al supuesto &ldquo;{supuestoName || initialSupuestoName}&rdquo;
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-sm text-slate-500">Modalidad y Miembros</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                    {TEMPLATE_METADATA[draft.templateId].nombre} ({draft.members.length}{' '}
                    {draft.members.length === 1 ? 'miembro' : 'miembros'})
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-sm text-slate-500">Ingresos Netos Mensuales Configurados</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                    {formatEUR(totalMonthlyIncomePreview)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-sm text-slate-500">
                    Gastos Listados ({draft.movements.filter((m) => m.tipo === 'gasto').length}) /
                    Presupuesto Mensual
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold text-red-700 tabular-nums dark:text-red-400">
                    {formatEUR(
                      draft.movements
                        .filter((m) => m.tipo === 'gasto')
                        .reduce((acc, m) => acc + m.importe, 0)
                    )}{' '}
                    <span className="text-sm font-normal text-slate-500">
                      (Límite {formatEUR(totalMonthlyBudgetPreview, false)}/mes)
                    </span>
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-sm text-slate-500">Liquidez Inicial en Cuentas</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-blue-700 tabular-nums dark:text-blue-400">
                    {formatEUR(totalAccountsInitial)}
                  </p>
                </div>

                {!isAdolescent && (
                  <>
                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <p className="text-sm text-slate-500">Hipoteca Pendiente</p>
                      <p className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums dark:text-white">
                        {draft.mortgageInput.capitalPendienteInicial > 0
                          ? `${formatEUR(draft.mortgageInput.capitalPendienteInicial)} (${draft.mortgageInput.tinPostCarencia.toFixed(2)}% TIN)`
                          : 'Sin hipoteca'}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                      <p className="text-sm text-slate-500">Comunidad Autónoma y Renta IRPF</p>
                      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                        {COMUNIDADES_AUTONOMAS_LABELS[draft.irpfInput.comunidadAutonoma]} ·{' '}
                        {draft.irpfInput.descendientes.length} descendientes
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pie de Navegación del Asistente */}
        <footer className="flex items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </button>

          <div className="flex items-center gap-3">
            {stepIndex < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Siguiente
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApplyAndFinish}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                <CheckCircle2 className="h-4 w-4" />
                Finalizar y Aplicar al Supuesto
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
