import {
  AccountType,
  CardSubtype,
  CategoryConfig,
  EconomyMode,
  EconomyWorkspaceState,
  FinancialAccount,
  FinancialMovement,
  HouseholdMember,
  MovementRecurrence,
  PeriodPreset,
  SituacionLaboral,
} from '../types/economy';
import { FutureSalaryAdjustment } from '../types/finance';

export interface PeriodRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  label: string;
}

export function getReferenceDateISO(): string {
  // Fecha de referencia coherente con el entorno del ejercicio actual (Noviembre 2026)
  return '2026-11-13';
}

export function resolvePeriodRange(
  preset: PeriodPreset,
  customStart?: string,
  customEnd?: string,
  referenceISO = getReferenceDateISO()
): PeriodRange {
  const [yStr, mStr] = referenceISO.split('-');
  const year = Number(yStr);
  const month = Number(mStr);

  const lastDayOfMonth = (y: number, m: number) =>
    new Date(y, m, 0).getDate();

  const fmtMonthStart = (y: number, m: number) =>
    `${y}-${String(m).padStart(2, '0')}-01`;
  const fmtMonthEnd = (y: number, m: number) =>
    `${y}-${String(m).padStart(2, '0')}-${String(lastDayOfMonth(y, m)).padStart(2, '0')}`;

  if (preset === 'mes_actual') {
    return {
      start: fmtMonthStart(year, month),
      end: fmtMonthEnd(year, month),
      label: `Mes actual (${String(month).padStart(2, '0')}/${year})`,
    };
  }

  if (preset === 'mes_anterior') {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return {
      start: fmtMonthStart(prevYear, prevMonth),
      end: fmtMonthEnd(prevYear, prevMonth),
      label: `Mes anterior (${String(prevMonth).padStart(2, '0')}/${prevYear})`,
    };
  }

  if (preset === 'ultimos_3_meses') {
    let startM = month - 2;
    let startY = year;
    if (startM <= 0) {
      startM += 12;
      startY -= 1;
    }
    return {
      start: fmtMonthStart(startY, startM),
      end: fmtMonthEnd(year, month),
      label: 'Últimos 3 meses',
    };
  }

  if (preset === 'anio_actual') {
    return {
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      label: `Año ${year}`,
    };
  }

  return {
    start: customStart || fmtMonthStart(year, month),
    end: customEnd || fmtMonthEnd(year, month),
    label: 'Período personalizado',
  };
}

export function canMemberViewMovement(
  actingMember: HouseholdMember | undefined,
  movement: FinancialMovement,
  mode: EconomyMode = 'familiar'
): boolean {
  if (!actingMember || actingMember.rol === 'admin') return true;
  if (actingMember.autorizadoAcceso === false) return false;
  if (actingMember.rol === 'adulto') {
    if (mode === 'familiar' && actingMember.autorizadoVerTodo === true) return true;
    return movement.miembroId === actingMember.id || movement.visibilidad === 'compartida';
  }
  // Rol limitado (menor): solo ve sus propios movimientos
  return movement.miembroId === actingMember.id;
}

export function canMemberViewAccount(
  actingMember: HouseholdMember | undefined,
  account: FinancialAccount,
  mode: EconomyMode = 'familiar'
): boolean {
  if (!actingMember || actingMember.rol === 'admin') return true;
  if (actingMember.autorizadoAcceso === false) return false;
  if (actingMember.rol === 'adulto') {
    if (mode === 'familiar' && actingMember.autorizadoVerTodo === true) return true;
    return (
      account.titularId === actingMember.id ||
      account.titularId === 'familiar' ||
      account.visibilidad === 'compartida'
    );
  }
  // Rol limitado (menor): solo ve sus propias cuentas
  return account.titularId === actingMember.id;
}

export interface FamilyAuthorizationResult {
  ok: boolean;
  error?: string;
  updatedMembers?: HouseholdMember[];
  authorizedMember?: HouseholdMember;
}

/**
 * Regla estricta: las autorizaciones SOLO están disponibles en modalidad 'familiar'
 * y ÚNICAMENTE para miembros existentes de la unidad familiar (nunca terceras personas).
 */
