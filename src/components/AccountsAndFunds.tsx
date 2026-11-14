import React, { useState } from 'react';
import { ArrowRightLeft, Eye, EyeOff, Plus, Shield, Trash2 } from 'lucide-react';
import {
  ACCOUNT_TYPE_LABELS,
  EconomySummaryResult,
  SITUACION_LABORAL_LABELS,
} from '../engines/economyEngine';
import {
  AccountType,
  CategoryConfig,
  EconomyWorkspaceState,
  FinancialAccount,
  FinancialMovement,
  HouseholdMember,
  MemberRole,
  SavingsGoal,
  SituacionLaboral,
} from '../types/economy';
import { formatEUR } from '../utils/formatters';

interface AccountsAndFundsProps {
  state: EconomyWorkspaceState;
  summary: EconomySummaryResult;
  onUpdateAccounts: (accounts: FinancialAccount[]) => void;
  onUpdateGoals: (goals: SavingsGoal[]) => void;
  onUpdateCategories: (categories: CategoryConfig[]) => void;
  onUpdateMembers: (members: HouseholdMember[]) => void;
  onAddMovement: (mov: Omit<FinancialMovement, 'id'>) => void;
}

const ROLE_LABELS: Record<MemberRole, string> = {
  admin: 'Administrador',
  adulto: 'Adulto',
  limitado: 'Limitado (Control Parental)',
};

const GOAL_CATEGORIES: Record<SavingsGoal['categoriaObjetivo'], string> = {
  vacaciones: 'Vacaciones',
  emergencias: 'Emergencias',
  compras: 'Compras importantes',
  estudios: 'Estudios',
  vehiculos: 'Vehículos',
  hipoteca: 'Amortización hipoteca',
  personalizado: 'Personalizado',
};

