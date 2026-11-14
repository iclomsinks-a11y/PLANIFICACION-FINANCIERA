import {
  AccountType,
  CategoryConfig,
  EconomyWorkspaceState,
  FinancialAccount,
  FinancialMovement,
  HouseholdMember,
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
  movement: FinancialMovement
): boolean {
  if (!actingMember || actingMember.rol === 'admin') return true;
  if (movement.miembroId === actingMember.id) return true;
  if (actingMember.rol === 'adulto') return movement.visibilidad === 'compartida';
  // Rol limitado (menor): solo ve sus propios movimientos
  return false;
}

export function canMemberViewAccount(
  actingMember: HouseholdMember | undefined,
  account: FinancialAccount
): boolean {
  if (!actingMember || actingMember.rol === 'admin') return true;
  if (account.titularId === actingMember.id) return true;
  if (actingMember.rol === 'adulto') {
    return account.titularId === 'familiar' || account.visibilidad === 'compartida';
  }
  return false;
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

export interface EconomySummaryResult {
  periodRange: PeriodRange;
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
  accountBalances: ComputedAccountBalance[];
  categoryBudgets: CategoryBudgetStatus[];
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

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  corriente: 'Cuenta corriente',
  ahorro: 'Cuenta de ahorro',
  remunerada: 'Cuenta remunerada',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  personalizada: 'Personalizada',
};

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

  const visibleAccounts = state.accounts.filter(
    (a) =>
      a.activa &&
      canMemberViewAccount(actingMember, a) &&
      (state.activeMemberScope === 'todos' ||
        a.titularId === state.activeMemberScope ||
        a.titularId === 'familiar')
  );

  const allAccountBalances = computeAccountBalances(visibleAccounts, state.movements);
  const totalEnCuentas = allAccountBalances.reduce((acc, b) => acc + b.saldoActual, 0);

  const visibleAccountIds = new Set(visibleAccounts.map((a) => a.id));
  const totalReservadoFondos = state.savingsGoals
    .filter((g) => visibleAccountIds.has(g.cuentaId))
    .reduce((acc, g) => acc + g.saldoReservado, 0);

  const dineroRealmenteDisponible = totalEnCuentas - totalReservadoFondos;

  const visibleMovements = state.movements.filter((m) => {
    if (!canMemberViewMovement(actingMember, m)) return false;
    if (state.activeMemberScope !== 'todos' && m.miembroId !== state.activeMemberScope) {
      return false;
    }
    return true;
  });

  const inRange = (fecha: string, r: PeriodRange) => fecha >= r.start && fecha <= r.end;

  const visibleMovementsInPeriod = visibleMovements
    .filter((m) => inRange(m.fecha, periodRange))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  let ingresosPeriodo = 0;
  let gastosPeriodo = 0;
  let gastosPendientesYProximos = 0;

  // IMPORTANTE: Las transferencias entre cuentas propias NO suman ni a ingresos ni a gastos.
  // Las devoluciones minoran el gasto neto de la categoría correspondiente (nunca inflan ingresos).
  const spentByCategory = new Map<string, number>();

  for (const m of visibleMovementsInPeriod) {
    if (m.tipo === 'transferencia') continue;

    if (m.tipo === 'ingreso') {
      ingresosPeriodo += m.importe;
    } else if (m.tipo === 'gasto') {
      if (m.estado === 'confirmado') {
        gastosPeriodo += m.importe;
      } else {
        gastosPendientesYProximos += m.importe;
        gastosPeriodo += m.importe;
      }
      spentByCategory.set(
        m.categoriaId,
        (spentByCategory.get(m.categoriaId) ?? 0) + m.importe
      );
    } else if (m.tipo === 'devolucion') {
      gastosPeriodo = Math.max(0, gastosPeriodo - m.importe);
      spentByCategory.set(
        m.categoriaId,
        Math.max(0, (spentByCategory.get(m.categoriaId) ?? 0) - m.importe)
      );
    }
  }

  const ahorroNetoPeriodo = ingresosPeriodo - gastosPeriodo;

  // Comparación Mes Actual vs Mes Anterior
  let ingCurr = 0;
  let gasCurr = 0;
  let ingPrev = 0;
  let gasPrev = 0;
  let gasCurrPreHipoteca = 0;

  for (const m of visibleMovements) {
    if (m.tipo === 'transferencia') continue;
    if (inRange(m.fecha, currentMonthRange)) {
      if (m.tipo === 'ingreso') ingCurr += m.importe;
      else if (m.tipo === 'gasto') {
        gasCurr += m.importe;
        if (!m.esHipoteca) gasCurrPreHipoteca += m.importe;
      } else if (m.tipo === 'devolucion') {
        gasCurr = Math.max(0, gasCurr - m.importe);
        gasCurrPreHipoteca = Math.max(0, gasCurrPreHipoteca - m.importe);
      }
    } else if (inRange(m.fecha, prevMonthRange)) {
      if (m.tipo === 'ingreso') ingPrev += m.importe;
      else if (m.tipo === 'gasto') gasPrev += m.importe;
      else if (m.tipo === 'devolucion') gasPrev = Math.max(0, gasPrev - m.importe);
    }
  }

  const ahorroCurr = ingCurr - gasCurr;
  const ahorroPrev = ingPrev - gasPrev;
  const deltaAhorro = ahorroCurr - ahorroPrev;
  const deltaGastosPct = gasPrev > 0 ? ((gasCurr - gasPrev) / gasPrev) * 100 : 0;

  const categoryBudgets: CategoryBudgetStatus[] = state.categories
    .filter((c) => !c.oculta && c.tipo === 'gasto')
    .map((category) => {
      const gastado = spentByCategory.get(category.id) ?? 0;
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
      .filter(
        (m) =>
          m.miembroId === targetLimitedMember.id &&
          m.tipo === 'gasto' &&
          inRange(m.fecha, currentMonthRange)
      )
      .reduce((acc, m) => acc + m.importe, 0);

    parentalAlert = {
      memberName: targetLimitedMember.nombre,
      spentThisMonth: spentLimited,
      limit: targetLimitedMember.limiteGastoMensual,
      exceeded: spentLimited > targetLimitedMember.limiteGastoMensual,
    };
  }

  return {
    periodRange,
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
    accountBalances: allAccountBalances,
    categoryBudgets,
    upcomingMovements,
    visibleMovementsInPeriod,
    capacidadAhorroPreHipotecaMensual: Math.max(0, ingCurr - gasCurrPreHipoteca),
    ajustesSalarioFuturo,
    parentalAlert,
  };
}
