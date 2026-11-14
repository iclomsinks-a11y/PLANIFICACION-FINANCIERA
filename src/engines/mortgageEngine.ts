import {
  MortgageAnnualSummary,
  MortgageLedgerRow,
  MortgageSimulationInput,
  MortgageSimulationResult,
} from '../types/finance';
import { addMonthsYYYYMM, diffMonthsYYYYMM } from '../utils/formatters';

function calcularCuotaFrancesa(capital: number, tinAnualPct: number, meses: number): number {
  if (capital <= 0 || meses <= 0) return 0;
  const r = tinAnualPct / 100 / 12;
  if (r === 0) return capital / meses;
  const factor = Math.pow(1 + r, meses);
  return (capital * (r * factor)) / (factor - 1);
}

function calcularTaeEfectiva(
  capital: number,
  tinAnualPct: number,
  meses: number,
  segurosAnuales: number
): number {
  if (capital <= 0 || meses <= 0) return tinAnualPct;
  const cuotaBase = calcularCuotaFrancesa(capital, tinAnualPct, meses);
  const cuotaConSeguros = cuotaBase + segurosAnuales / 12;
  // Resolver r mensual por bisección tal que VA(cuotaConSeguros, r, meses) = capital
  let low = 0;
  let high = 0.05; // 5% mensual máximo
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const pv =
      mid === 0
        ? cuotaConSeguros * meses
        : cuotaConSeguros * ((1 - Math.pow(1 + mid, -meses)) / mid);
    if (pv > capital) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const rMensual = (low + high) / 2;
  return (Math.pow(1 + rMensual, 12) - 1) * 100;
}

function getTopeFiscalAnual(modalidad: MortgageSimulationInput['modalidadFiscal']): number {
  if (modalidad === 'conjunta_9040') return 9040;
  if (modalidad === 'individual_18080') return 18080;
  return 0;
}

