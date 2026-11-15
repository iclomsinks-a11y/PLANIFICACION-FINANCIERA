import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Mail,
  Paperclip,
  Plus,
  ScanLine,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { EconomySummaryResult } from '../engines/economyEngine';
import {
  EconomyWorkspaceState,
  FinancialMovement,
  MovementRecurrence,
  MovementStatus,
  MovementType,
  PeriodPreset,
} from '../types/economy';
import { computeFinancedInstallment } from '../utils/financing';
import { downloadTextFile, formatEUR } from '../utils/formatters';

interface MovementsLedgerProps {
  state: EconomyWorkspaceState;
  summary: EconomySummaryResult;
  periodPreset: PeriodPreset;
  pendingGmailCount?: number;
  onChangePeriod: (preset: PeriodPreset) => void;
  onAddMovement: (mov: Omit<FinancialMovement, 'id'>) => void;
  onUpdateMovement: (mov: FinancialMovement) => void;
  onDeleteMovement: (id: string) => void;
  onConfirmMovement: (id: string) => void;
  onOpenGeminiAssistant?: (mode: 'texto' | 'ocr') => void;
  onOpenGmailScanner?: () => void;
}

const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  ingreso: 'Ingreso',
  gasto: 'Gasto',
  transferencia: 'Transferencia interna',
  devolucion: 'Devolución',
};

const STATUS_LABELS: Record<MovementStatus, string> = {
  confirmado: 'Confirmado',
  pendiente: 'Pendiente',
  proximo: 'Próximo recibo',
};

const RECURRENCE_LABELS: Record<MovementRecurrence, string> = {
  puntual: 'Puntual',
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  anual: 'Anual',
};

interface MovementFormDraft {
  id?: string;
  tipo: MovementType;
  importe: string;
  fecha: string;
  concepto: string;
  categoriaId: string;
  subcategoria: string;
  cuentaId: string;
  cuentaDestinoId: string;
  miembroId: string;
  visibilidad: 'compartida' | 'privada';
  repartoCompartido: boolean;
  recurrencia: MovementRecurrence;
  estado: MovementStatus;
  esHipoteca: boolean;
  esSeguroVinculadoHipoteca: boolean;
  esDeducibleAutonomo: boolean;
  financiado: boolean;
  importeTotalFinanciado: string;
  mensualidadesTotal: string;
  tinFinanciacionPct: string;
  observaciones: string;
  justificanteNombre: string;
}

