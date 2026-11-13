const euroFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const euroIntFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const pctFormatter = new Intl.NumberFormat('es-ES', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEUR(value: number, decimals = true): string {
  if (!Number.isFinite(value)) return '0,00 €';
  return decimals ? euroFormatter.format(value) : euroIntFormatter.format(Math.round(value));
}

export function formatPct(decimalOrPercent: number, isAlreadyPercent = true): string {
  const val = isAlreadyPercent ? decimalOrPercent / 100 : decimalOrPercent;
  if (!Number.isFinite(val)) return '0,00 %';
  return pctFormatter.format(val);
}

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const MESES_CORTOS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export function formatYYYYMM(yyyyMm: string, short = false): string {
  const [yStr, mStr] = yyyyMm.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m || m < 1 || m > 12) return yyyyMm;
  return `${short ? MESES_CORTOS[m - 1] : MESES_ES[m - 1]} ${y}`;
}

export function addMonthsYYYYMM(yyyyMm: string, monthsToAdd: number): string {
  const [yStr, mStr] = yyyyMm.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const totalMonths = y * 12 + (m - 1) + monthsToAdd;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, '0')}`;
}

export function diffMonthsYYYYMM(startYYYYMM: string, endYYYYMM: string): number {
  const [sy, sm] = startYYYYMM.split('-').map(Number);
  const [ey, em] = endYYYYMM.split('-').map(Number);
  return (ey - sy) * 12 + (em - sm);
}

export function toMonthlyEquivalent(importe: number, frecuencia: string): number {
  switch (frecuencia) {
    case 'mensual':
      return importe;
    case 'trimestral':
      return importe / 3;
    case 'anual':
      return importe / 12;
    case 'puntual':
      return importe / 12; // Prorrateo anualizado para capacidad de ahorro media
    default:
      return importe;
  }
}

export function toAnnualAmount(importe: number, frecuencia: string): number {
  switch (frecuencia) {
    case 'mensual':
      return importe * 12;
    case 'trimestral':
      return importe * 4;
    case 'anual':
      return importe;
    case 'puntual':
      return importe;
    default:
      return importe;
  }
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