export function authorizeFamilyMemberByEmail(
  state: EconomyWorkspaceState,
  rawEmail: string,
  grantFullView: boolean
): FamilyAuthorizationResult {
  if (state.mode !== 'familiar') {
    return {
      ok: false,
      error:
        'Las autorizaciones solo están disponibles en la modalidad Unidad Familiar.',
    };
  }

  const actingMember = state.members.find((m) => m.id === state.actingMemberId);
  if (actingMember && actingMember.rol !== 'admin') {
    return {
      ok: false,
      error:
        'Solo el usuario titular de la cuenta (administrador) puede gestionar autorizaciones.',
    };
  }

  const normalized = rawEmail.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return {
      ok: false,
      error: 'Introduce un correo electrónico válido de un miembro de la unidad familiar.',
    };
  }

  const target = state.members.find(
    (m) => (m.email ?? '').trim().toLowerCase() === normalized
  );

  if (!target) {
    return {
      ok: false,
      error: `Bloqueado: "${rawEmail.trim()}" no forma parte de esta unidad familiar. Nunca se puede autorizar a una tercera persona externa.`,
    };
  }

  if (target.rol === 'admin') {
    return {
      ok: false,
      error: `${target.nombre} es el usuario titular de la cuenta y ya dispone de acceso total.`,
    };
  }

  const nextFullView = target.rol === 'adulto' ? grantFullView : false;
  const updatedMembers = state.members.map((m) =>
    m.id === target.id
      ? {
          ...m,
          autorizadoAcceso: true,
          autorizadoVerTodo: nextFullView,
        }
      : m
  );

  const authorizedMember = updatedMembers.find((m) => m.id === target.id);
  return {
    ok: true,
    updatedMembers,
    authorizedMember,
  };
}

export interface ComputedAccountBalance {
  account: FinancialAccount;
  saldoActual: number;
  entradasConfirmadas: number;
  salidasConfirmadas: number;
}

export function computeAccountBalances(
  accounts: FinancialAccount[],
  movements: FinancialMovement[]
): ComputedAccountBalance[] {
  return accounts.map((acc) => {
    let entradas = 0;
    let salidas = 0;

    for (const mov of movements) {
      if (mov.estado !== 'confirmado') continue;
      if (mov.tipo === 'ingreso' && mov.cuentaId === acc.id) {
        entradas += mov.importe;
      } else if (mov.tipo === 'devolucion' && mov.cuentaId === acc.id) {
        entradas += mov.importe;
      } else if (mov.tipo === 'gasto' && mov.cuentaId === acc.id) {
        salidas += mov.importe;
      } else if (mov.tipo === 'transferencia') {
        if (mov.cuentaId === acc.id) {
          salidas += mov.importe;
        }
        if (mov.cuentaDestinoId === acc.id) {
          entradas += mov.importe;
        }
      }
    }

    return {
      account: acc,
      saldoActual: acc.saldoInicial + entradas - salidas,
      entradasConfirmadas: entradas,
      salidasConfirmadas: salidas,
    };
  });
}

export interface CategoryBudgetStatus {
  category: CategoryConfig;
  gastado: number;
  presupuestado: number;
  disponible: number;
  superado: number;
  pctUso: number;
}

export type SavingsHealthLevel =
  | 'saludable'
  | 'moderada'
  | 'ajustada'
  | 'deficit'
  | 'sin_datos';

export interface ProjectedAnnualSavings {
  tasaAhorroAnualPct: number;
  ahorroAnualProyectado: number;
  ingresosAnualesProyectados: number;
  gastosAnualesProyectados: number;
  ahorroMensualMedio: number;
  ingresosMensualesMedios: number;
  gastosMensualesMedios: number;
  mesesAnalizados: number;
  primerMesYYYYMM: string | null;
  ultimoMesYYYYMM: string | null;
  hasData: boolean;
  hasIncome: boolean;
  nivelSalud: SavingsHealthLevel;
}

export interface ProratedPeriodItem {
  movement: FinancialMovement;
  effectiveAmount: number;
  monthlyShare: number;
  monthsCovered: number;
  divisor: number;
  isProrated: boolean;
}

export interface EconomySummaryResult {
  periodRange: PeriodRange;
  prorrateoActivo: boolean;
  proratedExpenseCountInPeriod: number;
  effectiveAmountByMovementId: Record<string, ProratedPeriodItem>;
  ingresosPeriodo: number;
  gastosPeriodo: number;
  ahorroNetoPeriodo: number;
  gastosPendientesYProximos: number;
  totalEnCuentas: number;
  totalReservadoFondos: number;
  dineroRealmenteDisponible: number;
  comparacionMesAnterior: {
    ingresosAnterior: number;
    gastosAnterior: number;
    ahorroAnterior: number;
    deltaAhorro: number;
    deltaGastosPct: number;
  };
  projectedAnnualSavings: ProjectedAnnualSavings;
  accountBalances: ComputedAccountBalance[];
  categoryBudgets: CategoryBudgetStatus[];
  monthlyBudgetGoals: CategoryBudgetStatus[];
  upcomingMovements: FinancialMovement[];
  visibleMovementsInPeriod: FinancialMovement[];
  capacidadAhorroPreHipotecaMensual: number;
  ajustesSalarioFuturo: FutureSalaryAdjustment[];
  parentalAlert?: {
    memberName: string;
    spentThisMonth: number;
    limit: number;
    exceeded: boolean;
  };
}