export const MovementsLedger: React.FC<MovementsLedgerProps> = ({
  state,
  summary,
  periodPreset,
  pendingGmailCount = 0,
  onChangePeriod,
  onAddMovement,
  onUpdateMovement,
  onDeleteMovement,
  onConfirmMovement,
  onOpenGeminiAssistant,
  onOpenGmailScanner,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'todos' | MovementType>('todos');
  const [filterCategory, setFilterCategory] = useState<string>('todas');
  const [filterAccount, setFilterAccount] = useState<string>('todas');
  const [filterStatus, setFilterStatus] = useState<'todos' | MovementStatus>('todos');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const visibleAccounts = summary.accountBalances.map((b) => b.account);

  const buildEmptyDraft = (preset?: Partial<FinancialMovement>): MovementFormDraft => {
    const tipo: MovementType = preset?.tipo ?? 'gasto';
    const defaultCat =
      preset?.categoriaId ??
      (tipo === 'ingreso'
        ? 'cat-ingresos'
        : tipo === 'transferencia'
          ? 'cat-finanzas'
          : 'cat-alimentacion');
    const catObj = state.categories.find((c) => c.id === defaultCat) ?? state.categories[0];

    return {
      id: preset?.id,
      tipo,
      importe: preset ? String(preset.importe) : '',
      fecha: preset?.fecha ?? '2026-11-13',
      concepto: preset?.concepto ?? '',
      categoriaId: catObj.id,
      subcategoria: preset?.subcategoria ?? catObj.subcategorias[0] ?? 'General',
      cuentaId: preset?.cuentaId ?? visibleAccounts[0]?.id ?? state.accounts[0]?.id ?? '',
      cuentaDestinoId:
        preset?.cuentaDestinoId ??
        visibleAccounts[1]?.id ??
        visibleAccounts[0]?.id ??
        state.accounts[1]?.id ??
        '',
      miembroId: preset?.miembroId ?? state.actingMemberId,
      visibilidad: preset?.visibilidad ?? (state.mode === 'familiar' ? 'compartida' : 'privada'),
      repartoCompartido: Boolean(preset?.repartoCompartido),
      recurrencia: preset?.recurrencia ?? 'puntual',
      estado: preset?.estado ?? 'confirmado',
      esHipoteca: Boolean(preset?.esHipoteca),
      esSeguroVinculadoHipoteca: Boolean(preset?.esSeguroVinculadoHipoteca),
      esDeducibleAutonomo: Boolean(preset?.esDeducibleAutonomo),
      financiado: Boolean(preset?.financiado),
      importeTotalFinanciado: preset?.importeTotalFinanciado
        ? String(preset.importeTotalFinanciado)
        : '',
      mensualidadesTotal: preset?.mensualidadesTotal
        ? String(preset.mensualidadesTotal)
        : '12',
      tinFinanciacionPct:
        preset?.tinFinanciacionPct !== undefined ? String(preset.tinFinanciacionPct) : '0',
      observaciones: preset?.observaciones ?? '',
      justificanteNombre: preset?.justificanteNombre ?? '',
    };
  };

  const [draft, setDraft] = useState<MovementFormDraft>(() => buildEmptyDraft());

  const openNewEditor = () => {
    setDraft(buildEmptyDraft());
    setEditorOpen(true);
  };

  const openEditEditor = (mov: FinancialMovement) => {
    setDraft(buildEmptyDraft(mov));
    setEditorOpen(true);
  };

  const handleDuplicate = (mov: FinancialMovement) => {
    const { id: _ignored, ...rest } = mov;
    onAddMovement({
      ...rest,
      concepto: `${mov.concepto} (copia)`,
      fecha: '2026-11-13',
    });
  };

  const availableFormCategories = useMemo(
    () =>
      state.categories.filter(
        (c) =>
          !c.oculta &&
          (draft.tipo === 'ingreso'
            ? c.tipo === 'ingreso'
            : draft.tipo === 'transferencia'
              ? true
              : c.tipo === 'gasto')
      ),
    [state.categories, draft.tipo]
  );

  const selectedCategoryObj =
    state.categories.find((c) => c.id === draft.categoriaId) ?? availableFormCategories[0];

  const handleSaveDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const importe = Number(draft.importe);
    if (!draft.concepto.trim() || Number.isNaN(importe) || importe <= 0 || !draft.cuentaId) return;
    if (draft.tipo === 'transferencia' && draft.cuentaId === draft.cuentaDestinoId) return;

    const finTotal = Number(draft.importeTotalFinanciado) || 0;
    const finMeses = Math.max(1, Math.floor(Number(draft.mensualidadesTotal) || 12));
    const finTin = Math.max(0, Number(draft.tinFinanciacionPct) || 0);
    const finCalc = draft.financiado
      ? computeFinancedInstallment(finTotal > 0 ? finTotal : importe, finMeses, finTin)
      : null;

    const payload: Omit<FinancialMovement, 'id'> = {
      tipo: draft.tipo,
      importe: draft.financiado && finCalc ? finCalc.cuotaMensual : importe,
      fecha: draft.fecha,
      concepto: draft.concepto.trim(),
      categoriaId: draft.tipo === 'transferencia' ? 'cat-finanzas' : draft.categoriaId,
      subcategoria:
        draft.tipo === 'transferencia'
          ? 'Traspaso entre cuentas'
          : draft.subcategoria || 'General',
      cuentaId: draft.cuentaId,
      cuentaDestinoId: draft.tipo === 'transferencia' ? draft.cuentaDestinoId : undefined,
      miembroId: draft.miembroId,
      visibilidad: draft.visibilidad,
      repartoCompartido: draft.repartoCompartido || undefined,
      recurrencia: draft.financiado ? 'mensual' : draft.recurrencia,
      estado: draft.estado,
      esHipoteca: draft.esHipoteca || undefined,
      esSeguroVinculadoHipoteca: draft.esSeguroVinculadoHipoteca || undefined,
      esDeducibleAutonomo: draft.esDeducibleAutonomo || undefined,
      financiado: draft.financiado || undefined,
      importeTotalFinanciado: draft.financiado
        ? finTotal > 0
          ? finTotal
          : importe
        : undefined,
      mensualidadesTotal: draft.financiado ? finMeses : undefined,
      tinFinanciacionPct: draft.financiado ? finTin : undefined,
      cuotaMensualFinanciada: draft.financiado && finCalc ? finCalc.cuotaMensual : undefined,
      observaciones: draft.observaciones.trim() || undefined,
      justificanteNombre: draft.justificanteNombre || undefined,
    };

    if (draft.id) {
      onUpdateMovement({ id: draft.id, ...payload });
    } else {
      onAddMovement(payload);
    }

    setEditorOpen(false);
  };

  const filteredMovements = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return summary.visibleMovementsInPeriod.filter((m) => {
      if (filterType !== 'todos' && m.tipo !== filterType) return false;
      if (filterCategory !== 'todas' && m.categoriaId !== filterCategory) return false;
      if (
        filterAccount !== 'todas' &&
        m.cuentaId !== filterAccount &&
        m.cuentaDestinoId !== filterAccount
      ) {
        return false;
      }
      if (filterStatus !== 'todos' && m.estado !== filterStatus) return false;
      if (q) {
        const hayTexto =
          m.concepto.toLowerCase().includes(q) ||
          m.subcategoria.toLowerCase().includes(q) ||
          (m.observaciones ?? '').toLowerCase().includes(q);
        if (!hayTexto) return false;
      }
      return true;
    });
  }, [
    summary.visibleMovementsInPeriod,
    searchTerm,
    filterType,
    filterCategory,
    filterAccount,
    filterStatus,
  ]);

  const totalsFiltered = useMemo(() => {
    let ingresos = 0;
    let gastos = 0;
    let transferencias = 0;
    for (const m of filteredMovements) {
      if (m.tipo === 'ingreso') ingresos += m.importe;
      else if (m.tipo === 'gasto') gastos += m.importe;
      else if (m.tipo === 'devolucion') gastos = Math.max(0, gastos - m.importe);
      else if (m.tipo === 'transferencia') transferencias += m.importe;
    }
    return { ingresos, gastos, transferencias };
  }, [filteredMovements]);

  const getCategoryName = (id: string) =>
    state.categories.find((c) => c.id === id)?.nombre ?? 'Sin categoría';
  const getAccountName = (id?: string) =>
    state.accounts.find((a) => a.id === id)?.nombre ?? 'Cuenta';
  const getMemberName = (id: string) =>
    state.members.find((mem) => mem.id === id)?.nombre ?? 'Miembro';

  const handleExportCsv = () => {
    const headers = [
      'Fecha',
      'Tipo',
      'Concepto',
      'Categoría',
      'Subcategoría',
      'Cuenta Origen',
      'Cuenta Destino',
      'Miembro',
      'Visibilidad',
      'Estado',
      'Recurrencia',
      'Importe EUR',
      'Justificante',
      'Observaciones',
    ];
    const rows = filteredMovements.map((m) => [
      m.fecha,
      MOVEMENT_TYPE_LABELS[m.tipo],
      `"${m.concepto.replaceAll('"', '""')}"`,
      `"${getCategoryName(m.categoriaId).replaceAll('"', '""')}"`,
      `"${m.subcategoria.replaceAll('"', '""')}"`,
      `"${getAccountName(m.cuentaId).replaceAll('"', '""')}"`,
      m.cuentaDestinoId ? `"${getAccountName(m.cuentaDestinoId).replaceAll('"', '""')}"` : '',
      `"${getMemberName(m.miembroId).replaceAll('"', '""')}"`,
      m.visibilidad,
      STATUS_LABELS[m.estado],
      RECURRENCE_LABELS[m.recurrencia],
      m.importe.toFixed(2).replace('.', ','),
      m.justificanteNombre ?? '',
      `"${(m.observaciones ?? '').replaceAll('"', '""')}"`,
    ]);
    const csv = `\uFEFF${[headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')}`;
    downloadTextFile(
      `movimientos-${state.templateId}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8;'
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabecera y Totales del Filtro */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Libro Completo de Movimientos
            </h2>
            <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
              Control antiduplicación: las transferencias mueven saldo entre cuentas sin inflar
              ingresos ni gastos, y las devoluciones minoran el gasto neto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {onOpenGeminiAssistant && (
              <button
                type="button"
                onClick={() => onOpenGeminiAssistant('ocr')}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
              >
                <ScanLine className="h-4 w-4" />
                OCR Ticket / Asistente IA
              </button>
            )}
            {onOpenGmailScanner && (
              <button
                type="button"
                onClick={onOpenGmailScanner}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <Mail className="h-4 w-4" />
                Facturas Gmail{pendingGmailCount > 0 ? ` (${pendingGmailCount})` : ''}
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={openNewEditor}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <Plus className="h-4 w-4" />
              Nuevo Movimiento
            </button>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por concepto, subcategoría o nota..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <select
            value={periodPreset}
            onChange={(e) => onChangePeriod(e.target.value as PeriodPreset)}
            aria-label="Filtrar período"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="mes_actual">Mes actual</option>
            <option value="mes_anterior">Mes anterior</option>
            <option value="ultimos_3_meses">Últimos 3 meses</option>
            <option value="anio_actual">Año actual</option>
            <option value="personalizado">Personalizado</option>
          </select>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'todos' | MovementType)}
            aria-label="Filtrar por tipo"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="todos">Todos los tipos</option>
            <option value="ingreso">Solo ingresos</option>
            <option value="gasto">Solo gastos</option>
            <option value="transferencia">Transferencias internas</option>
            <option value="devolucion">Devoluciones</option>
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            aria-label="Filtrar por categoría"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="todas">Todas las categorías</option>
            {state.categories
              .filter((c) => !c.oculta)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              aria-label="Filtrar por cuenta"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2.5 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="todas">Todas cuentas</option>
              {visibleAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'todos' | MovementStatus)}
              aria-label="Filtrar por estado"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2.5 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="todos">Estado</option>
              <option value="confirmado">Confirmado</option>
              <option value="pendiente">Pendiente</option>
              <option value="proximo">Próximo</option>
            </select>
          </div>
        </div>

        {/* Resumen numérico directo */}
        <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-slate-200 pt-4 text-base dark:border-slate-800">
          <span className="text-slate-600 dark:text-slate-400">
            Movimientos mostrados:{' '}
            <strong className="font-mono text-slate-900 tabular-nums dark:text-white">
              {filteredMovements.length}
            </strong>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Ingresos:{' '}
            <strong className="font-mono text-emerald-700 tabular-nums dark:text-emerald-400">
              {formatEUR(totalsFiltered.ingresos)}
            </strong>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Gasto neto:{' '}
            <strong className="font-mono text-red-700 tabular-nums dark:text-red-400">
              {formatEUR(totalsFiltered.gastos)}
            </strong>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Transferencias internas:{' '}
            <strong className="font-mono text-blue-700 tabular-nums dark:text-blue-400">
              {formatEUR(totalsFiltered.transferencias)}
            </strong>
          </span>
        </div>
      </section>

      {/* Editor Detallado de Movimiento (Crear / Editar) */}
      {editorOpen && (
        <section className="rounded-xl border-2 border-blue-700 bg-white p-6 dark:border-blue-500 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              {draft.id ? 'Editar Movimiento' : 'Registrar Nuevo Movimiento'}
            </h3>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cerrar editor"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSaveDraft} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Tipo de operación</span>
                <select
                  value={draft.tipo}
                  onChange={(e) => {
                    const nextType = e.target.value as MovementType;
                    const nextCatId =
                      nextType === 'ingreso'
                        ? 'cat-ingresos'
                        : nextType === 'transferencia'
                          ? 'cat-finanzas'
                          : 'cat-alimentacion';
                    const catObj = state.categories.find((c) => c.id === nextCatId);
                    setDraft((prev) => ({
                      ...prev,
                      tipo: nextType,
                      categoriaId: nextCatId,
                      subcategoria: catObj?.subcategorias[0] ?? 'General',
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="gasto">Gasto</option>
                  <option value="ingreso">Ingreso</option>
                  <option value="transferencia">Transferencia interna (no duplica)</option>
                  <option value="devolucion">Devolución (reduce gasto)</option>
                </select>
              </label>

              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Importe (€)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={draft.importe}
                  onChange={(e) => setDraft((p) => ({ ...p, importe: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>

              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Fecha</span>
                <input
                  type="date"
                  required
                  value={draft.fecha}
                  onChange={(e) => setDraft((p) => ({ ...p, fecha: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>

              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Estado</span>
                <select
                  value={draft.estado}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, estado: e.target.value as MovementStatus }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="confirmado">Confirmado</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="proximo">Próximo recibo</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Concepto</span>
                <input
                  type="text"
                  required
                  value={draft.concepto}
                  onChange={(e) => setDraft((p) => ({ ...p, concepto: e.target.value }))}
                  placeholder="Descripción clara del movimiento"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>

              {draft.tipo === 'transferencia' ? (
                <>
                  <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Cuenta origen</span>
                    <select
                      value={draft.cuentaId}
                      onChange={(e) => setDraft((p) => ({ ...p, cuentaId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {visibleAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Cuenta destino</span>
                    <select
                      value={draft.cuentaDestinoId}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, cuentaDestinoId: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {visibleAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Categoría COICOP</span>
                    <select
                      value={draft.categoriaId}
                      onChange={(e) => {
                        const nextCat = state.categories.find((c) => c.id === e.target.value);
                        setDraft((p) => ({
                          ...p,
                          categoriaId: e.target.value,
                          subcategoria: nextCat?.subcategorias[0] ?? 'General',
                        }));
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {availableFormCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Subcategoría</span>
                    <select
                      value={draft.subcategoria}
                      onChange={(e) => setDraft((p) => ({ ...p, subcategoria: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {(selectedCategoryObj?.subcategorias ?? ['General']).map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {draft.tipo !== 'transferencia' && (
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span>Cuenta</span>
                  <select
                    value={draft.cuentaId}
                    onChange={(e) => setDraft((p) => ({ ...p, cuentaId: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {visibleAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Miembro titular</span>
                <select
                  value={draft.miembroId}
                  onChange={(e) => setDraft((p) => ({ ...p, miembroId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {state.members.map((mem) => (
                    <option key={mem.id} value={mem.id}>
                      {mem.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Visibilidad</span>
                <select
                  value={draft.visibilidad}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      visibilidad: e.target.value as 'compartida' | 'privada',
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="compartida">Compartida en el hogar</option>
                  <option value="privada">Privada (solo titular / admin)</option>
                </select>
              </label>

              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Recurrencia</span>
                <select
                  value={draft.recurrencia}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      recurrencia: e.target.value as MovementRecurrence,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="puntual">Puntual</option>
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Observaciones</span>
                <input
                  type="text"
                  value={draft.observaciones}
                  onChange={(e) => setDraft((p) => ({ ...p, observaciones: e.target.value }))}
                  placeholder="Notas adicionales o referencia de factura..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>

              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span>Justificante o factura (nombre de archivo local)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setDraft((p) => ({ ...p, justificanteNombre: file.name }));
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                  {draft.justificanteNombre && (
                    <span className="shrink-0 text-xs font-medium text-blue-700 dark:text-blue-400">
                      {draft.justificanteNombre}
                    </span>
                  )}
                </div>
              </label>
            </div>

            {draft.tipo === 'gasto' && (
              <div className="space-y-4 pt-1">
                <div className="flex flex-wrap gap-6 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.financiado}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const totalBase =
                          Number(draft.importeTotalFinanciado) || Number(draft.importe) || 600;
                        const meses = Math.max(2, Number(draft.mensualidadesTotal) || 12);
                        const tin = Math.max(0, Number(draft.tinFinanciacionPct) || 0);
                        const calc = computeFinancedInstallment(totalBase, meses, tin);
                        setDraft((p) => ({
                          ...p,
                          financiado: checked,
                          importeTotalFinanciado: checked ? String(totalBase) : p.importeTotalFinanciado,
                          importe: checked ? String(calc.cuotaMensual) : p.importe,
                          recurrencia: checked ? 'mensual' : p.recurrencia,
                        }));
                      }}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>Gasto financiado a plazos (importe total y mensualidades)</span>
                  </label>

                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.repartoCompartido}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, repartoCompartido: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>Gasto compartido entre adultos (50/50)</span>
                  </label>

                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.esHipoteca}
                      onChange={(e) => setDraft((p) => ({ ...p, esHipoteca: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>Cuota de hipoteca (DT 18.ª / Tesorería)</span>
                  </label>

                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.esSeguroVinculadoHipoteca}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, esSeguroVinculadoHipoteca: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>Seguro vinculado a hipoteca</span>
                  </label>

                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.esDeducibleAutonomo}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, esDeducibleAutonomo: e.target.checked }))
                      }
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>Deducible actividad económica / AEAT</span>
                  </label>
                </div>

                {draft.financiado && (
                  <div className="grid grid-cols-1 gap-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 md:grid-cols-4 dark:border-blue-900 dark:bg-blue-950/20">
                    <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <span>Importe total financiado (€)</span>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={draft.importeTotalFinanciado}
                        onChange={(e) => {
                          const totalVal = Number(e.target.value) || 0;
                          const meses = Math.max(1, Number(draft.mensualidadesTotal) || 12);
                          const tin = Math.max(0, Number(draft.tinFinanciacionPct) || 0);
                          const calc = computeFinancedInstallment(totalVal, meses, tin);
                          setDraft((p) => ({
                            ...p,
                            importeTotalFinanciado: e.target.value,
                            importe: String(calc.cuotaMensual),
                            recurrencia: 'mensual',
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>

                    <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <span>Mensualidades (meses)</span>
                      <input
                        type="number"
                        min="2"
                        max="120"
                        value={draft.mensualidadesTotal}
                        onChange={(e) => {
                          const meses = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          const totalVal = Number(draft.importeTotalFinanciado) || 0;
                          const tin = Math.max(0, Number(draft.tinFinanciacionPct) || 0);
                          const calc = computeFinancedInstallment(totalVal, meses, tin);
                          setDraft((p) => ({
                            ...p,
                            mensualidadesTotal: e.target.value,
                            importe: String(calc.cuotaMensual),
                            recurrencia: 'mensual',
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>

                    <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      <span>TIN financiación (% anual)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={draft.tinFinanciacionPct}
                        onChange={(e) => {
                          const tin = Math.max(0, Number(e.target.value) || 0);
                          const totalVal = Number(draft.importeTotalFinanciado) || 0;
                          const meses = Math.max(1, Number(draft.mensualidadesTotal) || 12);
                          const calc = computeFinancedInstallment(totalVal, meses, tin);
                          setDraft((p) => ({
                            ...p,
                            tinFinanciacionPct: e.target.value,
                            importe: String(calc.cuotaMensual),
                            recurrencia: 'mensual',
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </label>

                    <div className="flex flex-col justify-center text-sm text-slate-800 dark:text-slate-200">
                      {(() => {
                        const finCalc = computeFinancedInstallment(
                          Number(draft.importeTotalFinanciado) || 0,
                          Number(draft.mensualidadesTotal) || 12,
                          Number(draft.tinFinanciacionPct) || 0
                        );
                        return (
                          <>
                            <span className="font-semibold">
                              Cuota mensual: {formatEUR(finCalc.cuotaMensual)}
                            </span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              Total a devolver: {formatEUR(finCalc.totalPagado)} (Intereses:{' '}
                              {formatEUR(finCalc.totalIntereses)})
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                {draft.id ? 'Guardar Cambios' : 'Añadir Movimiento'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Tabla Completa (>= 16px, espaciado generoso, sin densidad excesiva) */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <th className="py-3.5 pl-6 pr-3">Fecha</th>
                <th className="px-3 py-3.5">Concepto y Subcategoría</th>
                <th className="px-3 py-3.5">Categoría / Cuenta</th>
                <th className="px-3 py-3.5">Miembro / Estado</th>
                <th className="px-3 py-3.5 text-right">Importe</th>
                <th className="py-3.5 pl-3 pr-6 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-base text-slate-500 dark:text-slate-400"
                  >
                    No hay movimientos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-4 pl-6 pr-3 font-mono text-sm text-slate-600 tabular-nums whitespace-nowrap dark:text-slate-400">
                      {m.fecha}
                    </td>

                    <td className="px-3 py-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {m.concepto}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {m.tipo === 'transferencia'
                          ? 'Transferencia interna'
                          : m.subcategoria}
                        {m.recurrencia !== 'puntual'
                          ? ` · ${RECURRENCE_LABELS[m.recurrencia]}`
                          : ''}
                        {m.financiado && m.mensualidadesTotal
                          ? ` · Financiado ${m.mensualidadesTotal} cuotas (Total ${formatEUR(
                              m.importeTotalFinanciado ?? m.importe * m.mensualidadesTotal,
                              false
                            )})`
                          : ''}
                        {m.justificanteNombre && (
                          <span className="ml-2 inline-flex items-center gap-1 text-blue-700 dark:text-blue-400">
                            <Paperclip className="h-3.5 w-3.5" />
                            {m.justificanteNombre}
                          </span>
                        )}
                      </p>
                    </td>

                    <td className="px-3 py-4">
                      <p className="text-slate-800 dark:text-slate-200">
                        {m.tipo === 'transferencia'
                          ? `${getAccountName(m.cuentaId)} → ${getAccountName(m.cuentaDestinoId)}`
                          : getCategoryName(m.categoriaId)}
                      </p>
                      {m.tipo !== 'transferencia' && (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {getAccountName(m.cuentaId)}
                        </p>
                      )}
                    </td>

                    <td className="px-3 py-4">
                      <p className="text-slate-800 dark:text-slate-200">
                        {getMemberName(m.miembroId)}
                      </p>
                      <p
                        className={`text-sm font-medium ${
                          m.estado === 'confirmado'
                            ? 'text-slate-500 dark:text-slate-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {STATUS_LABELS[m.estado]} ·{' '}
                        {m.visibilidad === 'privada' ? 'Privado' : 'Compartido'}
                      </p>
                    </td>

                    <td
                      className={`px-3 py-4 text-right font-mono text-lg font-bold tabular-nums whitespace-nowrap ${
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
                      {formatEUR(m.importe)}
                    </td>

                    <td className="py-4 pl-3 pr-6 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {m.estado !== 'confirmado' && (
                          <button
                            type="button"
                            onClick={() => onConfirmMovement(m.id)}
                            title="Confirmar cobro o pago"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-emerald-700 hover:bg-emerald-50 dark:border-slate-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditEditor(m)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(m)}
                          title="Duplicar movimiento"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        {confirmDeleteId === m.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteMovement(m.id);
                              setConfirmDeleteId(null);
                            }}
                            className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800"
                          >
                            Confirmar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(m.id)}
                            title="Eliminar movimiento"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-red-700 hover:bg-red-50 dark:border-slate-700 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