export function simulateMortgageAndTreasury(
  input: MortgageSimulationInput
): MortgageSimulationResult {
  const rows: MortgageLedgerRow[] = [];

  const totalMonthsOriginal = Math.max(
    1,
    diffMonthsYYYYMM(input.fechaInicio, input.fechaVencimiento) + 1
  );

  // 1. Baseline sin amortizaciones extraordinarias (para medir ahorro real en intereses y meses)
  let baseCap = input.capitalPendienteInicial;
  let baseTotalInterest = 0;
  let baseCuotaOrdinaria = 0;
  const rMensualHipoteca = input.tinPostCarencia / 100 / 12;

  for (let m = 0; m < totalMonthsOriginal && baseCap > 0.01; m++) {
    const currentYYYYMM = addMonthsYYYYMM(input.fechaInicio, m);
    const enCarencia = input.enCarenciaCBP && currentYYYYMM <= input.fechaFinCarenciaCBP;
    const remaining = totalMonthsOriginal - m;

    if (enCarencia) {
      const interes = Math.min(baseCap * rMensualHipoteca || input.cuotaInteresesCBP, input.cuotaInteresesCBP);
      baseTotalInterest += interes;
    } else {
      if (baseCuotaOrdinaria === 0) {
        baseCuotaOrdinaria = calcularCuotaFrancesa(baseCap, input.tinPostCarencia, remaining);
      }
      const interes = baseCap * rMensualHipoteca;
      const principal = Math.min(baseCap, Math.max(0, baseCuotaOrdinaria - interes));
      baseCap -= principal;
      baseTotalInterest += interes;
    }
  }

  // 2. Simulación Determinista Real Mes a Mes con CBP + Cuenta Remunerada + Inyección 1 de Enero + Reinversión AEAT
  let capital = input.capitalPendienteInicial;
  let saldoCuenta = input.saldoInicialEfectivo;
  let plazoRestante = totalMonthsOriginal;

  let cuotaOrdinariaActual = 0;
  let estrategiaActual: 'reducir_cuota' | 'reducir_plazo' =
    input.estrategia === 'reducir_plazo' ? 'reducir_plazo' : 'reducir_cuota';
  let primerMesCambioHibrido: string | undefined;

  const topeFiscal = getTopeFiscalAnual(input.modalidadFiscal);
  const taeRemuneradaMensual = Math.pow(1 + input.taeCuentaRemunerada / 100, 1 / 12) - 1;
  const comisionPct = Math.max(0, input.comisionAmortizacionAnticipadaPct) / 100;

  let totalInteresesBancarios = 0;
  let totalPrincipalPagado = 0;
  let totalDevolucionesAEAT = 0;
  let totalInteresesCuentaBrutos = 0;
  let cuotaOrdinariaInicialPostCBP = 0;

  // Acumuladores por año fiscal
  let currentYear = Number(input.fechaInicio.split('-')[0]);
  let baseFiscalAnioActual = 0;
  let devolucionPendienteAnioAnterior = 0;

  // Para calcular la inyección óptima el 1 de enero, necesitamos estimar los pagos ordinarios del año en curso
  const estimateOrdinaryPaymentsForCalendarYear = (
    year: number,
    startMonthInYear: number,
    currentCapital: number,
    currentRemainingMonths: number,
    currentCuota: number
  ): number => {
    let sum = 0;
    let simCap = currentCapital;
    let simCuota = currentCuota;
    for (let month = startMonthInYear; month <= 12; month++) {
      const yyyymm = `${year}-${String(month).padStart(2, '0')}`;
      const monthsElapsedFromStart = diffMonthsYYYYMM(input.fechaInicio, yyyymm);
      const rem = Math.max(1, currentRemainingMonths - (month - startMonthInYear));
      if (monthsElapsedFromStart >= totalMonthsOriginal || simCap <= 0.01) break;

      const isCarencia = input.enCarenciaCBP && yyyymm <= input.fechaFinCarenciaCBP;
      if (isCarencia) {
        sum += input.cuotaInteresesCBP;
      } else {
        if (simCuota === 0) {
          simCuota = calcularCuotaFrancesa(simCap, input.tinPostCarencia, rem);
        }
        const interes = simCap * rMensualHipoteca;
        const pago = Math.min(simCap + interes, simCuota);
        sum += pago;
        simCap = Math.max(0, simCap - Math.max(0, pago - interes));
      }
    }
    return sum;
  };

  const getAhorroSinHipotecaEnMes = (yyyymm: string): number => {
    const ajustes = input.ajustesSalarioFuturo ?? [];
    let delta = 0;
    for (const adj of ajustes) {
      if (yyyymm >= adj.fechaYYYYMM) {
        delta += adj.deltaMensual;
      }
    }
    return input.ahorroNetoMensualSinHipoteca + delta;
  };

  const maxSafetyMonths = Math.max(totalMonthsOriginal + 12, 480);

  for (let m = 0; m < maxSafetyMonths && capital > 0.01 && plazoRestante > 0; m++) {
    const fechaYYYYMM = addMonthsYYYYMM(input.fechaInicio, m);
    const [anio, mes] = fechaYYYYMM.split('-').map(Number);

    // Cambio de año natural: liquidar base fiscal del año cerrado para devolución en junio
    if (anio !== currentYear) {
      if (topeFiscal > 0) {
        const baseComputableCerrada = Math.min(
          topeFiscal,
          baseFiscalAnioActual + input.segurosVinculadosAnuales
        );
        devolucionPendienteAnioAnterior = Math.min(
          input.cuotaIntegraDisponibleAnual,
          baseComputableCerrada * 0.15
        );
      } else {
        devolucionPendienteAnioAnterior = 0;
      }
      currentYear = anio;
      baseFiscalAnioActual = 0;
    }

    const enCarencia = input.enCarenciaCBP && fechaYYYYMM <= input.fechaFinCarenciaCBP;
    const capitalInicialMes = capital;
    const saldoCuentaInicial = saldoCuenta;

    // 1. Interés mensual de la cuenta remunerada (bruto y neto tras 19% retención IRPF)
    const interesCuentaBruto = Math.max(0, saldoCuenta * taeRemuneradaMensual);
    const retencionCuenta = interesCuentaBruto * 0.19;
    const interesCuentaNeto = interesCuentaBruto - retencionCuenta;
    saldoCuenta += interesCuentaNeto;
    totalInteresesCuentaBrutos += interesCuentaBruto;

    // 2. Cobro de devolución AEAT en Junio (mes === 6)
    let devolucionAEATCobrada = 0;
    if (mes === 6 && devolucionPendienteAnioAnterior > 0) {
      devolucionAEATCobrada = devolucionPendienteAnioAnterior;
      saldoCuenta += devolucionAEATCobrada;
      totalDevolucionesAEAT += devolucionAEATCobrada;
      devolucionPendienteAnioAnterior = 0;
    }

    // 3. Inyección Extraordinaria Óptima el 1 de Enero (mes === 1)
    let amortizacionExtraEnero = 0;
    if (mes === 1 && topeFiscal > 0 && capital > 0.01) {
      const cuotasPrevistasAnio = estimateOrdinaryPaymentsForCalendarYear(
        anio,
        1,
        capital,
        plazoRestante,
        enCarencia ? 0 : cuotaOrdinariaActual
      );
      const aeatEstimadaParaReinvertir = input.reinvertirDevolucionAEAT
        ? devolucionPendienteAnioAnterior
        : 0;
      const objetivoAnualSinExtra =
        cuotasPrevistasAnio + input.segurosVinculadosAnuales + aeatEstimadaParaReinvertir;
      const necesidadParaTope = Math.max(0, topeFiscal - objetivoAnualSinExtra);

      // Nunca perforar el colchón mínimo de seguridad
      const liquidezDisponibleHoy = Math.max(0, saldoCuenta - input.colchonSeguridad);
      // Considerar también que durante el año el flujo neto (ahorroNetoSinHipoteca - cuota) alimenta o consume cuenta
      let ahorroAnualEstimado = 0;
      for (let mCal = 1; mCal <= 12; mCal++) {
        ahorroAnualEstimado += getAhorroSinHipotecaEnMes(
          `${anio}-${String(mCal).padStart(2, '0')}`
        );
      }
      const flujosNetosAnioEstimados = ahorroAnualEstimado - cuotasPrevistasAnio;
      const liquidezSegura =
        flujosNetosAnioEstimados >= 0
          ? liquidezDisponibleHoy
          : Math.max(0, liquidezDisponibleHoy + flujosNetosAnioEstimados);

      const maxSinComision = liquidezSegura / (1 + comisionPct);
      amortizacionExtraEnero = Math.min(capital, necesidadParaTope, maxSinComision);
      amortizacionExtraEnero = Math.max(0, Math.round(amortizacionExtraEnero * 100) / 100);

      if (amortizacionExtraEnero > 0) {
        const costeComision = amortizacionExtraEnero * comisionPct;
        capital = Math.max(0, capital - amortizacionExtraEnero);
        saldoCuenta -= amortizacionExtraEnero + costeComision;
        totalPrincipalPagado += amortizacionExtraEnero;
        baseFiscalAnioActual += amortizacionExtraEnero;

        // Recalcular cuota si estrategia es reducir_cuota o hibrida en fase reducir_cuota
        if (!enCarencia && capital > 0.01) {
          if (estrategiaActual === 'reducir_cuota') {
            cuotaOrdinariaActual = calcularCuotaFrancesa(
              capital,
              input.tinPostCarencia,
              plazoRestante
            );
            if (
              input.estrategia === 'hibrida' &&
              cuotaOrdinariaActual > 0 &&
              cuotaOrdinariaActual < input.umbralCuotaHibrida
            ) {
              estrategiaActual = 'reducir_plazo';
              if (!primerMesCambioHibrido) primerMesCambioHibrido = fechaYYYYMM;
            }
          }
        }
      }
    }

    // 4. Reinversión automática de Devolución AEAT en Junio (mes === 6)
    let amortizacionExtraAEAT = 0;
    if (
      mes === 6 &&
      input.reinvertirDevolucionAEAT &&
      devolucionAEATCobrada > 0 &&
      capital > 0.01
    ) {
      const topeRestanteAnio =
        topeFiscal > 0
          ? Math.max(0, topeFiscal - (baseFiscalAnioActual + input.segurosVinculadosAnuales))
          : devolucionAEATCobrada;
      const liquidezDisponibleHoy = Math.max(0, saldoCuenta - input.colchonSeguridad);
      const maxSinComision = liquidezDisponibleHoy / (1 + comisionPct);

      amortizacionExtraAEAT = Math.min(
        capital,
        devolucionAEATCobrada,
        topeRestanteAnio > 0 ? topeRestanteAnio : devolucionAEATCobrada,
        maxSinComision
      );
      amortizacionExtraAEAT = Math.max(0, Math.round(amortizacionExtraAEAT * 100) / 100);

      if (amortizacionExtraAEAT > 0) {
        const costeComision = amortizacionExtraAEAT * comisionPct;
        capital = Math.max(0, capital - amortizacionExtraAEAT);
        saldoCuenta -= amortizacionExtraAEAT + costeComision;
        totalPrincipalPagado += amortizacionExtraAEAT;
        baseFiscalAnioActual += amortizacionExtraAEAT;

        if (!enCarencia && capital > 0.01 && estrategiaActual === 'reducir_cuota') {
          cuotaOrdinariaActual = calcularCuotaFrancesa(
            capital,
            input.tinPostCarencia,
            plazoRestante
          );
          if (
            input.estrategia === 'hibrida' &&
            cuotaOrdinariaActual > 0 &&
            cuotaOrdinariaActual < input.umbralCuotaHibrida
          ) {
            estrategiaActual = 'reducir_plazo';
            if (!primerMesCambioHibrido) primerMesCambioHibrido = fechaYYYYMM;
          }
        }
      }
    }

    // 5. Pago de la Cuota Ordinaria del Mes (CBP Carencia vs Francesa Post-Carencia)
    let interesBancario = 0;
    let principalOrdinario = 0;
    let cuotaOrdinaria = 0;

    if (capital > 0.01) {
      if (enCarencia) {
        // Carencia CBP: solo se abonan intereses pactados; el principal ordinario es 0
        interesBancario = input.cuotaInteresesCBP;
        cuotaOrdinaria = interesBancario;
        principalOrdinario = 0;
      } else {
        if (cuotaOrdinariaActual === 0) {
          cuotaOrdinariaActual = calcularCuotaFrancesa(
            capital,
            input.tinPostCarencia,
            plazoRestante
          );
          if (cuotaOrdinariaInicialPostCBP === 0) {
            cuotaOrdinariaInicialPostCBP = cuotaOrdinariaActual;
          }
          if (
            input.estrategia === 'hibrida' &&
            cuotaOrdinariaActual < input.umbralCuotaHibrida
          ) {
            estrategiaActual = 'reducir_plazo';
            if (!primerMesCambioHibrido) primerMesCambioHibrido = fechaYYYYMM;
          }
        }

        interesBancario = capital * rMensualHipoteca;
        const pagoNecesarioCancelacion = capital + interesBancario;
        if (cuotaOrdinariaActual >= pagoNecesarioCancelacion) {
          cuotaOrdinaria = pagoNecesarioCancelacion;
          principalOrdinario = capital;
        } else {
          cuotaOrdinaria = cuotaOrdinariaActual;
          principalOrdinario = Math.max(0, cuotaOrdinaria - interesBancario);
        }
        capital = Math.max(0, capital - principalOrdinario);
      }

      totalInteresesBancarios += interesBancario;
      totalPrincipalPagado += principalOrdinario;
      baseFiscalAnioActual += cuotaOrdinaria;
    }

    // 6. Flujo de ahorro mensual neto en Cuenta Remunerada
    // ahorroNetoMensualSinHipoteca + ajustes futuros de nómina aplicables desde su mes/año
    const flujoAhorroMes = getAhorroSinHipotecaEnMes(fechaYYYYMM) - cuotaOrdinaria;
    saldoCuenta += flujoAhorroMes;

    // Actualizar plazo restante real (si está en reducir_plazo o en carencia)
    if (capital <= 0.01) {
      plazoRestante = 0;
    } else {
      plazoRestante = Math.max(0, plazoRestante - 1);
    }

    const fase: MortgageLedgerRow['fase'] = enCarencia
      ? 'Carencia CBP'
      : estrategiaActual === 'reducir_plazo'
        ? 'Ordinaria (Reducir Plazo)'
        : 'Ordinaria (Reducir Cuota)';

    rows.push({
      indiceMes: m + 1,
      fechaYYYYMM,
      anio,
      mes,
      fase,
      capitalInicialMes,
      cuotaOrdinaria,
      interesBancario,
      principalOrdinario,
      amortizacionExtraEnero,
      amortizacionExtraAEAT,
      amortizacionExtraTotal: amortizacionExtraEnero + amortizacionExtraAEAT,
      capitalFinalMes: capital,
      saldoCuentaInicial,
      interesCuentaNeto,
      interesCuentaBruto,
      flujoAhorroMes,
      saldoCuentaFinal: saldoCuenta,
      baseFiscalAcumuladaAnio: baseFiscalAnioActual,
      devolucionAEATCobrada,
      plazoRestanteMeses: plazoRestante,
    });
  }

  // Agrupación Anual
  const annualMap = new Map<number, MortgageAnnualSummary>();
  for (const row of rows) {
    const existing = annualMap.get(row.anio);
    const devolucionGenerada =
      topeFiscal > 0
        ? Math.min(
            input.cuotaIntegraDisponibleAnual,
            Math.min(topeFiscal, row.baseFiscalAcumuladaAnio + input.segurosVinculadosAnuales) *
              0.15
          )
        : 0;
    if (!existing) {
      annualMap.set(row.anio, {
        anio: row.anio,
        cuotasPagadas: row.cuotaOrdinaria,
        interesesPagados: row.interesBancario,
        principalOrdinario: row.principalOrdinario,
        amortizacionExtra: row.amortizacionExtraTotal,
        totalPrincipalAmortizado: row.principalOrdinario + row.amortizacionExtraTotal,
        capitalPendienteFinAnio: row.capitalFinalMes,
        saldoCuentaFinAnio: row.saldoCuentaFinal,
        interesesCuentaBrutos: row.interesCuentaBruto,
        baseFiscalAnio: row.baseFiscalAcumuladaAnio,
        devolucionAEATGenerada: devolucionGenerada,
      });
    } else {
      existing.cuotasPagadas += row.cuotaOrdinaria;
      existing.interesesPagados += row.interesBancario;
      existing.principalOrdinario += row.principalOrdinario;
      existing.amortizacionExtra += row.amortizacionExtraTotal;
      existing.totalPrincipalAmortizado += row.principalOrdinario + row.amortizacionExtraTotal;
      existing.capitalPendienteFinAnio = row.capitalFinalMes;
      existing.saldoCuentaFinAnio = row.saldoCuentaFinal;
      existing.interesesCuentaBrutos += row.interesCuentaBruto;
      existing.baseFiscalAnio = row.baseFiscalAcumuladaAnio;
      existing.devolucionAEATGenerada = devolucionGenerada;
    }
  }

  const lastRow = rows[rows.length - 1];
  const fechaCancelacionExacta = lastRow ? lastRow.fechaYYYYMM : input.fechaInicio;
  const mesesTotales = rows.length;
  const mesesAhorradosVsVencimiento = Math.max(0, totalMonthsOriginal - mesesTotales);
  const saldoFinalCuentaRemunerada = lastRow ? lastRow.saldoCuentaFinal : input.saldoInicialEfectivo;

  if (cuotaOrdinariaInicialPostCBP === 0) {
    cuotaOrdinariaInicialPostCBP = calcularCuotaFrancesa(
      input.capitalPendienteInicial,
      input.tinPostCarencia,
      totalMonthsOriginal
    );
  }

  const taeRealEstimada = calcularTaeEfectiva(
    input.capitalPendienteInicial,
    input.tinPostCarencia,
    totalMonthsOriginal,
    input.segurosVinculadosAnuales
  );

  return {
    rows,
    annualSummaries: Array.from(annualMap.values()),
    fechaCancelacionExacta,
    mesesTotales,
    mesesAhorradosVsVencimiento,
    cuotaOrdinariaInicialPostCBP,
    taeRealEstimada,
    totalInteresesBancarios,
    totalInteresesBaselineSinExtra: baseTotalInterest,
    ahorroInteresesBancarios: Math.max(0, baseTotalInterest - totalInteresesBancarios),
    totalPrincipalPagado,
    totalDevolucionesAEAT,
    totalInteresesCuentaBrutos,
    saldoFinalCuentaRemunerada,
    patrimonioNetoFinal: saldoFinalCuentaRemunerada - (lastRow ? lastRow.capitalFinalMes : 0),
    primerMesCambioHibrido,
  };
}
