import React, { useMemo, useState } from 'react';
import { Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import {
  BudgetFrequency,
  BudgetItem,
  BudgetItemType,
  ProfileDefinition,
} from '../types/finance';
import {
  formatEUR,
  formatPct,
  toAnnualAmount,
  toMonthlyEquivalent,
} from '../utils/formatters';

interface BudgetWorkspaceProps {
  profile: ProfileDefinition;
  items: BudgetItem[];
  onUpdateItems: (items: BudgetItem[]) => void;
  onResetProfile: () => void;
  onNavigateMortgage: () => void;
}

const MESES_OPCIONES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

export const BudgetWorkspace: React.FC<BudgetWorkspaceProps> = ({
  profile,
  items,
  onUpdateItems,
  onResetProfile,
  onNavigateMortgage,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todas');
  const [typeFilter, setTypeFilter] = useState<'todos' | BudgetItemType>('todos');
  const [showAddForm, setShowAddForm] = useState(false);

  // Estado formulario nueva partida
  const [newNombre, setNewNombre] = useState('');
  const [newCategoria, setNewCategoria] = useState(profile.categorias[1] ?? profile.categorias[0]);
  const [newTipo, setNewTipo] = useState<BudgetItemType>('gasto_ordinario');
  const [newImporte, setNewImporte] = useState('120');
  const [newFrecuencia, setNewFrecuencia] = useState<BudgetFrequency>('mensual');
  const [newMesPuntual, setNewMesPuntual] = useState<number>(6);
  const [newEsHipoteca, setNewEsHipoteca] = useState(false);

  const metrics = useMemo(() => {
    let ingresosMensuales = 0;
    let gastosOrdinariosMensuales = 0;
    let gastosExtraAnuales = 0;
    let hipotecaMensual = 0;

    const porCategoria = new Map<string, number>();

    for (const item of items) {
      if (!item.activo) continue;
      const eqMensual = toMonthlyEquivalent(item.importe, item.frecuencia);
      const eqAnual = toAnnualAmount(item.importe, item.frecuencia);

      if (item.tipo === 'ingreso') {
        ingresosMensuales += eqMensual;
      } else if (item.tipo === 'gasto_ordinario') {
        gastosOrdinariosMensuales += eqMensual;
        if (item.esHipoteca) {
          hipotecaMensual += eqMensual;
        }
        porCategoria.set(item.categoria, (porCategoria.get(item.categoria) ?? 0) + eqMensual);
      } else {
        gastosExtraAnuales += eqAnual;
        porCategoria.set(item.categoria, (porCategoria.get(item.categoria) ?? 0) + eqMensual);
      }
    }

    const gastosExtraMensualizados = gastosExtraAnuales / 12;
    const gastosTotalesMensuales = gastosOrdinariosMensuales + gastosExtraMensualizados;
    const ahorroNetoMensual = ingresosMensuales - gastosTotalesMensuales;
    const ahorroSinHipoteca = ahorroNetoMensual + hipotecaMensual;
    const tasaAhorro = ingresosMensuales > 0 ? (ahorroNetoMensual / ingresosMensuales) * 100 : 0;

    const categoriasOrdenadas = Array.from(porCategoria.entries())
      .map(([categoria, mensual]) => ({
        categoria,
        mensual,
        pctSobreGasto: gastosTotalesMensuales > 0 ? (mensual / gastosTotalesMensuales) * 100 : 0,
      }))
      .sort((a, b) => b.mensual - a.mensual);

    return {
      ingresosMensuales,
      gastosOrdinariosMensuales,
      gastosExtraAnuales,
      gastosExtraMensualizados,
      gastosTotalesMensuales,
      ahorroNetoMensual,
      ahorroSinHipoteca,
      tasaAhorro,
      categoriasOrdenadas,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedCategory !== 'todas' && item.categoria !== selectedCategory) return false;
      if (typeFilter !== 'todos' && item.tipo !== typeFilter) return false;
      if (
        q &&
        !item.nombre.toLowerCase().includes(q) &&
        !item.categoria.toLowerCase().includes(q) &&
        !item.coicopCode.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [items, searchTerm, selectedCategory, typeFilter]);

  const handleToggleItem = (id: string) => {
    onUpdateItems(
      items.map((item) => (item.id === id ? { ...item, activo: !item.activo } : item))
    );
  };

  const handleAmountChange = (id: string, val: string) => {
    const num = Number(val);
    if (Number.isNaN(num) || num < 0) return;
    onUpdateItems(
      items.map((item) => (item.id === id ? { ...item, importe: num } : item))
    );
  };

  const handleFrequencyChange = (id: string, frecuencia: BudgetFrequency) => {
    onUpdateItems(
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              frecuencia,
              mesPuntual: frecuencia === 'puntual' ? item.mesPuntual ?? 6 : undefined,
            }
          : item
      )
    );
  };

  const handleDeleteItem = (id: string) => {
    onUpdateItems(items.filter((item) => item.id !== id));
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const importeNum = Number(newImporte);
    if (!newNombre.trim() || Number.isNaN(importeNum) || importeNum < 0) return;

    const item: BudgetItem = {
      id: `custom-${Date.now()}`,
      nombre: newNombre.trim(),
      categoria: newCategoria,
      coicopCode: newTipo === 'gasto_extraordinario' ? 'EXT-USR' : 'COICOP-USR',
      tipo: newTipo,
      importe: importeNum,
      frecuencia: newTipo === 'gasto_extraordinario' ? 'puntual' : newFrecuencia,
      mesPuntual:
        newTipo === 'gasto_extraordinario' || newFrecuencia === 'puntual'
          ? newMesPuntual
          : undefined,
      activo: true,
      esHipoteca: newEsHipoteca,
    };

    onUpdateItems([...items, item]);
    setNewNombre('');
    setNewImporte('100');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Cabecera de contexto y KPIs principales (>= 24px) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Ingresos Netos Mensuales
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums lg:text-3xl dark:text-white">
            {formatEUR(metrics.ingresosMensuales)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            {formatEUR(metrics.ingresosMensuales * 12, false)} / año equivalente
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Gastos Totales (Ord. + Extra)
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-slate-900 tabular-nums lg:text-3xl dark:text-white">
            {formatEUR(metrics.gastosTotalesMensuales)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            Ordinarios {formatEUR(metrics.gastosOrdinariosMensuales, false)} · Extra{' '}
            {formatEUR(metrics.gastosExtraAnuales, false)}/año
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Capacidad de Ahorro Neta
          </p>
          <p
            className={`mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums lg:text-3xl ${
              metrics.ahorroNetoMensual >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {formatEUR(metrics.ahorroNetoMensual)}
          </p>
          <p className="mt-2 text-sm text-slate-500 tabular-nums dark:text-slate-400">
            Tasa de ahorro: {formatPct(metrics.tasaAhorro)} ·{' '}
            {metrics.ahorroNetoMensual >= 0 ? 'Superávit' : 'Déficit'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Flujo Libre Pre-Hipoteca
          </p>
          <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-blue-700 tabular-nums lg:text-3xl dark:text-blue-400">
            {formatEUR(metrics.ahorroSinHipoteca)}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Base simulador hipoteca</span>
            <button
              type="button"
              onClick={onNavigateMortgage}
              className="font-semibold text-blue-700 hover:underline dark:text-blue-400 whitespace-nowrap"
            >
              Simular →
            </button>
          </div>
        </div>
      </section>

      {/* Distribución COICOP por categorías */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Estructura de Gasto por Clasificación COICOP (INE)
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {profile.nombre} · {profile.subtitulo} · Equivalencia mensualizada incluyendo
              prorrateo de extraordinarios
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Añadir partida
            </button>
            <button
              type="button"
              onClick={onResetProfile}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              Restaurar catálogo
            </button>
          </div>
        </div>

        {/* Barras limpias por categoría */}
        <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
          {metrics.categoriasOrdenadas.map((cat) => (
            <div key={cat.categoria} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-base">
                <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                  {cat.categoria}
                </span>
                <span className="font-mono text-base font-semibold text-slate-900 tabular-nums whitespace-nowrap dark:text-white">
                  {formatEUR(cat.mensual)}{' '}
                  <span className="text-sm font-normal text-slate-500 dark:text-slate-400">
                    ({cat.pctSobreGasto.toFixed(1)}%)
                  </span>
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    cat.categoria.includes('99.')
                      ? 'bg-amber-600 dark:bg-amber-500'
                      : 'bg-blue-700 dark:bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, cat.pctSobreGasto))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Formulario añadir nueva partida */}
      {showAddForm && (
        <form
          onSubmit={handleAddItem}
          className="rounded-xl border border-blue-200 bg-blue-50/40 p-6 dark:border-blue-900/60 dark:bg-slate-900"
        >
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            Nueva partida presupuestaria o gasto extraordinario
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Concepto
              </label>
              <input
                type="text"
                required
                value={newNombre}
                onChange={(e) => setNewNombre(e.target.value)}
                placeholder="Ej. Instalación placas solares o seguro vida"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Tipo
              </label>
              <select
                value={newTipo}
                onChange={(e) => setNewTipo(e.target.value as BudgetItemType)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="gasto_ordinario">Gasto ordinario</option>
                <option value="gasto_extraordinario">Gasto extraordinario</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Categoría COICOP
              </label>
              <select
                value={newCategoria}
                onChange={(e) => setNewCategoria(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {profile.categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Importe (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={newImporte}
                onChange={(e) => setNewImporte(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {newTipo === 'gasto_extraordinario' ? 'Mes previsto' : 'Frecuencia'}
              </label>
              {newTipo === 'gasto_extraordinario' ? (
                <select
                  value={newMesPuntual}
                  onChange={(e) => setNewMesPuntual(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {MESES_OPCIONES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={newFrecuencia}
                  onChange={(e) => setNewFrecuencia(e.target.value as BudgetFrequency)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                  <option value="puntual">Puntual (1 vez/año)</option>
                </select>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={newEsHipoteca}
                onChange={(e) => setNewEsHipoteca(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              Vincular como cuota hipotecaria (se descuenta al calcular capacidad libre pre-hipoteca)
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Guardar partida
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Filtros y Tabla Maestra (>= 16px en tablas) */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'todos', label: 'Todas las partidas' },
                { id: 'ingreso', label: 'Ingresos' },
                { id: 'gasto_ordinario', label: 'Gastos ordinarios' },
                { id: 'gasto_extraordinario', label: 'Extraordinarios' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  typeFilter === tab.id
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="todas">Todas las categorías COICOP</option>
              {profile.categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar concepto..."
                className="rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <th className="py-3.5 pl-5 pr-3">Activo</th>
                <th className="px-3 py-3.5">Concepto y clasificación</th>
                <th className="px-3 py-3.5">Frecuencia</th>
                <th className="px-3 py-3.5 text-right">Importe (€)</th>
                <th className="px-3 py-3.5 text-right">Equiv. Mensual</th>
                <th className="px-3 py-3.5 text-right">Total Anual</th>
                <th className="py-3.5 pl-3 pr-5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-base text-slate-500">
                    No hay partidas que coincidan con el filtro aplicado.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const mensual = item.activo
                    ? toMonthlyEquivalent(item.importe, item.frecuencia)
                    : 0;
                  const anual = item.activo ? toAnnualAmount(item.importe, item.frecuencia) : 0;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        !item.activo ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="py-3.5 pl-5 pr-3">
                        <input
                          type="checkbox"
                          checked={item.activo}
                          onChange={() => handleToggleItem(item.id)}
                          aria-label={`Activar ${item.nombre}`}
                          className="h-5 w-5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {item.nombre}
                        </div>
                        <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                          {item.categoria} · Código {item.coicopCode}
                          {item.tipo === 'ingreso'
                            ? ' · Ingreso'
                            : item.tipo === 'gasto_extraordinario'
                              ? ` · Extraordinario${
                                  item.mesPuntual
                                    ? ` (${
                                        MESES_OPCIONES.find((m) => m.value === item.mesPuntual)
                                          ?.label ?? ''
                                      })`
                                    : ''
                                }`
                              : ''}
                          {item.esHipoteca ? ' · Vinculado a Hipoteca' : ''}
                          {item.esSeguroVinculadoHipoteca ? ' · Seguro computable DT 18.ª' : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3.5">
                        <select
                          value={item.frecuencia}
                          onChange={(e) =>
                            handleFrequencyChange(item.id, e.target.value as BudgetFrequency)
                          }
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="mensual">Mensual</option>
                          <option value="trimestral">Trimestral</option>
                          <option value="anual">Anual</option>
                          <option value="puntual">Puntual</option>
                        </select>
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.importe}
                          onChange={(e) => handleAmountChange(item.id, e.target.value)}
                          aria-label={`Importe de ${item.nombre}`}
                          className="w-28 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono text-base font-medium text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </td>
                      <td
                        className={`px-3 py-3.5 text-right font-mono text-base font-semibold tabular-nums ${
                          item.tipo === 'ingreso'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {item.tipo === 'ingreso' ? '+' : ''}
                        {formatEUR(mensual)}
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono text-base text-slate-600 tabular-nums dark:text-slate-300">
                        {formatEUR(anual, false)}
                      </td>
                      <td className="py-3.5 pl-3 pr-5 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          title="Eliminar partida"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