export function getCalendarMonthsInPeriod(range: PeriodRange): string[] {
  const startYM = range.start.slice(0, 7);
  const endYM = range.end.slice(0, 7);
  if (
    !/^\d{4}-\d{2}$/.test(startYM) ||
    !/^\d{4}-\d{2}$/.test(endYM) ||
    startYM > endYM
  ) {
    return [];
  }
  const [sy, sm] = startYM.split('-').map(Number);
  const [ey, em] = endYM.split('-').map(Number);
  const months: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (months.length > 120) break;
  }
  return months;
}

export function isProratableExpense(m: FinancialMovement): boolean {
  return (
    m.tipo === 'gasto' &&
    !m.financiado &&
    (m.recurrencia === 'trimestral' || m.recurrencia === 'anual')
  );
}

export function getProratedCoverageMonths(
  fechaISO: string,
  recurrencia: MovementRecurrence
): string[] | null {
  const ym = fechaISO.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [yStr, mStr] = ym.split('-');
  const year = Number(yStr);
  const month = Number(mStr);

  if (recurrencia === 'trimestral') {
    const qStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return [
      `${year}-${String(qStartMonth).padStart(2, '0')}`,
      `${year}-${String(qStartMonth + 1).padStart(2, '0')}`,
      `${year}-${String(qStartMonth + 2).padStart(2, '0')}`,
    ];
  }

  if (recurrencia === 'anual') {
    return Array.from(
      { length: 12 },
      (_, idx) => `${year}-${String(idx + 1).padStart(2, '0')}`
    );
  }

  return null;
}

export function getMonthlyProratedShare(m: FinancialMovement): number {
  if (!isProratableExpense(m)) return m.importe;
  return m.recurrencia === 'trimestral' ? m.importe / 3 : m.importe / 12;
}

export function getMovementEffectiveAmountForPeriod(
  m: FinancialMovement,
  periodRange: PeriodRange,
  periodMonths: string[],
  prorratearGastos: boolean
): {
  included: boolean;
  amount: number;
  monthsCovered: number;
  divisor: number;
  isProrated: boolean;
} {
  const inDirectRange = m.fecha >= periodRange.start && m.fecha <= periodRange.end;

  if (!prorratearGastos || !isProratableExpense(m)) {
    return {
      included: inDirectRange,
      amount: inDirectRange ? m.importe : 0,
      monthsCovered: inDirectRange ? 1 : 0,
      divisor: 1,
      isProrated: false,
    };
  }

  const coverageMonths = getProratedCoverageMonths(m.fecha, m.recurrencia);
  if (!coverageMonths) {
    return {
      included: inDirectRange,
      amount: inDirectRange ? m.importe : 0,
      monthsCovered: inDirectRange ? 1 : 0,
      divisor: 1,
      isProrated: false,
    };
  }

  const coverageSet = new Set(coverageMonths);
  const overlapCount = periodMonths.filter((ym) => coverageSet.has(ym)).length;
  if (overlapCount === 0) {
    return {
      included: false,
      amount: 0,
      monthsCovered: 0,
      divisor: coverageMonths.length,
      isProrated: true,
    };
  }

  const monthlyShare = m.importe / coverageMonths.length;
  return {
    included: true,
    amount: monthlyShare * overlapCount,
    monthsCovered: overlapCount,
    divisor: coverageMonths.length,
    isProrated: true,
  };
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  corriente: 'Cuenta corriente',
  ahorro: 'Cuenta de ahorro',
  remunerada: 'Cuenta remunerada',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  personalizada: 'Personalizada',
};

export const CARD_SUBTYPE_LABELS: Record<CardSubtype, string> = {
  credito: 'Crédito',
  debito: 'Débito',
  monedero: 'Monedero',
  virtual: 'Virtual',
  otras: 'Otras',
};

function roundEUR(val: number): number {
  return Math.round(val * 100) / 100;
}

