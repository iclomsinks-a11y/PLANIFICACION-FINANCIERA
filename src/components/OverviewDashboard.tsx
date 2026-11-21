import React, { useEffect, useState } from 'react';
import {
  CalendarClock,
  Check,
  FilePlus2,
  GitCompare,
  Mail,
  Play,
  Plus,
  Save,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import {
  EconomySummaryResult,
  SavingsHealthLevel,
  isProratableExpense,
} from '../engines/economyEngine';
import {
  EconomyWorkspaceState,
  FinancialMovement,
  MovementRecurrence,
  MovementType,
  PeriodPreset,
  SavedSupuesto,
} from '../types/economy';
import { formatEUR, formatPct, formatYYYYMM } from '../utils/formatters';

interface OverviewDashboardProps {
  state: EconomyWorkspaceState;
  summary: EconomySummaryResult;
  periodPreset: PeriodPreset;
  customStart: string;
  customEnd: string;
  supuestos: SavedSupuesto[];
  activeSupuesto: SavedSupuesto;
  nextSupuestoNumber: number;
  onOpenWizard: () => void;
  onSelectSupuesto: (id: string) => void;
  onSaveSupuestoAs: (name: string) => void;
  onCreateNewSupuesto: () => void;
  onDeleteSupuesto: (id: string) => void;
  onChangePeriod: (preset: PeriodPreset) => void;
  onChangeCustomRange: (start: string, end: string) => void;
  onToggleProrratearGastos: () => void;
  onQuickAddMovement: (mov: Omit<FinancialMovement, 'id'>) => void;
  onConfirmMovement: (id: string) => void;
  onNavigate: (
    section:
      | 'movimientos'
      | 'cuentas'
      | 'comparador'
      | 'hipoteca'
      | 'irpf'
      | 'asesor'
      | 'poster'
  ) => void;
  onOpenGeminiAssistant: (mode: 'texto' | 'ocr') => void;
  onOpenGmailScanner: () => void;
  onOpenTestFamilyModal: () => void;
  pendingGmailInvoicesCount: number;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  state,
  summary,
  periodPreset,
  customStart,
  customEnd,
  supuestos,
  activeSupuesto,
  nextSupuestoNumber,
  onOpenWizard,
  onSelectSupuesto,
  onSaveSupuestoAs,
  onCreateNewSupuesto,
  onDeleteSupuesto,
  onChangePeriod,
  onChangeCustomRange,
  onToggleProrratearGastos,
  onQuickAddMovement,
  onConfirmMovement,
  onNavigate,
  onOpenGeminiAssistant,
  onOpenGmailScanner,
  onOpenTestFamilyModal,
  pendingGmailInvoicesCount,
}) => {
  const [saveAsName, setSaveAsName] = useState(activeSupuesto.nombre);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [confirmDeleteSupuesto, setConfirmDeleteSupuesto] = useState(false);

  useEffect(() => {
    setSaveAsName(activeSupuesto.nombre);
    setConfirmDeleteSupuesto(false);
  }, [activeSupuesto.id, activeSupuesto.nombre]);

  const [quickType, setQuickType] = useState<MovementType>('gasto');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickDate, setQuickDate] = useState('2026-11-13');
  const [quickRecurrence, setQuickRecurrence] = useState<MovementRecurrence>('puntual');
  const [quickConcept, setQuickConcept] = useState('');
  const [quickCategory, setQuickCategory] = useState('cat-alimentacion');
  const [quickFeedback, setQuickFeedback] = useState<string | null>(null);
  const [quickAccount, setQuickAccount] = useState(
    summary.accountBalances[0]?.account.id ?? state.accounts[0]?.id ?? ''
  );
  const [quickDestAccount, setQuickDestAccount] = useState(
    summary.accountBalances[1]?.account.id ?? state.accounts[1]?.id ?? ''
  );

  const visibleAccounts = summary.accountBalances.map((b) => b.account);
  const effectiveQuickAccount = visibleAccounts.some((a) => a.id === quickAccount)
    ? quickAccount
    : (visibleAccounts[0]?.id ?? state.accounts[0]?.id ?? '');
  const effectiveQuickDestAccount = visibleAccounts.some((a) => a.id === quickDestAccount)
    ? quickDestAccount
    : (visibleAccounts[1]?.id ?? visibleAccounts[0]?.id ?? state.accounts[0]?.id ?? '');

  const visibleCategories = state.categories.filter(
    (c) =>
      !c.oculta &&
      (quickType === 'ingreso'
        ? c.tipo === 'ingreso'
        : quickType === 'gasto' || quickType === 'devolucion'
          ? c.tipo === 'gasto'
          : true)
  );

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetName = saveAsName.trim() || `Supuesto ${activeSupuesto.numero}`;
    onSaveSupuestoAs(targetName);
    setSaveFeedback(`Guardado como "${targetName}"`);
    window.setTimeout(() => setSaveFeedback(null), 2600);
  };

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(quickAmount);
    if (!quickConcept.trim() || Number.isNaN(amount) || amount <= 0 || !effectiveQuickAccount) return;

    const catObj =
      state.categories.find((c) => c.id === quickCategory) ??
      visibleCategories[0] ??
      state.categories[0];

    const finalDate = quickDate || '2026-11-13';
    onQuickAddMovement({
      tipo: quickType,
      importe: amount,
      fecha: finalDate,
      concepto: quickConcept.trim(),
      categoriaId: quickType === 'transferencia' ? 'cat-finanzas' : catObj.id,
      subcategoria:
        quickType === 'transferencia'
          ? 'Aportaciones a inversión'
          : catObj.subcategorias[0] ?? 'General',
      cuentaId: effectiveQuickAccount,
      cuentaDestinoId: quickType === 'transferencia' ? effectiveQuickDestAccount : undefined,
      miembroId: state.actingMemberId,
      visibilidad: state.mode === 'familiar' ? 'compartida' : 'privada',
      recurrencia: quickRecurrence,
      estado: 'confirmado',
    });

    if (
      quickType === 'gasto' &&
      (quickRecurrence === 'trimestral' || quickRecurrence === 'anual')
    ) {
      const div = quickRecurrence === 'trimestral' ? 3 : 12;
      setQuickFeedback(
        summary.prorrateoActivo
          ? `Gasto registrado (${finalDate}) y prorrateado a ${formatEUR(amount / div)}/mes (÷ ${div}).`
          : `Gasto registrado (${finalDate}). Activa "Prorratear gastos" para imputar ${formatEUR(amount / div)}/mes (÷ ${div}).`
      );
    } else {
      setQuickFeedback(`Movimiento "${quickConcept.trim()}" registrado para ${finalDate}.`);
    }
    window.setTimeout(() => setQuickFeedback(null), 4500);

    setQuickAmount('');
    setQuickConcept('');
  };

  const getCategoryName = (id: string) =>
    state.categories.find((c) => c.id === id)?.nombre ?? 'Sin categoría';

  const actingMember = state.members.find((m) => m.id === state.actingMemberId);
  const projected = summary.projectedAnnualSavings;

  const healthMeta: Record<
    SavingsHealthLevel,
    { label: string; valueClass: string; badgeClass: string; barClass: string }
  > = {
    saludable: {
      label: 'Salud financiera sólida (≥ 20 %)',
      valueClass: 'text-emerald-700 dark:text-emerald-400',
      badgeClass:
        'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300',
      barClass: 'bg-emerald-600',
    },
    moderada: {
      label: 'Margen de ahorro moderado (10–19 %)',
      valueClass: 'text-blue-700 dark:text-blue-400',
      badgeClass:
        'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300',
      barClass: 'bg-blue-600',
    },
    ajustada: {
      label: 'Capacidad de ahorro ajustada (< 10 %)',
      valueClass: 'text-amber-700 dark:text-amber-400',
      badgeClass:
        'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300',
      barClass: 'bg-amber-500',
    },
    deficit: {
      label: projected.hasIncome
        ? 'Déficit anual proyectado'
        : 'Sin ingresos en el historial',
      valueClass: 'text-red-700 dark:text-red-400',
      badgeClass:
        'border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300',
      barClass: 'bg-red-600',
    },
    sin_datos: {
      label: 'Sin historial suficiente',
      valueClass: 'text-slate-600 dark:text-slate-400',
      badgeClass:
        'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      barClass: 'bg-slate-400',
    },
  };

  const currentHealth = healthMeta[projected.nivelSalud];
  const historySpanLabel =
    projected.primerMesYYYYMM && projected.ultimoMesYYYYMM
      ? projected.primerMesYYYYMM === projected.ultimoMesYYYYMM
        ? formatYYYYMM(projected.primerMesYYYYMM, true)
        : `${formatYYYYMM(projected.primerMesYYYYMM, true)} – ${formatYYYYMM(projected.ultimoMesYYYYMM, true)}`
      : 'Sin movimientos registrados';
  const clampedSavingsBarPct = Math.max(0, Math.min(100, projected.tasaAhorroAnualPct));

  return (
    <div className="space-y-6">
      {/* Barra Principal del Dashboard: Iniciar Asistente, Nuevo Supuesto y Guardar Como */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenWizard}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-base font-bold text-white transition-colors hover:bg-blue-800 whitespace-nowrap"
            >
              <Play className="h-4 w-4 fill-current" />
              Iniciar
            </button>

            <button
              type="button"
              onClick={onCreateNewSupuesto}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
            >
              <FilePlus2 className="h-4 w-4" />
              Nuevo supuesto (Supuesto {nextSupuestoNumber})
            </button>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Supuesto activo:
              </label>
              <select
                value={activeSupuesto.id}
                onChange={(e) => onSelectSupuesto(e.target.value)}
                aria-label="Seleccionar supuesto guardado"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {supuestos.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    #{sup.numero} · {sup.nombre}
                  </option>
                ))}
              </select>

              {supuestos.length > 1 &&
                (confirmDeleteSupuesto ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteSupuesto(activeSupuesto.id);
                      setConfirmDeleteSupuesto(false);
                    }}
                    className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800"
                  >
                    Confirmar borrado
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteSupuesto(true)}
                    title="Eliminar supuesto actual"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-red-700 hover:bg-red-50 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ))}
            </div>
          </div>

          <form
            onSubmit={handleSaveSubmit}
            className="flex flex-wrap items-center gap-2"
          >
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              <span className="whitespace-nowrap">Guardar como:</span>
              <input
                type="text"
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                placeholder={`Supuesto ${activeSupuesto.numero}`}
                aria-label="Guardar como"
                className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 whitespace-nowrap"
            >
              <Save className="h-4 w-4" />
              Guardar
            </button>
            {saveFeedback && (
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {saveFeedback}
              </span>
            )}
          </form>
        </div>
      </section>

      {/* Selector de Período y Botón Adicional de Prorrateo */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'mes_actual', label: 'Mes actual' },
              { id: 'mes_anterior', label: 'Mes anterior' },
              { id: 'ultimos_3_meses', label: 'Últimos 3 meses' },
              { id: 'anio_actual', label: 'Año actual' },
              { id: 'personalizado', label: 'Personalizado' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChangePeriod(p.id)}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                periodPreset === p.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onToggleProrratearGastos}
            aria-pressed={summary.prorrateoActivo}
            title="Divide los gastos trimestrales entre 3 y los anuales entre 12 para repartir IBI, seguros o agua entre sus meses correspondientes"
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              summary.prorrateoActivo
                ? 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800 dark:border-blue-500 dark:bg-blue-600'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <CalendarClock className="h-4 w-4" />
            Prorratear gastos
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
                summary.prorrateoActivo
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              {summary.prorrateoActivo ? 'ON · ÷3 / ÷12' : 'OFF'}
            </span>
          </button>

          {periodPreset === 'personalizado' ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => onChangeCustomRange(e.target.value, customEnd)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <span className="text-slate-400">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => onChangeCustomRange(customStart, e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          ) : (
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Período activo: {summary.periodRange.label}
            </span>
          )}
        </div>
      </section>

      {/* Aviso de Nuevas Facturas Detectadas en Gmail */}
      {pendingGmailInvoicesCount > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-3 text-base">
            <Mail className="h-5 w-5 shrink-0" />
            <span>
              <strong>
                {pendingGmailInvoicesCount}{' '}
                {pendingGmailInvoicesCount === 1
                  ? 'nueva factura recibida detectada en Gmail'
                  : 'nuevas facturas recibidas detectadas en Gmail'}
                :
              </strong>{' '}
              Revísala antes de adjuntarla como gasto en el supuesto activo.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenGmailScanner}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 whitespace-nowrap"
          >
            Revisar y adjuntar
          </button>
        </section>
      )}

      {/* Estado de acceso / autorización del miembro activo en Unidad Familiar */}
      {state.mode === 'familiar' && actingMember && actingMember.rol !== 'admin' && (
        <section
          className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${
            actingMember.rol === 'adulto' && actingMember.autorizadoVerTodo
              ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-200'
          }`}
        >
          <div className="flex items-center gap-3 text-sm">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <span>
              <strong>
                Sesión simulada ({actingMember.nombre}
                {actingMember.email ? ` · ${actingMember.email}` : ''}):
              </strong>{' '}
              {actingMember.rol === 'adulto'
                ? actingMember.autorizadoVerTodo
                  ? 'Autorizado por el titular de la cuenta para ver toda la unidad familiar.'
                  : 'Ves tus datos y los compartidos. Necesitas autorización del titular para ver toda la unidad familiar.'
                : 'Acceso limitado exclusivamente a tus propios datos económicos.'}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenTestFamilyModal}
            className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap dark:bg-white dark:text-slate-900"
          >
            Cambiar correo / Autorizaciones
          </button>
        </section>
      )}

      {/* Aviso Control Parental si aplica */}
      {summary.parentalAlert && (
        <section
          className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${
            summary.parentalAlert.exceeded
              ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200'
              : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center gap-3 text-base">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>
              <strong>Control parental ({summary.parentalAlert.memberName}):</strong> Gasto este
              mes de{' '}
              <span className="font-mono font-bold tabular-nums">
                {formatEUR(summary.parentalAlert.spentThisMonth)}
              </span>{' '}
              sobre un límite mensual de{' '}
              <span className="font-mono font-bold tabular-nums">
                {formatEUR(summary.parentalAlert.limit)}
              </span>
              {summary.parentalAlert.exceeded ? ' — Límite superado.' : '.'}
            </span>
          </div>
        </section>
      )}

      {/* 4 Indicadores Superiores (24px-36px, código de color funcional) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Ingresos del Período
          </p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-emerald-700 tabular-nums lg:text-4xl dark:text-emerald-400">
            {formatEUR(summary.ingresosPeriodo)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            Mes anterior: {formatEUR(summary.comparacionMesAnterior.ingresosAnterior)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Gastos del Período
            </p>
            {summary.prorrateoActivo && (
              <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                Prorrateado ÷3 / ÷12
              </span>
            )}
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-red-700 tabular-nums lg:text-4xl dark:text-red-400">
            {formatEUR(summary.gastosPeriodo)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            Pendientes/próximos:{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              {formatEUR(summary.gastosPendientesYProximos)}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Ahorro Neto del Período
          </p>
          <p
            className={`mt-2 font-mono text-3xl font-bold tracking-tight tabular-nums lg:text-4xl ${
              summary.ahorroNetoPeriodo >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {formatEUR(summary.ahorroNetoPeriodo)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            Vs mes anterior:{' '}
            <span
              className={
                summary.comparacionMesAnterior.deltaAhorro >= 0
                  ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                  : 'font-semibold text-red-700 dark:text-red-400'
              }
            >
              {summary.comparacionMesAnterior.deltaAhorro >= 0 ? '+' : ''}
              {formatEUR(summary.comparacionMesAnterior.deltaAhorro)}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Dinero Realmente Disponible
          </p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-tight text-blue-700 tabular-nums lg:text-4xl dark:text-blue-400">
            {formatEUR(summary.dineroRealmenteDisponible)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            Cuentas {formatEUR(summary.totalEnCuentas, false)} · Reservado{' '}
            {formatEUR(summary.totalReservadoFondos, false)}
          </p>
        </div>
      </section>

      {/* Tarjeta de Resumen: Tasa de Ahorro Anual Proyectada (Salud Financiera a Largo Plazo) */}
      <section
        aria-label="Tasa de ahorro anual proyectada"
        className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Tasa de Ahorro Anual Proyectada
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {projected.hasData
                  ? `Proyección anualizada sobre ${projected.mesesAnalizados} ${
                      projected.mesesAnalizados === 1 ? 'mes' : 'meses'
                    } de historial (${historySpanLabel}) · Excluye transferencias internas`
                  : 'Registra ingresos y gastos en tu historial para calcular tu proyección anual'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${currentHealth.badgeClass}`}
            >
              {currentHealth.label}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('movimientos')}
              className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
            >
              Ver historial →
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <span
                className={`font-mono text-3xl font-bold tracking-tight tabular-nums lg:text-4xl ${currentHealth.valueClass}`}
              >
                {projected.hasData
                  ? projected.hasIncome
                    ? formatPct(projected.tasaAhorroAnualPct)
                    : '—'
                  : '0,00 %'}
              </span>
              {projected.hasData && (
                <span className="font-mono text-sm font-semibold text-slate-600 tabular-nums dark:text-slate-300">
                  ({projected.ahorroMensualMedio >= 0 ? '+' : ''}
                  {formatEUR(projected.ahorroMensualMedio)}/mes)
                </span>
              )}
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${currentHealth.barClass}`}
                  style={{ width: `${clampedSavingsBarPct}%` }}
                />
                <div
                  title="Referencia recomendada de ahorro: 20 %"
                  className="absolute top-0 bottom-0 left-[20%] w-0.5 bg-slate-900/40 dark:bg-white/50"
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>0 %</span>
                <span>Objetivo salud financiera: 20 %</span>
                <span>100 %</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-7">
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Ingresos Anuales Est.
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                {formatEUR(projected.ingresosAnualesProyectados)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {formatEUR(projected.ingresosMensualesMedios)}/mes
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Gastos Anuales Est.
              </p>
              <p className="mt-1 font-mono text-lg font-bold text-red-700 tabular-nums dark:text-red-400">
                {formatEUR(projected.gastosAnualesProyectados)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {formatEUR(projected.gastosMensualesMedios)}/mes
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Ahorro Anual Proyectado
              </p>
              <p
                className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                  projected.ahorroAnualProyectado >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-700 dark:text-red-400'
                }`}
              >
                {projected.ahorroAnualProyectado >= 0 ? '+' : ''}
                {formatEUR(projected.ahorroAnualProyectado)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Neta de devoluciones
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Registro Rápido en 10 segundos */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Anotar Movimiento Rápido
            </h2>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Las transferencias entre cuentas propias no duplican ingresos ni gastos
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenGeminiAssistant('ocr')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 whitespace-nowrap dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
            >
              <ScanLine className="h-4 w-4" />
              Escanear Ticket / IA
            </button>
            <button
              type="button"
              onClick={onOpenGmailScanner}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Mail className="h-4 w-4" />
              Facturas Email
            </button>
            <button
              type="button"
              onClick={() => onNavigate('comparador')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <GitCompare className="h-4 w-4" />
              Comparador ¿Y si?
            </button>
          </div>
        </div>

        <form
          onSubmit={handleQuickSubmit}
          className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-12"
        >
          <div className="lg:col-span-2">
            <select
              value={quickType}
              onChange={(e) => {
                const nextType = e.target.value as MovementType;
                setQuickType(nextType);
                if (nextType === 'ingreso') setQuickCategory('cat-ingresos');
                else if (nextType === 'gasto') setQuickCategory('cat-alimentacion');
              }}
              aria-label="Tipo de movimiento"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
              <option value="transferencia">Transferencia</option>
              <option value="devolucion">Devolución</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={quickAmount}
              onChange={(e) => setQuickAmount(e.target.value)}
              placeholder="Importe (€)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="lg:col-span-2">
            <input
              type="date"
              required
              value={quickDate}
              onChange={(e) => setQuickDate(e.target.value)}
              aria-label="Fecha específica del movimiento"
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="lg:col-span-2">
            <input
              type="text"
              required
              value={quickConcept}
              onChange={(e) => setQuickConcept(e.target.value)}
              placeholder="Concepto (IBI, agua, seguro...)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {quickType === 'transferencia' ? (
            <div className="lg:col-span-2 grid grid-cols-2 gap-2">
              <select
                value={effectiveQuickAccount}
                onChange={(e) => setQuickAccount(e.target.value)}
                aria-label="Cuenta origen"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {summary.accountBalances.map((b) => (
                  <option key={b.account.id} value={b.account.id}>
                    De: {b.account.nombre}
                  </option>
                ))}
              </select>
              <select
                value={effectiveQuickDestAccount}
                onChange={(e) => setQuickDestAccount(e.target.value)}
                aria-label="Cuenta destino"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {summary.accountBalances.map((b) => (
                  <option key={b.account.id} value={b.account.id}>
                    A: {b.account.nombre}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="lg:col-span-2 grid grid-cols-2 gap-2">
              <select
                value={quickCategory}
                onChange={(e) => setQuickCategory(e.target.value)}
                aria-label="Categoría"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {visibleCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <select
                value={quickRecurrence}
                onChange={(e) => setQuickRecurrence(e.target.value as MovementRecurrence)}
                aria-label="Periodicidad"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="puntual">Puntual</option>
                <option value="mensual">Mensual</option>
                <option value="trimestral">Trimestral (÷3)</option>
                <option value="anual">Anual (÷12)</option>
              </select>
            </div>
          )}

          <div className="lg:col-span-2 flex gap-2">
            {quickType !== 'transferencia' && (
              <select
                value={effectiveQuickAccount}
                onChange={(e) => setQuickAccount(e.target.value)}
                aria-label="Cuenta"
                className="w-1/2 rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {summary.accountBalances.map((b) => (
                  <option key={b.account.id} value={b.account.id}>
                    {b.account.nombre}
                  </option>
                ))}
              </select>
            )}
            <button
              type="submit"
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap ${
                quickType === 'transferencia' ? 'w-full' : 'w-1/2'
              }`}
            >
              <Plus className="h-4 w-4" />
              Guardar
            </button>
          </div>
        </form>

        {quickType === 'gasto' &&
          (quickRecurrence === 'trimestral' || quickRecurrence === 'anual') && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3.5 py-2 text-xs text-blue-900 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-200">
              <span>
                {quickRecurrence === 'trimestral'
                  ? 'Gasto trimestral (ej. agua hogar): se divide entre 3 meses'
                  : 'Gasto anual (ej. IBI o seguros): se divide entre 12 meses'}
                {Number(quickAmount) > 0 && (
                  <>
                    {' '}
                    →{' '}
                    <strong className="font-mono">
                      {formatEUR(
                        Number(quickAmount) / (quickRecurrence === 'trimestral' ? 3 : 12)
                      )}
                      /mes
                    </strong>
                  </>
                )}
                {summary.prorrateoActivo
                  ? ' · Prorrateo activado.'
                  : ' · Prorrateo desactivado (se imputará íntegro a la fecha).'}
              </span>
              {!summary.prorrateoActivo && (
                <button
                  type="button"
                  onClick={onToggleProrratearGastos}
                  className="rounded-md bg-blue-700 px-2.5 py-1 font-semibold text-white hover:bg-blue-800"
                >
                  Activar Prorratear gastos
                </button>
              )}
            </div>
          )}

        {quickFeedback && (
          <p className="mt-2.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {quickFeedback}
          </p>
        )}
      </section>

      {/* Bloque Central en 2 Columnas Limpias */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Columna Izquierda: Presupuestos + Próximos Recibos */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Presupuesto Mensual por Categoría
                </h3>
                {summary.prorrateoActivo && (
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Incluye parte proporcional de gastos trimestrales (÷ 3) y anuales (÷ 12)
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onNavigate('cuentas')}
                className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                Configurar límites →
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {summary.categoryBudgets
                .filter((b) => b.presupuestado > 0 || b.gastado > 0)
                .slice(0, 6)
                .map((b) => (
                  <div key={b.category.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-base">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {b.category.nombre}
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        <span
                          className={
                            b.superado > 0
                              ? 'font-bold text-red-700 dark:text-red-400'
                              : 'font-semibold text-slate-900 dark:text-white'
                          }
                        >
                          {formatEUR(b.gastado, false)}
                        </span>{' '}
                        <span className="text-slate-500">
                          / {formatEUR(b.presupuestado, false)}
                        </span>
                        {b.superado > 0 && (
                          <span className="ml-2 font-semibold text-red-700 dark:text-red-400">
                            (+{formatEUR(b.superado, false)} superado)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          b.superado > 0
                            ? 'bg-red-600'
                            : b.pctUso >= 85
                              ? 'bg-amber-500'
                              : 'bg-blue-700'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(2, b.pctUso))}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Próximos Recibos y Pagos Pendientes
              </h3>
              <span className="font-mono text-sm font-semibold text-amber-700 tabular-nums dark:text-amber-400">
                {formatEUR(summary.gastosPendientesYProximos)}
              </span>
            </div>

            {summary.upcomingMovements.length === 0 ? (
              <p className="mt-4 text-base text-slate-500 dark:text-slate-400">
                No hay pagos pendientes ni recibos próximos registrados.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                {summary.upcomingMovements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-3 text-base"
                  >
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{m.concepto}</p>
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        {m.fecha} · {m.estado === 'pendiente' ? 'Pendiente' : 'Próximo recibo'} ·{' '}
                        {getCategoryName(m.categoriaId)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-red-700 tabular-nums dark:text-red-400">
                        -{formatEUR(m.importe)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onConfirmMovement(m.id)}
                        title="Marcar como pagado"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Columna Derecha: Cuentas, Objetivos de Ahorro y Últimos Movimientos */}
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Cuentas y Fondos Reservados
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('cuentas')}
                className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                Gestionar →
              </button>
            </div>

            <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {summary.accountBalances.map((b) => (
                <div
                  key={b.account.id}
                  className="flex items-center justify-between gap-4 py-2.5 text-base"
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {b.account.nombre}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {b.account.visibilidad === 'compartida' ? 'Compartida' : 'Privada'}
                      {b.account.taePct > 0 ? ` · ${b.account.taePct.toFixed(2)}% TAE` : ''}
                    </p>
                  </div>
                  <span className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-white">
                    {formatEUR(b.saldoActual)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Objetivos de Ahorro (dinero reservado separado del disponible)
              </p>
              <div className="mt-3 space-y-3">
                {state.savingsGoals.map((g) => {
                  const pct = g.importeObjetivo > 0 ? (g.saldoReservado / g.importeObjetivo) * 100 : 0;
                  return (
                    <div key={g.id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {g.nombre}
                        </span>
                        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatEUR(g.saldoReservado, false)} / {formatEUR(g.importeObjetivo, false)} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Últimos Movimientos
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('movimientos')}
                className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
              >
                Ver todos ({summary.visibleMovementsInPeriod.length}) →
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
              {summary.visibleMovementsInPeriod.slice(0, 6).map((m) => {
                const effItem = summary.effectiveAmountByMovementId[m.id];
                const displayAmount = effItem ? effItem.effectiveAmount : m.importe;
                const showProrationNote =
                  effItem?.isProrated && isProratableExpense(m);
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-3 text-base"
                  >
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{m.concepto}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {m.fecha} ·{' '}
                        {m.tipo === 'transferencia'
                          ? 'Transferencia interna'
                          : getCategoryName(m.categoriaId)}
                        {showProrationNote && (
                          <span className="ml-1.5 font-medium text-blue-700 dark:text-blue-400">
                            · Prorrateado ÷ {effItem.divisor} (recibo {formatEUR(m.importe)})
                          </span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-base font-bold tabular-nums whitespace-nowrap ${
                        m.tipo === 'ingreso' || m.tipo === 'devolucion'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : m.tipo === 'transferencia'
                            ? 'text-blue-700 dark:text-blue-400'
                            : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {m.tipo === 'ingreso' || m.tipo === 'devolucion'
                        ? '+'
                        : m.tipo === 'transferencia'
                          ? '⇄ '
                          : '-'}
                      {formatEUR(displayAmount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
