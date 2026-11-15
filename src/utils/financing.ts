export interface FinancedExpenseCalculation {
  cuotaMensual: number;
  totalPagado: number;
  totalIntereses: number;
}

export function computeFinancedInstallment(
  importeTotal: number,
  mensualidades: number,
  tinAnualPct = 0
): FinancedExpenseCalculation {
  const total = Math.max(0, Number(importeTotal) || 0);
  const meses = Math.max(1, Math.floor(Number(mensualidades) || 1));
  const tin = Math.max(0, Number(tinAnualPct) || 0);

  if (total <= 0) {
    return { cuotaMensual: 0, totalPagado: 0, totalIntereses: 0 };
  }

  let cuota = 0;
  if (tin === 0) {
    cuota = total / meses;
  } else {
    const r = tin / 100 / 12;
    const factor = Math.pow(1 + r, meses);
    cuota = (total * (r * factor)) / (factor - 1);
  }

  const cuotaMensual = Math.round(cuota * 100) / 100;
  const totalPagado = Math.round(cuotaMensual * meses * 100) / 100;
  const totalIntereses = Math.max(0, Math.round((totalPagado - total) * 100) / 100);

  return { cuotaMensual, totalPagado, totalIntereses };
}