function buildMonthlyDateISO(year: number, month: number, day: number): string {
  const maxDay = new Date(year, month, 0).getDate();
  const safeDay = Math.max(1, Math.min(day, maxDay));
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

export function computeCardRechargeCap(
  saldoActual: number,
  limiteDisponible: number,
  recargaMensualImporte: number
): {
  margenHastaLimite: number;
  importeEfectivoRecarga: number;
  saldoTrasRecarga: number;
} {
  if (limiteDisponible <= 0 || recargaMensualImporte <= 0) {
    return {
      margenHastaLimite: Math.max(0, roundEUR(limiteDisponible - saldoActual)),
      importeEfectivoRecarga: 0,
      saldoTrasRecarga: roundEUR(saldoActual),
    };
  }
  const margenHastaLimite = Math.max(0, roundEUR(limiteDisponible - saldoActual));
  const importeEfectivoRecarga = roundEUR(
    Math.min(recargaMensualImporte, margenHastaLimite)
  );
  return {
    margenHastaLimite,
    importeEfectivoRecarga,
    saldoTrasRecarga: roundEUR(saldoActual + importeEfectivoRecarga),
  };
}

export function getNextPeriodicRechargeDate(
  fechaPeriodicaISO: string,
  referenceISO = getReferenceDateISO(),
  ultimaRecargaYYYYMM?: string
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPeriodicaISO)) {
    return referenceISO;
  }
  if (fechaPeriodicaISO > referenceISO) {
    return fechaPeriodicaISO;
  }
  const day = Number(fechaPeriodicaISO.slice(8, 10)) || 1;
  const [refY, refM] = referenceISO.split('-').map(Number);
  const currentYM = referenceISO.slice(0, 7);
  const candidateThisMonth = buildMonthlyDateISO(refY, refM, day);

  if (ultimaRecargaYYYYMM !== currentYM && candidateThisMonth >= referenceISO) {
    return candidateThisMonth;
  }
  if (ultimaRecargaYYYYMM !== currentYM && candidateThisMonth < referenceISO) {
    return candidateThisMonth;
  }

  const nextM = refM === 12 ? 1 : refM + 1;
  const nextY = refM === 12 ? refY + 1 : refY;
  return buildMonthlyDateISO(nextY, nextM, day);
}

export interface CardAutoRechargeEvent {
  accountId: string;
  accountName: string;
  amount: number;
  cappedByLimit: boolean;
  reason?: string;
}

export function processDueCardAutoRecharges(
  state: EconomyWorkspaceState,
  referenceISO = getReferenceDateISO(),
  forceAccountId?: string
): {
  nextState: EconomyWorkspaceState;
  appliedCount: number;
  totalRecharged: number;
  events: CardAutoRechargeEvent[];
} {
  const currentYM = referenceISO.slice(0, 7);
  const [refY, refM] = referenceISO.split('-').map(Number);

  const initialBalances = computeAccountBalances(state.accounts, state.movements);
  const runningBalanceById = new Map<string, number>(
    initialBalances.map((b) => [b.account.id, b.saldoActual])
  );

  const newMovements: FinancialMovement[] = [];
  const events: CardAutoRechargeEvent[] = [];
  let appliedCount = 0;
  let totalRecharged = 0;
  let accountsChanged = false;

  const updatedAccounts = state.accounts.map((acc) => {
    if (!acc.activa || acc.tipo !== 'tarjeta' || !acc.tarjetaConfig) {
      return acc;
    }
    const cfg = acc.tarjetaConfig;
    const isForced = forceAccountId === acc.id;
    if (!isForced && (cfg.recargaMensualImporte <= 0 || cfg.limiteDisponible <= 0)) {
      return acc;
    }

    const startISO = cfg.fechaPeriodicaRecarga;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO)) {
      return acc;
    }

    const periodicDay = Number(startISO.slice(8, 10)) || 1;
    const dueDateThisMonth = buildMonthlyDateISO(refY, refM, periodicDay);
    const isDueBySchedule =
      startISO <= referenceISO &&
      dueDateThisMonth <= referenceISO &&
      cfg.ultimaRecargaYYYYMM !== currentYM;

    if (!isForced && !isDueBySchedule) {
      return acc;
    }

    const saldoActual = runningBalanceById.get(acc.id) ?? acc.saldoInicial;
    const { importeEfectivoRecarga } = computeCardRechargeCap(
      saldoActual,
      cfg.limiteDisponible,
      cfg.recargaMensualImporte
    );

    const cappedByLimit =
      importeEfectivoRecarga < cfg.recargaMensualImporte && cfg.recargaMensualImporte > 0;

    if (importeEfectivoRecarga <= 0) {
      if (isForced) {
        events.push({
          accountId: acc.id,
          accountName: acc.nombre,
          amount: 0,
          cappedByLimit: true,
          reason: `La tarjeta ya alcanza o supera su límite disponible (${cfg.limiteDisponible.toFixed(2)} €).`,
        });
      }
      if (cfg.ultimaRecargaYYYYMM !== currentYM) {
        accountsChanged = true;
        return {
          ...acc,
          tarjetaConfig: {
            ...cfg,
            ultimaRecargaYYYYMM: currentYM,
          },
        };
      }
      return acc;
    }

    const sourceAccount = cfg.cuentaOrigenRecargaId
      ? state.accounts.find(
          (a) => a.id === cfg.cuentaOrigenRecargaId && a.activa && a.id !== acc.id
        )
      : undefined;

    const movementDate = isForced ? referenceISO : dueDateThisMonth;
    const cardLabel = CARD_SUBTYPE_LABELS[cfg.tipoTarjeta] ?? 'Tarjeta';
    const mov: FinancialMovement = sourceAccount
      ? {
          id: `mov-card-topup-${acc.id}-${currentYM}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          tipo: 'transferencia',
          importe: importeEfectivoRecarga,
          fecha: movementDate,
          concepto: `Recarga automática mensual (${cardLabel}): ${acc.nombre}`,
          categoriaId: 'cat-finanzas',
          subcategoria: 'Aportaciones a inversión',
          cuentaId: sourceAccount.id,
          cuentaDestinoId: acc.id,
          miembroId:
            acc.titularId !== 'familiar'
              ? acc.titularId
              : state.actingMemberId,
          visibilidad: acc.visibilidad,
          recurrencia: 'puntual',
          estado: 'confirmado',
        }
      : {
          id: `mov-card-topup-${acc.id}-${currentYM}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          tipo: 'ingreso',
          importe: importeEfectivoRecarga,
          fecha: movementDate,
          concepto: `Recarga automática mensual (${cardLabel}): ${acc.nombre}`,
          categoriaId: 'cat-ingresos',
          subcategoria: 'Otros ingresos',
          cuentaId: acc.id,
          miembroId:
            acc.titularId !== 'familiar'
              ? acc.titularId
              : state.actingMemberId,
          visibilidad: acc.visibilidad,
          recurrencia: 'puntual',
          estado: 'confirmado',
        };

    newMovements.push(mov);
    runningBalanceById.set(acc.id, roundEUR(saldoActual + importeEfectivoRecarga));
    if (sourceAccount) {
      runningBalanceById.set(
        sourceAccount.id,
        roundEUR((runningBalanceById.get(sourceAccount.id) ?? sourceAccount.saldoInicial) - importeEfectivoRecarga)
      );
    }

    appliedCount += 1;
    totalRecharged = roundEUR(totalRecharged + importeEfectivoRecarga);
    accountsChanged = true;
    events.push({
      accountId: acc.id,
      accountName: acc.nombre,
      amount: importeEfectivoRecarga,
      cappedByLimit,
    });

    return {
      ...acc,
      tarjetaConfig: {
        ...cfg,
        ultimaRecargaYYYYMM: currentYM,
      },
    };
  });

  if (!accountsChanged && newMovements.length === 0) {
    return {
      nextState: state,
      appliedCount: 0,
      totalRecharged: 0,
      events,
    };
  }

  return {
    nextState: {
      ...state,
      accounts: updatedAccounts,
      movements:
        newMovements.length > 0
          ? [...newMovements, ...state.movements]
          : state.movements,
    },
    appliedCount,
    totalRecharged,
    events,
  };
}