export const AccountsAndFunds: React.FC<AccountsAndFundsProps> = ({
  state,
  summary,
  onUpdateAccounts,
  onUpdateGoals,
  onUpdateCategories,
  onUpdateMembers,
  onAddMovement,
}) => {
  // Nueva Cuenta
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>('corriente');
  const [accOwner, setAccOwner] = useState('familiar');
  const [accVisibility, setAccVisibility] = useState<'compartida' | 'privada'>('compartida');
  const [accBalance, setAccBalance] = useState('0');
  const [accTae, setAccTae] = useState('0');

  // Nuevo Fondo Reservado
  const [goalName, setGoalName] = useState('');
  const [goalCat, setGoalCat] = useState<SavingsGoal['categoriaObjetivo']>('emergencias');
  const [goalAccount, setGoalAccount] = useState(
    summary.accountBalances[0]?.account.id ?? state.accounts[0]?.id ?? ''
  );
  const [goalTarget, setGoalTarget] = useState('');
  const [goalReserved, setGoalReserved] = useState('0');
  const [goalMonthly, setGoalMonthly] = useState('100');

  // Traspaso rápido a un fondo
  const [fundingGoalId, setFundingGoalId] = useState<string | null>(null);
  const [fundSourceAccountId, setFundSourceAccountId] = useState(
    summary.accountBalances[0]?.account.id ?? state.accounts[0]?.id ?? ''
  );
  const [fundAmount, setFundAmount] = useState('100');

  // Nueva Categoría y Subcategoría
  const [newCatName, setNewCatName] = useState('');
  const [newCatBudget, setNewCatBudget] = useState('100');
  const [newSubNameByCat, setNewSubNameByCat] = useState<Record<string, string>>({});

  // Nuevo Miembro
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<MemberRole>('adulto');
  const [newMemberAge, setNewMemberAge] = useState('35');

  const visibleAccounts = summary.accountBalances.map((b) => b.account);
  const effectiveGoalAccount = state.accounts.some((a) => a.id === goalAccount)
    ? goalAccount
    : (visibleAccounts[0]?.id ?? state.accounts[0]?.id ?? '');
  const effectiveFundSourceAccountId = visibleAccounts.some((a) => a.id === fundSourceAccountId)
    ? fundSourceAccountId
    : (visibleAccounts[0]?.id ?? state.accounts[0]?.id ?? '');

  const balanceByAccountId = new Map(
    summary.accountBalances.map((b) => [b.account.id, b.saldoActual])
  );

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    const next: FinancialAccount = {
      id: `acc-${Date.now()}`,
      nombre: accName.trim(),
      tipo: accType,
      titularId: accOwner,
      visibilidad: accVisibility,
      saldoInicial: Number(accBalance) || 0,
      taePct: Number(accTae) || 0,
      activa: true,
    };
    onUpdateAccounts([...state.accounts, next]);
    setAccName('');
    setAccBalance('0');
    setAccTae('0');
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(goalTarget);
    if (!goalName.trim() || Number.isNaN(target) || target <= 0 || !effectiveGoalAccount) return;
    const next: SavingsGoal = {
      id: `goal-${Date.now()}`,
      nombre: goalName.trim(),
      categoriaObjetivo: goalCat,
      cuentaId: effectiveGoalAccount,
      importeObjetivo: target,
      saldoReservado: Math.max(0, Number(goalReserved) || 0),
      aportacionMensualObjetivo: Math.max(0, Number(goalMonthly) || 0),
    };
    onUpdateGoals([...state.savingsGoals, next]);
    setGoalName('');
    setGoalTarget('');
    setGoalReserved('0');
  };

  const handleExecuteFundTransfer = (goal: SavingsGoal) => {
    const amount = Number(fundAmount);
    if (Number.isNaN(amount) || amount <= 0) return;

    if (effectiveFundSourceAccountId && effectiveFundSourceAccountId !== goal.cuentaId) {
      onAddMovement({
        tipo: 'transferencia',
        importe: amount,
        fecha: '2026-11-13',
        concepto: `Reserva para fondo: ${goal.nombre}`,
        categoriaId: 'cat-finanzas',
        subcategoria: 'Aportaciones a inversión',
        cuentaId: effectiveFundSourceAccountId,
        cuentaDestinoId: goal.cuentaId,
        miembroId: state.actingMemberId,
        visibilidad: 'compartida',
        recurrencia: 'puntual',
        estado: 'confirmado',
      });
    }

    onUpdateGoals(
      state.savingsGoals.map((g) =>
        g.id === goal.id ? { ...g, saldoReservado: g.saldoReservado + amount } : g
      )
    );
    setFundingGoalId(null);
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const next: CategoryConfig = {
      id: `cat-custom-${Date.now()}`,
      nombre: newCatName.trim(),
      coicopCode: 'PERS',
      tipo: 'gasto',
      presupuestoMensual: Math.max(0, Number(newCatBudget) || 0),
      subcategorias: ['General'],
      oculta: false,
      esPersonalizada: true,
    };
    onUpdateCategories([...state.categories, next]);
    setNewCatName('');
    setNewCatBudget('100');
  };

  const handleAddSubcategory = (catId: string) => {
    const label = (newSubNameByCat[catId] ?? '').trim();
    if (!label) return;
    onUpdateCategories(
      state.categories.map((c) =>
        c.id === catId && !c.subcategorias.includes(label)
          ? { ...c, subcategorias: [...c.subcategorias, label] }
          : c
      )
    );
    setNewSubNameByCat((prev) => ({ ...prev, [catId]: '' }));
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    const edad = Math.max(1, Number(newMemberAge) || 18);
    const next: HouseholdMember = {
      id: `mem-${Date.now()}`,
      nombre: newMemberName.trim(),
      rol: newMemberRole,
      edad,
      esTitularFiscal: newMemberRole !== 'limitado' && edad >= 18,
      limiteGastoMensual: newMemberRole === 'limitado' ? 100 : undefined,
      esNomina: newMemberRole !== 'limitado',
      salarioNetoMensual: newMemberRole !== 'limitado' ? 1500 : undefined,
      salarioFuturo:
        newMemberRole !== 'limitado'
          ? { activo: false, mes: 1, anio: 2027, importePrevisto: 1650 }
          : undefined,
    };
    onUpdateMembers([...state.members, next]);
    setNewMemberName('');
  };

  const getAccountName = (id: string) =>
    state.accounts.find((a) => a.id === id)?.nombre ?? 'Cuenta';

  return (
    <div className="space-y-6">
      {/* Resumen Separación Disponible vs Reservado */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Saldo Total en Cuentas Visibles
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-slate-900 tabular-nums dark:text-white">
            {formatEUR(summary.totalEnCuentas)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Dinero Reservado en Fondos y Metas
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
            {formatEUR(summary.totalReservadoFondos)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Dinero Realmente Disponible para Gastos
          </p>
          <p className="mt-2 font-mono text-3xl font-bold text-blue-700 tabular-nums dark:text-blue-400">
            {formatEUR(summary.dineroRealmenteDisponible)}
          </p>
        </div>
      </section>

      {/* Bloque 1: Cuentas Bancarias, Efectivo y Tarjetas */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Cuentas, Tarjetas y Liquidez
        </h2>
        <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
          Distingue cuentas compartidas del hogar y cuentas privadas de cada miembro.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-slate-200 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <th className="py-3 pr-4">Cuenta</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Titular / Visibilidad</th>
                <th className="px-3 py-3 text-right">TAE</th>
                <th className="px-3 py-3 text-right">Saldo Inicial</th>
                <th className="py-3 pl-3 text-right">Saldo Actual</th>
                <th className="py-3 pl-4 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {state.accounts.map((acc) => {
                const saldo = balanceByAccountId.get(acc.id);
                return (
                  <tr key={acc.id}>
                    <td className="py-3.5 pr-4 font-semibold text-slate-900 dark:text-white">
                      {acc.nombre}
                    </td>
                    <td className="px-3 py-3.5 text-slate-600 dark:text-slate-300">
                      {ACCOUNT_TYPE_LABELS[acc.tipo]}
                    </td>
                    <td className="px-3 py-3.5">
                      <select
                        value={acc.visibilidad}
                        onChange={(e) =>
                          onUpdateAccounts(
                            state.accounts.map((item) =>
                              item.id === acc.id
                                ? {
                                    ...item,
                                    visibilidad: e.target.value as 'compartida' | 'privada',
                                  }
                                : item
                            )
                          )
                        }
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      >
                        <option value="compartida">Compartida</option>
                        <option value="privada">Privada</option>
                      </select>
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono tabular-nums">
                      {acc.taePct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <input
                        type="number"
                        step="10"
                        value={acc.saldoInicial}
                        onChange={(e) =>
                          onUpdateAccounts(
                            state.accounts.map((item) =>
                              item.id === acc.id
                                ? { ...item, saldoInicial: Number(e.target.value) || 0 }
                                : item
                            )
                          )
                        }
                        className="w-32 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </td>
                    <td className="py-3.5 pl-3 text-right font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-white">
                      {saldo !== undefined ? formatEUR(saldo) : 'Oculta'}
                    </td>
                    <td className="py-3.5 pl-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateAccounts(
                            state.accounts.map((item) =>
                              item.id === acc.id ? { ...item, activa: !item.activa } : item
                            )
                          )
                        }
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                          acc.activa
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {acc.activa ? 'Activa' : 'Inactiva'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={handleAddAccount}
          className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-200 pt-5 md:grid-cols-6 dark:border-slate-800"
        >
          <input
            type="text"
            required
            value={accName}
            onChange={(e) => setAccName(e.target.value)}
            placeholder="Nueva cuenta (ej. Cuenta Nómina, Efectivo...)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base md:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <select
            value={accType}
            onChange={(e) => setAccType(e.target.value as AccountType)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={accOwner}
              onChange={(e) => setAccOwner(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="familiar">Hogar</option>
              {state.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
            <select
              value={accVisibility}
              onChange={(e) =>
                setAccVisibility(e.target.value as 'compartida' | 'privada')
              }
              className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="compartida">Compartida</option>
              <option value="privada">Privada</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.01"
              value={accBalance}
              onChange={(e) => setAccBalance(e.target.value)}
              placeholder="Saldo €"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <input
              type="number"
              step="0.05"
              value={accTae}
              onChange={(e) => setAccTae(e.target.value)}
              placeholder="TAE %"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            <Plus className="h-4 w-4" />
            Añadir Cuenta
          </button>
        </form>
      </section>

      {/* Bloque 2: Fondos Reservados y Objetivos de Ahorro */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Fondos Reservados y Objetivos de Ahorro
        </h2>
        <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
          Aparta dinero para emergencias, vacaciones, estudios o amortización anticipada sin perder el
          control del disponible diario.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {state.savingsGoals.map((goal) => {
            const pct =
              goal.importeObjetivo > 0 ? (goal.saldoReservado / goal.importeObjetivo) * 100 : 0;
            const remaining = Math.max(0, goal.importeObjetivo - goal.saldoReservado);

            return (
              <div
                key={goal.id}
                className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {goal.nombre}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {GOAL_CATEGORIES[goal.categoriaObjetivo]} · Custodiado en{' '}
                      {getAccountName(goal.cuentaId)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateGoals(state.savingsGoals.filter((g) => g.id !== goal.id))
                    }
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                    title="Eliminar fondo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex items-baseline justify-between font-mono text-base tabular-nums">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    {formatEUR(goal.saldoReservado)} reservado
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    Meta: {formatEUR(goal.importeObjetivo)} ({pct.toFixed(0)}%)
                  </span>
                </div>

                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Falta {formatEUR(remaining)} · Aportación ideal{' '}
                    {formatEUR(goal.aportacionMensualObjetivo)}/mes
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFundingGoalId(fundingGoalId === goal.id ? null : goal.id);
                      setFundAmount(String(goal.aportacionMensualObjetivo || 100));
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-700 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950/30"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Traspasar a fondo
                  </button>
                </div>

                {fundingGoalId === goal.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <select
                      value={effectiveFundSourceAccountId}
                      onChange={(e) => setFundSourceAccountId(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {summary.accountBalances.map((b) => (
                        <option key={b.account.id} value={b.account.id}>
                          Desde: {b.account.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      step="10"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleExecuteFundTransfer(goal)}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      Confirmar traspaso
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <form
          onSubmit={handleAddGoal}
          className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-200 pt-5 md:grid-cols-6 dark:border-slate-800"
        >
          <input
            type="text"
            required
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
            placeholder="Nuevo objetivo (ej. Coche nuevo, Máster...)"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base md:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <select
            value={goalCat}
            onChange={(e) =>
              setGoalCat(e.target.value as SavingsGoal['categoriaObjetivo'])
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {Object.entries(GOAL_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={effectiveGoalAccount}
            onChange={(e) => setGoalAccount(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {state.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="1"
              required
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              placeholder="Meta €"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <input
              type="number"
              min="0"
              value={goalReserved}
              onChange={(e) => setGoalReserved(e.target.value)}
              placeholder="Inicial €"
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            Crear Fondo
          </button>
        </form>
      </section>

      {/* Bloque 3: Miembros del Hogar, Control Parental y Salario Futuro */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <Shield className="h-5 w-5 text-blue-700 dark:text-blue-400" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Miembros del Hogar, Permisos y Previsión Salarial de Adultos
          </h2>
        </div>
        <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
          Configura roles (Administrador, Adulto, Limitado con tope de gasto mensual) y planifica
          subidas salariales futuras por nómina (mes, año e importe neto previsto) conectadas con
          tesorería.
        </p>

        <div className="mt-5 space-y-4">
          {state.members.map((mem) => (
            <div
              key={mem.id}
              className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span>Nombre</span>
                  <input
                    type="text"
                    value={mem.nombre}
                    onChange={(e) =>
                      onUpdateMembers(
                        state.members.map((m) =>
                          m.id === mem.id ? { ...m, nombre: e.target.value } : m
                        )
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>

                <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span>Rol / Permisos</span>
                  <select
                    value={mem.rol}
                    onChange={(e) => {
                      const nextRol = e.target.value as MemberRole;
                      onUpdateMembers(
                        state.members.map((m) =>
                          m.id === mem.id
                            ? {
                                ...m,
                                rol: nextRol,
                                limiteGastoMensual:
                                  nextRol === 'limitado'
                                    ? m.limiteGastoMensual ?? 100
                                    : undefined,
                              }
                            : m
                        )
                      );
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  <span>Edad</span>
                  <input
                    type="number"
                    min="1"
                    max="105"
                    value={mem.edad}
                    onChange={(e) =>
                      onUpdateMembers(
                        state.members.map((m) =>
                          m.id === mem.id
                            ? { ...m, edad: Math.max(1, Number(e.target.value) || 18) }
                            : m
                        )
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>

                {mem.rol === 'limitado' ? (
                  <label className="space-y-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
                    <span>Tope gasto mensual (€)</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={mem.limiteGastoMensual ?? 0}
                      onChange={(e) =>
                        onUpdateMembers(
                          state.members.map((m) =>
                            m.id === mem.id
                              ? { ...m, limiteGastoMensual: Math.max(0, Number(e.target.value) || 0) }
                              : m
                          )
                        )
                      }
                      className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-amber-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>
                ) : (
                  <label className="space-y-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <span>Cuantía actual (€/mes)</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      disabled={mem.situacionActual === 'desempleado'}
                      value={
                        mem.situacionActual === 'desempleado' ? 0 : (mem.salarioNetoMensual ?? 0)
                      }
                      onChange={(e) =>
                        onUpdateMembers(
                          state.members.map((m) =>
                            m.id === mem.id
                              ? {
                                  ...m,
                                  salarioNetoMensual: Math.max(0, Number(e.target.value) || 0),
                                }
                              : m
                          )
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                    />
                  </label>
                )}
              </div>

              {/* Situación actual y situación futura para adultos */}
              {mem.rol !== 'limitado' && (() => {
                const sitActual: SituacionLaboral =
                  mem.situacionActual ?? (mem.esNomina ? 'cuenta_ajena' : 'autonomo');
                const fut = mem.situacionFutura ?? {
                  activo: Boolean(mem.salarioFuturo?.activo),
                  situacion: sitActual,
                  mes: mem.salarioFuturo?.mes ?? 1,
                  anio: mem.salarioFuturo?.anio ?? 2027,
                  cuantiaPrevision:
                    mem.salarioFuturo?.importePrevisto ??
                    Math.round((mem.salarioNetoMensual ?? 2000) * 1.08),
                };

                return (
                  <div className="mt-4 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-slate-600 dark:text-slate-400">
                          Situación actual:
                        </span>
                        <select
                          value={sitActual}
                          onChange={(e) => {
                            const nextSit = e.target.value as SituacionLaboral;
                            onUpdateMembers(
                              state.members.map((m) =>
                                m.id === mem.id
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
                              )
                            );
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          {Object.entries(SITUACION_LABORAL_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={fut.activo}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            onUpdateMembers(
                              state.members.map((m) =>
                                m.id === mem.id
                                  ? {
                                      ...m,
                                      situacionFutura: { ...fut, activo: checked },
                                      salarioFuturo: {
                                        activo: checked,
                                        mes: fut.mes,
                                        anio: fut.anio,
                                        importePrevisto: fut.cuantiaPrevision,
                                      },
                                    }
                                  : m
                              )
                            );
                          }}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>Situación futura prevista</span>
                      </label>
                    </div>

                    {fut.activo && (
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <label className="flex items-center gap-1.5">
                          <span className="text-slate-500">Situación:</span>
                          <select
                            value={fut.situacion}
                            onChange={(e) => {
                              const nextFutSit = e.target.value as SituacionLaboral;
                              const nextPrevVal =
                                nextFutSit === 'desempleado' ? 0 : fut.cuantiaPrevision;
                              onUpdateMembers(
                                state.members.map((m) =>
                                  m.id === mem.id
                                    ? {
                                        ...m,
                                        situacionFutura: {
                                          ...fut,
                                          activo: true,
                                          situacion: nextFutSit,
                                          cuantiaPrevision: nextPrevVal,
                                        },
                                        salarioFuturo: {
                                          activo: true,
                                          mes: fut.mes,
                                          anio: fut.anio,
                                          importePrevisto: nextPrevVal,
                                        },
                                      }
                                    : m
                                )
                              );
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          >
                            {Object.entries(SITUACION_LABORAL_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="flex items-center gap-1.5">
                          <span className="text-slate-500">Mes:</span>
                          <select
                            value={fut.mes}
                            onChange={(e) => {
                              const nextMes = Number(e.target.value);
                              onUpdateMembers(
                                state.members.map((m) =>
                                  m.id === mem.id
                                    ? {
                                        ...m,
                                        situacionFutura: { ...fut, activo: true, mes: nextMes },
                                        salarioFuturo: {
                                          activo: true,
                                          mes: nextMes,
                                          anio: fut.anio,
                                          importePrevisto: fut.cuantiaPrevision,
                                        },
                                      }
                                    : m
                                )
                              );
                            }}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          >
                            {Array.from({ length: 12 }, (_, idx) => idx + 1).map((monthNum) => (
                              <option key={monthNum} value={monthNum}>
                                {String(monthNum).padStart(2, '0')}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="flex items-center gap-1.5">
                          <span className="text-slate-500">Año:</span>
                          <input
                            type="number"
                            min="2026"
                            max="2060"
                            value={fut.anio}
                            onChange={(e) => {
                              const nextAnio = Number(e.target.value) || 2027;
                              onUpdateMembers(
                                state.members.map((m) =>
                                  m.id === mem.id
                                    ? {
                                        ...m,
                                        situacionFutura: { ...fut, activo: true, anio: nextAnio },
                                        salarioFuturo: {
                                          activo: true,
                                          mes: fut.mes,
                                          anio: nextAnio,
                                          importePrevisto: fut.cuantiaPrevision,
                                        },
                                      }
                                    : m
                                )
                              );
                            }}
                            className="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </label>

                        <label className="flex items-center gap-1.5">
                          <span className="text-slate-500">Cuantía previsión (€/mes):</span>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            disabled={fut.situacion === 'desempleado'}
                            value={fut.situacion === 'desempleado' ? 0 : fut.cuantiaPrevision}
                            onChange={(e) => {
                              const nextVal = Math.max(0, Number(e.target.value) || 0);
                              onUpdateMembers(
                                state.members.map((m) =>
                                  m.id === mem.id
                                    ? {
                                        ...m,
                                        situacionFutura: {
                                          ...fut,
                                          activo: true,
                                          cuantiaPrevision: nextVal,
                                        },
                                        salarioFuturo: {
                                          activo: true,
                                          mes: fut.mes,
                                          anio: fut.anio,
                                          importePrevisto: nextVal,
                                        },
                                      }
                                    : m
                                )
                              );
                            }}
                            className="w-32 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono font-semibold text-emerald-700 tabular-nums disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-emerald-400 dark:disabled:bg-slate-900"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>

        <form
          onSubmit={handleAddMember}
          className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-200 pt-5 md:grid-cols-5 dark:border-slate-800"
        >
          <input
            type="text"
            required
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            placeholder="Añadir miembro del hogar..."
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base md:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <select
            value={newMemberRole}
            onChange={(e) => setNewMemberRole(e.target.value as MemberRole)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            max="105"
            value={newMemberAge}
            onChange={(e) => setNewMemberAge(e.target.value)}
            placeholder="Edad"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
          >
            <Plus className="h-4 w-4" />
            Añadir Miembro
          </button>
        </form>
      </section>

      {/* Bloque 4: Catálogo COICOP Configurable y Presupuestos Mensuales */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Catálogo COICOP Configurable y Presupuestos Mensuales
        </h2>
        <p className="mt-1 text-base text-slate-600 dark:text-slate-400">
          Ajusta el presupuesto mensual de cada categoría, oculta las que no utilices o añade
          subcategorías personalizadas sin sesgos.
        </p>

        <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
          {state.categories
            .filter((c) => c.tipo === 'gasto')
            .map((cat) => (
              <div
                key={cat.id}
                className="flex flex-wrap items-center justify-between gap-4 py-3.5"
              >
                <div className="min-w-[260px] flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs text-slate-400">{cat.coicopCode}</span>
                    <span
                      className={`text-base font-semibold ${
                        cat.oculta
                          ? 'text-slate-400 line-through'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {cat.nombre}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Subcategorías: {cat.subcategorias.join(' · ')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newSubNameByCat[cat.id] ?? ''}
                      onChange={(e) =>
                        setNewSubNameByCat((prev) => ({
                          ...prev,
                          [cat.id]: e.target.value,
                        }))
                      }
                      placeholder="Nueva subcategoría..."
                      className="w-40 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddSubcategory(cat.id)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      + Sub
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <span>Límite/mes (€):</span>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={cat.presupuestoMensual}
                      onChange={(e) =>
                        onUpdateCategories(
                          state.categories.map((c) =>
                            c.id === cat.id
                              ? { ...c, presupuestoMensual: Math.max(0, Number(e.target.value) || 0) }
                              : c
                          )
                        )
                      }
                      className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-right font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateCategories(
                        state.categories.map((c) =>
                          c.id === cat.id ? { ...c, oculta: !c.oculta } : c
                        )
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {cat.oculta ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {cat.oculta ? 'Oculta' : 'Visible'}
                  </button>
                </div>
              </div>
            ))}
        </div>

        <form
          onSubmit={handleAddCategory}
          className="mt-5 grid grid-cols-1 gap-3 border-t border-slate-200 pt-5 md:grid-cols-4 dark:border-slate-800"
        >
          <input
            type="text"
            required
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nueva categoría personalizada..."
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base md:col-span-2 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <input
            type="number"
            min="0"
            step="10"
            value={newCatBudget}
            onChange={(e) => setNewCatBudget(e.target.value)}
            placeholder="Presupuesto €/mes"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-base tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            Añadir Categoría
          </button>
        </form>
      </section>
    </div>
  );
};