export const SITUACION_LABORAL_LABELS: Record<SituacionLaboral, string> = {
  parado_con_subsidio: 'Parado con subsidio',
  desempleado: 'Desempleado',
  cuenta_ajena: 'Trabajador por cuenta ajena',
  autonomo: 'Autónomo',
};

export function computeEconomySummary(
  state: EconomyWorkspaceState,
  periodPreset: PeriodPreset,
  customStart?: string,
  customEnd?: string
): EconomySummaryResult {
  const periodRange = resolvePeriodRange(periodPreset, customStart, customEnd);
  const currentMonthRange = resolvePeriodRange('mes_actual');
  const prevMonthRange = resolvePeriodRange('mes_anterior');

  const actingMember = state.members.find((m) => m.id === state.actingMemberId);
  const effectiveScope =
    actingMember?.rol === 'limitado' ? actingMember.id : state.activeMemberScope;

  const visibleAccounts = state.accounts.filter(
    (a) =>
      a.activa &&
      canMemberViewAccount(actingMember, a, state.mode) &&
      (effectiveScope === 'todos' ||
        a.titularId === effectiveScope ||
        (actingMember?.rol !== 'limitado' && a.titularId === 'familiar'))
  );

  const allAccountBalances = computeAccountBalances(visibleAccounts, state.movements);
  const totalEnCuentas = allAccountBalances.reduce((acc, b) => acc + b.saldoActual, 0);

  const visibleAccountIds = new Set(visibleAccounts.map((a) => a.id));
  const totalReservadoFondos = state.savingsGoals
    .filter((g) => visibleAccountIds.has(g.cuentaId))
    .reduce((acc, g) => acc + g.saldoReservado, 0);

  const dineroRealmenteDisponible = totalEnCuentas - totalReservadoFondos;

  const visibleMovements = state.movements.filter((m) => {
    if (!canMemberViewMovement(actingMember, m, state.mode)) return false;
    if (effectiveScope !== 'todos' && m.miembroId !== effectiveScope) {
      return false;
    }
    return true;
  });

  const prorrateoActivo = Boolean(state.prorratearGastos);
  const periodMonths = getCalendarMonthsInPeriod(periodRange);
  const currentMonthKeys = getCalendarMonthsInPeriod(currentMonthRange);
  const prevMonthKeys = getCalendarMonthsInPeriod(prevMonthRange);

  const effectiveAmountByMovementId: Record<string, ProratedPeriodItem> = {};
  const visibleMovementsInPeriod: FinancialMovement[] = [];
  let proratedExpenseCountInPeriod = 0;

  for (const m of visibleMovements) {
    const eff = getMovementEffectiveAmountForPeriod(
      m,
      periodRange,
      periodMonths,
      prorrateoActivo
    );
    if (!eff.included) continue;
    visibleMovementsInPeriod.push(m);
    if (eff.isProrated) proratedExpenseCountInPeriod += 1;
    effectiveAmountByMovementId[m.id] = {
      movement: m,
      effectiveAmount: eff.amount,
      monthlyShare: eff.isProrated ? m.importe / eff.divisor : m.importe,
      monthsCovered: eff.monthsCovered,
      divisor: eff.divisor,
      isProrated: eff.isProrated,
    };
  }
  visibleMovementsInPeriod.sort((a, b) => b.fecha.localeCompare(a.fecha));

  let ingresosPeriodo = 0;
  let gastosPeriodo = 0;
  let gastosPendientesYProximos = 0;

  // IMPORTANTE: Las transferencias entre cuentas propias NO suman ni a ingresos ni a gastos.
  // Las devoluciones minoran el gasto neto de la categoría correspondiente (nunca inflan ingresos).
  // Cuando prorrateoActivo es true, los gastos trimestrales se imputan ÷3 por mes y los anuales ÷12 por mes.
  const spentByCategory = new Map<string, number>();

  for (const m of visibleMovementsInPeriod) {
    if (m.tipo === 'transferencia') continue;
    const effAmount = effectiveAmountByMovementId[m.id]?.effectiveAmount ?? m.importe;

    if (m.tipo === 'ingreso') {
      ingresosPeriodo += effAmount;
    } else if (m.tipo === 'gasto') {
      if (m.estado === 'confirmado') {
        gastosPeriodo += effAmount;
      } else {
        gastosPendientesYProximos += effAmount;
        gastosPeriodo += effAmount;
      }
      spentByCategory.set(
        m.categoriaId,
        (spentByCategory.get(m.categoriaId) ?? 0) + effAmount
      );
    } else if (m.tipo === 'devolucion') {
      gastosPeriodo = Math.max(0, gastosPeriodo - effAmount);
      spentByCategory.set(
        m.categoriaId,
        Math.max(0, (spentByCategory.get(m.categoriaId) ?? 0) - effAmount)
      );
    }
  }

  const ahorroNetoPeriodo = ingresosPeriodo - gastosPeriodo;

  // Comparación Mes Actual vs Mes Anterior + Gasto del mes actual por categoría
  let ingCurr = 0;
  let gasCurr = 0;
  let ingPrev = 0;
  let gasPrev = 0;
  let gasCurrPreHipoteca = 0;
  const currentMonthSpentByCategory = new Map<string, number>();

  for (const m of visibleMovements) {
    if (m.tipo === 'transferencia') continue;

    const currEff = getMovementEffectiveAmountForPeriod(
      m,
      currentMonthRange,
      currentMonthKeys,
      prorrateoActivo
    );
    if (currEff.included) {
      if (m.tipo === 'ingreso') ingCurr += currEff.amount;
      else if (m.tipo === 'gasto') {
        gasCurr += currEff.amount;
        if (!m.esHipoteca) gasCurrPreHipoteca += currEff.amount;
        currentMonthSpentByCategory.set(
          m.categoriaId,
          (currentMonthSpentByCategory.get(m.categoriaId) ?? 0) + currEff.amount
        );
      } else if (m.tipo === 'devolucion') {
        gasCurr = Math.max(0, gasCurr - currEff.amount);
        gasCurrPreHipoteca = Math.max(0, gasCurrPreHipoteca - currEff.amount);
        currentMonthSpentByCategory.set(
          m.categoriaId,
          Math.max(0, (currentMonthSpentByCategory.get(m.categoriaId) ?? 0) - currEff.amount)
        );
      }
    }

    const prevEff = getMovementEffectiveAmountForPeriod(
      m,
      prevMonthRange,
      prevMonthKeys,
      prorrateoActivo
    );
    if (prevEff.included) {
      if (m.tipo === 'ingreso') ingPrev += prevEff.amount;
      else if (m.tipo === 'gasto') gasPrev += prevEff.amount;
      else if (m.tipo === 'devolucion') gasPrev = Math.max(0, gasPrev - prevEff.amount);
    }
  }

  const ahorroCurr = ingCurr - gasCurr;
  const ahorroPrev = ingPrev - gasPrev;
  const deltaAhorro = ahorroCurr - ahorroPrev;
  const deltaGastosPct = gasPrev > 0 ? ((gasCurr - gasPrev) / gasPrev) * 100 : 0;

  const buildBudgetStatuses = (spentMap: Map<string, number>): CategoryBudgetStatus[] =>
    state.categories
      .filter((c) => !c.oculta && c.tipo === 'gasto')
      .map((category) => {
        const gastado = spentMap.get(category.id) ?? 0;
        const presupuestado = category.presupuestoMensual;
        const disponible = Math.max(0, presupuestado - gastado);
        const superado = Math.max(0, gastado - presupuestado);
        const pctUso = presupuestado > 0 ? (gastado / presupuestado) * 100 : gastado > 0 ? 100 : 0;
        return {
          category,
          gastado,
          presupuestado,
          disponible,
          superado,
          pctUso,
        };
      });

  const categoryBudgets = buildBudgetStatuses(spentByCategory);
  const monthlyBudgetGoals = buildBudgetStatuses(currentMonthSpentByCategory);

  const upcomingMovements = visibleMovements
    .filter((m) => m.estado === 'pendiente' || m.estado === 'proximo')
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const ajustesSalarioFuturo: FutureSalaryAdjustment[] = state.members
    .filter(
      (mem) =>
        mem.rol !== 'limitado' &&
        (mem.situacionFutura?.activo || (mem.esNomina && mem.salarioFuturo?.activo))
    )
    .map((mem) => {
      const actual =
        mem.situacionActual === 'desempleado' ? 0 : (mem.salarioNetoMensual ?? 0);
      if (mem.situacionFutura?.activo) {
        const sf = mem.situacionFutura;
        const previsto = sf.situacion === 'desempleado' ? 0 : sf.cuantiaPrevision;
        return {
          id: mem.id,
          nombre: mem.nombre,
          fechaYYYYMM: `${sf.anio}-${String(sf.mes).padStart(2, '0')}`,
          deltaMensual: previsto - actual,
        };
      }
      const sf = mem.salarioFuturo!;
      return {
        id: mem.id,
        nombre: mem.nombre,
        fechaYYYYMM: `${sf.anio}-${String(sf.mes).padStart(2, '0')}`,
        deltaMensual: sf.importePrevisto - actual,
      };
    });

  let parentalAlert: EconomySummaryResult['parentalAlert'];
  const targetLimitedMember =
    actingMember?.rol === 'limitado'
      ? actingMember
      : state.members.find(
          (m) => m.id === state.activeMemberScope && m.rol === 'limitado'
        );

  if (targetLimitedMember && targetLimitedMember.limiteGastoMensual !== undefined) {
    const spentLimited = visibleMovements
      .filter((m) => m.miembroId === targetLimitedMember.id && m.tipo === 'gasto')
      .reduce((acc, m) => {
        const eff = getMovementEffectiveAmountForPeriod(
          m,
          currentMonthRange,
          currentMonthKeys,
          prorrateoActivo
        );
        return eff.included ? acc + eff.amount : acc;
      }, 0);

    parentalAlert = {
      memberName: targetLimitedMember.nombre,
      spentThisMonth: spentLimited,
      limit: targetLimitedMember.limiteGastoMensual,
      exceeded: spentLimited > targetLimitedMember.limiteGastoMensual,
    };
  }

  // Proyección anual de tasa de ahorro basada en el historial de movimientos (hasta los últimos 12 meses registrados)
  const monthlyHistoryTotals = new Map<
    string,
    { ingresos: number; gastosBrutos: number; devoluciones: number }
  >();
  const nonProratedMovements: FinancialMovement[] = [];
  const proratedMovements: FinancialMovement[] = [];

  for (const m of visibleMovements) {
    if (m.tipo === 'transferencia') continue;
    const monthKey = m.fecha.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) continue;
    if (prorrateoActivo && isProratableExpense(m)) {
      proratedMovements.push(m);
    } else {
      nonProratedMovements.push(m);
    }
  }

  for (const m of nonProratedMovements) {
    const monthKey = m.fecha.slice(0, 7);
    const bucket = monthlyHistoryTotals.get(monthKey) ?? {
      ingresos: 0,
      gastosBrutos: 0,
      devoluciones: 0,
    };
    if (m.tipo === 'ingreso') {
      bucket.ingresos += m.importe;
    } else if (m.tipo === 'gasto') {
      bucket.gastosBrutos += m.importe;
    } else if (m.tipo === 'devolucion') {
      bucket.devoluciones += m.importe;
    }
    monthlyHistoryTotals.set(monthKey, bucket);
  }

  if (monthlyHistoryTotals.size === 0 && proratedMovements.length > 0) {
    for (const m of proratedMovements) {
      const monthKey = m.fecha.slice(0, 7);
      if (!monthlyHistoryTotals.has(monthKey)) {
        monthlyHistoryTotals.set(monthKey, {
          ingresos: 0,
          gastosBrutos: 0,
          devoluciones: 0,
        });
      }
    }
  }

  const trailingMonthKeys = Array.from(monthlyHistoryTotals.keys())
    .sort((a, b) => a.localeCompare(b))
    .slice(-12);

  for (const m of proratedMovements) {
    const coverageMonths = getProratedCoverageMonths(m.fecha, m.recurrencia);
    if (!coverageMonths) continue;
    const monthlyShare = m.importe / coverageMonths.length;
    const coverageSet = new Set(coverageMonths);
    for (const ym of trailingMonthKeys) {
      if (coverageSet.has(ym)) {
        const bucket = monthlyHistoryTotals.get(ym)!;
        bucket.gastosBrutos += monthlyShare;
      }
    }
  }

  let histIngresos = 0;
  let histGastosBrutos = 0;
  let histDevoluciones = 0;

  for (const key of trailingMonthKeys) {
    const bucket = monthlyHistoryTotals.get(key)!;
    histIngresos += bucket.ingresos;
    histGastosBrutos += bucket.gastosBrutos;
    histDevoluciones += bucket.devoluciones;
  }

  const histGastosNetos = Math.max(0, histGastosBrutos - histDevoluciones);
  const mesesAnalizados = trailingMonthKeys.length;
  const hasData = mesesAnalizados > 0 && (histIngresos > 0 || histGastosNetos > 0);
  const hasIncome = histIngresos > 0;

  const ingresosMensualesMedios = mesesAnalizados > 0 ? histIngresos / mesesAnalizados : 0;
  const gastosMensualesMedios = mesesAnalizados > 0 ? histGastosNetos / mesesAnalizados : 0;
  const ahorroMensualMedio = ingresosMensualesMedios - gastosMensualesMedios;

  const ingresosAnualesProyectados = ingresosMensualesMedios * 12;
  const gastosAnualesProyectados = gastosMensualesMedios * 12;
  const ahorroAnualProyectado = ahorroMensualMedio * 12;

  const tasaAhorroAnualPct = hasIncome
    ? (ahorroAnualProyectado / ingresosAnualesProyectados) * 100
    : 0;

  let nivelSalud: SavingsHealthLevel = 'sin_datos';
  if (hasData) {
    if (!hasIncome || tasaAhorroAnualPct < 0) {
      nivelSalud = 'deficit';
    } else if (tasaAhorroAnualPct >= 20) {
      nivelSalud = 'saludable';
    } else if (tasaAhorroAnualPct >= 10) {
      nivelSalud = 'moderada';
    } else {
      nivelSalud = 'ajustada';
    }
  }

  const projectedAnnualSavings: ProjectedAnnualSavings = {
    tasaAhorroAnualPct,
    ahorroAnualProyectado,
    ingresosAnualesProyectados,
    gastosAnualesProyectados,
    ahorroMensualMedio,
    ingresosMensualesMedios,
    gastosMensualesMedios,
    mesesAnalizados,
    primerMesYYYYMM: trailingMonthKeys[0] ?? null,
    ultimoMesYYYYMM: trailingMonthKeys[trailingMonthKeys.length - 1] ?? null,
    hasData,
    hasIncome,
    nivelSalud,
  };

  return {
    periodRange,
    prorrateoActivo,
    proratedExpenseCountInPeriod,
    effectiveAmountByMovementId,
    ingresosPeriodo,
    gastosPeriodo,
    ahorroNetoPeriodo,
    gastosPendientesYProximos,
    totalEnCuentas,
    totalReservadoFondos,
    dineroRealmenteDisponible,
    comparacionMesAnterior: {
      ingresosAnterior: ingPrev,
      gastosAnterior: gasPrev,
      ahorroAnterior: ahorroPrev,
      deltaAhorro,
      deltaGastosPct,
    },
    projectedAnnualSavings,
    accountBalances: allAccountBalances,
    categoryBudgets,
    monthlyBudgetGoals,
    upcomingMovements,
    visibleMovementsInPeriod,
    capacidadAhorroPreHipotecaMensual: Math.max(0, ingCurr - gasCurrPreHipoteca),
    ajustesSalarioFuturo,
    parentalAlert,
  };
}
