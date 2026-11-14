import {
  ComunidadAutonoma,
  ContribuyenteIrpfInput,
  DeclaracionBreakdown,
  DescendienteInput,
  IrpfComparisonResult,
  IrpfSimulationInput,
} from '../types/finance';

interface TaxBracket {
  upTo: number;
  rate: number;
}

const ESCALA_ESTATAL: TaxBracket[] = [
  { upTo: 12450, rate: 0.095 },
  { upTo: 20200, rate: 0.12 },
  { upTo: 35200, rate: 0.15 },
  { upTo: 60000, rate: 0.185 },
  { upTo: 300000, rate: 0.225 },
  { upTo: Infinity, rate: 0.245 },
];

const ESCALAS_AUTONOMICAS: Record<ComunidadAutonoma, TaxBracket[]> = {
  andalucia: [
    { upTo: 13000, rate: 0.095 },
    { upTo: 21100, rate: 0.12 },
    { upTo: 35200, rate: 0.15 },
    { upTo: 60000, rate: 0.185 },
    { upTo: Infinity, rate: 0.225 },
  ],
  madrid: [
    { upTo: 13362.22, rate: 0.085 },
    { upTo: 19004.63, rate: 0.107 },
    { upTo: 35425.68, rate: 0.128 },
    { upTo: 57320.4, rate: 0.174 },
    { upTo: Infinity, rate: 0.205 },
  ],
  cataluna: [
    { upTo: 12450, rate: 0.105 },
    { upTo: 17707.2, rate: 0.12 },
    { upTo: 21000, rate: 0.14 },
    { upTo: 33007.2, rate: 0.15 },
    { upTo: 53407.2, rate: 0.188 },
    { upTo: 90000, rate: 0.215 },
    { upTo: 120000, rate: 0.235 },
    { upTo: 175000, rate: 0.245 },
    { upTo: Infinity, rate: 0.255 },
  ],
  valencia: [
    { upTo: 12000, rate: 0.09 },
    { upTo: 22000, rate: 0.12 },
    { upTo: 32000, rate: 0.15 },
    { upTo: 42000, rate: 0.175 },
    { upTo: 52000, rate: 0.2 },
    { upTo: 65000, rate: 0.225 },
    { upTo: 80000, rate: 0.24 },
    { upTo: 120000, rate: 0.245 },
    { upTo: 175000, rate: 0.255 },
    { upTo: 300000, rate: 0.275 },
    { upTo: Infinity, rate: 0.295 },
  ],
  galicia: [
    { upTo: 12985.35, rate: 0.09 },
    { upTo: 21068.6, rate: 0.1165 },
    { upTo: 36700.1, rate: 0.149 },
    { upTo: 62508, rate: 0.184 },
    { upTo: Infinity, rate: 0.225 },
  ],
  castilla_leon: [
    { upTo: 12450, rate: 0.09 },
    { upTo: 20200, rate: 0.12 },
    { upTo: 35200, rate: 0.14 },
    { upTo: 53407.2, rate: 0.185 },
    { upTo: Infinity, rate: 0.215 },
  ],
  canarias: [
    { upTo: 12450, rate: 0.09 },
    { upTo: 17707.2, rate: 0.115 },
    { upTo: 33007.2, rate: 0.14 },
    { upTo: 53407.2, rate: 0.185 },
    { upTo: 90000, rate: 0.235 },
    { upTo: 120000, rate: 0.25 },
    { upTo: Infinity, rate: 0.26 },
  ],
  otra_comun: ESCALA_ESTATAL,
};

// Base del Ahorro combinada (estatal + autonómica: 19% -> 30%)
const ESCALA_AHORRO: TaxBracket[] = [
  { upTo: 6000, rate: 0.19 },
  { upTo: 50000, rate: 0.21 },
  { upTo: 200000, rate: 0.23 },
  { upTo: 300000, rate: 0.27 },
  { upTo: Infinity, rate: 0.3 },
];

export const COMUNIDADES_AUTONOMAS_LABELS: Record<ComunidadAutonoma, string> = {
  andalucia: 'Andalucía',
  madrid: 'Comunidad de Madrid',
  cataluna: 'Cataluña',
  valencia: 'Comunitat Valenciana',
  galicia: 'Galicia',
  castilla_leon: 'Castilla y León',
  canarias: 'Canarias',
  otra_comun: 'Resto CC. AA. (Régimen Común)',
};

export interface IrpfReglaNormativa {
  id: string;
  concepto: string;
  norma: string;
  articulo: string;
  vigencia: string;
  importeOLimite: string;
  fuenteOficial: string;
}

export const IRPF_PARAMETROS_NORMATIVOS: IrpfReglaNormativa[] = [
  {
    id: 'min-contrib',
    concepto: 'Mínimo del contribuyente (general y >65 / >75)',
    norma: 'Ley 35/2006 (LIRPF)',
    articulo: 'Art. 57 y Art. 84.2.2.º',
    vigencia: '2024 – 2026',
    importeOLimite: '5.550 € (+1.150 € >65 / +1.400 € >75 por cónyuge en conjunta)',
    fuenteOficial: 'AEAT Manual Práctico Renta',
  },
  {
    id: 'min-desc',
    concepto: 'Mínimo por descendientes (<25 años o disc. ≥33%, rentas ≤8.000 €)',
    norma: 'Ley 35/2006 (LIRPF)',
    articulo: 'Art. 58',
    vigencia: '2024 – 2026',
    importeOLimite: '2.400 € / 2.700 € / 4.000 € / 4.500 € (+2.800 € <3 años)',
    fuenteOficial: 'AEAT Manual Práctico Renta',
  },
  {
    id: 'red-art20',
    concepto: 'Reducción obtención rendimientos del trabajo',
    norma: 'Ley 35/2006 (modif. RDL 4/2024)',
    articulo: 'Art. 20 y Art. 84.2.1.º',
    vigencia: '2024 – 2026',
    importeOLimite: 'Hasta 7.302 € (RNT ≤ 14.852 €; decaimiento 1,75 y 1,14 hasta 19.747,50 €)',
    fuenteOficial: 'BOE / AEAT',
  },
  {
    id: 'red-conjunta',
    concepto: 'Reducción por tributación conjunta (Matrimonio vs Monoparental)',
    norma: 'Ley 35/2006 (LIRPF)',
    articulo: 'Art. 82 y Art. 84.2',
    vigencia: '2024 – 2026',
    importeOLimite: '3.400 € (Matrimonio) / 2.150 € (Monoparental sin convivencia)',
    fuenteOficial: 'AEAT Criterio Art. 82/84',
  },
  {
    id: 'viv-dt18',
    concepto: 'Deducción transitoria inversión vivienda habitual (< 01/01/2013)',
    norma: 'Ley 35/2006 (LIRPF)',
    articulo: 'Disposición Transitoria 18.ª',
    vigencia: 'Régimen transitorio vigente',
    importeOLimite: '15% sobre base máx. 9.040 €/declaración (18.080 € en 2 individuales)',
    fuenteOficial: 'AEAT / Consultas DGT',
  },
  {
    id: 'eficiencia-da50',
    concepto: 'Deducciones por obras de mejora de eficiencia energética',
    norma: 'Ley 35/2006 (prorrogada)',
    articulo: 'Disposición Adicional 50.ª',
    vigencia: '2024 – 2026 (con CEE previo/posterior)',
    importeOLimite: '20% (máx 5.000 €) / 40% (máx 7.500 €) / 60% (máx 5.000 €/año)',
    fuenteOficial: 'BOE / AEAT',
  },
];

function calcularCuotaEscala(base: number, brackets: TaxBracket[]): number {
  if (base <= 0) return 0;
  let quota = 0;
  let prev = 0;
  for (const b of brackets) {
    if (base <= prev) break;
    const tramo = Math.min(base, b.upTo) - prev;
    if (tramo > 0) {
      quota += tramo * b.rate;
    }
    prev = b.upTo;
  }
  return quota;
}

function calcularMinimoDescendientes(
  descendientes: DescendienteInput[],
  prorrateoPct: number
): number {
  // Elegibles: <25 años o discapacidad >= 33%, rentas <= 8.000 €, no presenta IRPF > 1.800 €
  const elegibles = descendientes.filter(
    (d) =>
      (d.edad < 25 || d.discapacidad33) &&
      !d.rentasSuperiores8000 &&
      !d.presentaIrpfMas1800
  );

  const importesPorOrden = [2400, 2700, 4000, 4500];
  let total = 0;
  elegibles.forEach((d, idx) => {
    const base = idx < 3 ? importesPorOrden[idx] : importesPorOrden[3];
    const menor3 = d.edad < 3 ? 2800 : 0;
    const disc = d.discapacidad33 ? 3000 : 0;
    total += (base + menor3 + disc) * prorrateoPct;
  });
  return total;
}

function calcularMinimoContribuyenteIndividual(edad: number, discapacidad33: boolean): number {
  let minimo = 5550;
  if (edad > 65) minimo += 1150;
  if (edad > 75) minimo += 1400;
  if (discapacidad33) minimo += 3000;
  return minimo;
}

// Art. 84.2.2.º LIRPF: en tributación conjunta matrimonial, el mínimo base de 5.550 € es único,
// pero los incrementos por edad (>65 / >75) y discapacidad se aplican por cada cónyuge que los cumpla.
function calcularMinimoContribuyenteConjuntaMatrimonio(
  d1: ContribuyenteIrpfInput,
  d2: ContribuyenteIrpfInput
): number {
  let minimo = 5550;
  for (const c of [d1, d2]) {
    if (c.edad > 65) minimo += 1150;
    if (c.edad > 75) minimo += 1400;
    if (c.discapacidad33) minimo += 3000;
  }
  return minimo;
}

// Art. 19.2.f y Art. 20 LIRPF (redacción vigente desde RDL 4/2024):
// Tramo 1: RNT <= 14.852 -> 7.302 €
// Tramo 2: 14.852 < RNT <= 17.673,52 -> 7.302 - 1,75 * (RNT - 14.852)
// Tramo 3: 17.673,52 < RNT <= 19.747,50 -> 2.364,34 - 1,14 * (RNT - 17.673,52)
function calcularRendimientoTrabajoDesdeTotales(
  salarioBrutoTotal: number,
  cotizacionSSTotal: number,
  otrasRentasNetas: number
) {
  if (salarioBrutoTotal <= 0) {
    return { rnt: 0, reduccionArt20: 0, rntr: 0 };
  }
  const gastosDeducibles = Math.min(salarioBrutoTotal, cotizacionSSTotal + 2000);
  const rnt = Math.max(0, salarioBrutoTotal - gastosDeducibles);
  let reduccionArt20 = 0;
  if (otrasRentasNetas <= 6500) {
    if (rnt <= 14852) {
      reduccionArt20 = 7302;
    } else if (rnt <= 17673.52) {
      reduccionArt20 = Math.max(0, 7302 - 1.75 * (rnt - 14852));
    } else if (rnt <= 19747.5) {
      reduccionArt20 = Math.max(0, 2364.34 - 1.14 * (rnt - 17673.52));
    }
  }
  const rntr = Math.max(0, rnt - reduccionArt20);
  return { rnt, reduccionArt20, rntr };
}

function calcularRendimientoTrabajo(c: ContribuyenteIrpfInput, otrasRentasNetas: number) {
  return calcularRendimientoTrabajoDesdeTotales(
    c.salarioBrutoAnual,
    c.cotizacionSeguridadSocial,
    otrasRentasNetas
  );
}

function calcularRendimientoAutonomo(c: ContribuyenteIrpfInput) {
  if (!c.esAutonomo) {
    return { previo: 0, dificilJustificacion: 0, neto: 0 };
  }
  // 30% sobre los suministros proporcionales a la parte de vivienda afecta
  const suministrosDeducibles =
    c.suministrosViviendaAnuales * (Math.min(100, Math.max(0, c.porcentajeViviendaAfecta)) / 100) * 0.3;
  const gastosTotales = c.cuotaRetaAnual + c.gestoriaYOtrosGastos + suministrosDeducibles;
  const previo = c.ingresosAutonomoAnuales - gastosTotales;
  const dificilJustificacion = previo > 0 ? Math.min(2000, previo * 0.05) : 0;
  const neto = previo - dificilJustificacion;
  return { previo, dificilJustificacion, neto };
}

function calcularDeduccionEficiencia(c: ContribuyenteIrpfInput): number {
  if (!c.tieneCeePrevioYPosterior || c.gastosEficienciaEnergetica <= 0) return 0;
  switch (c.tipoEficienciaEnergetica) {
    case '20_demanda': {
      const base = Math.min(5000, c.gastosEficienciaEnergetica);
      return base * 0.2;
    }
    case '40_primaria': {
      const base = Math.min(7500, c.gastosEficienciaEnergetica);
      return base * 0.4;
    }
    case '60_edificio': {
      const base = Math.min(5000, c.gastosEficienciaEnergetica);
      return base * 0.6;
    }
    default:
      return 0;
  }
}

function calcularDeduccionAutonomica(
  ccaa: ComunidadAutonoma,
  c: ContribuyenteIrpfInput,
  baseImponibleTotal: number,
  esConjunta: boolean,
  numDescendientesElegibles: number,
  prorrateoDescendientes: number
): number {
  let total = 0;
  if (ccaa === 'andalucia') {
    // Art. 14 Ley 5/2021 Andalucía: 15% gastos enseñanza idiomas/informática, máx 150 €/descendiente
    // Límite de suma de BI General + Ahorro: 80.000 € individual / 100.000 € conjunta
    const limiteEducacion = esConjunta ? 100000 : 80000;
    if (
      c.gastosEducativosIdiomasInformatica > 0 &&
      numDescendientesElegibles > 0 &&
      baseImponibleTotal <= limiteEducacion
    ) {
      const topeEducacion = 150 * numDescendientesElegibles * prorrateoDescendientes;
      total += Math.min(topeEducacion, c.gastosEducativosIdiomasInformatica * 0.15);
    }
    // Art. 11 Ley 5/2021 Andalucía: Alquiler vivienda habitual < 35 años o >= 65 años (15% hasta 600 €/año)
    const limiteRentas = esConjunta ? 30000 : 25000;
    if (
      c.gastosAlquilerAnuales > 0 &&
      (c.edad < 35 || c.edad >= 65) &&
      baseImponibleTotal <= limiteRentas
    ) {
      total += Math.min(600, c.gastosAlquilerAnuales * 0.15);
    }
  } else if (ccaa === 'madrid') {
    if (
      c.gastosAlquilerAnuales > 0 &&
      c.edad < 35 &&
      baseImponibleTotal <= (esConjunta ? 37200 : 26414.22)
    ) {
      total += Math.min(1237.2, c.gastosAlquilerAnuales * 0.3);
    }
    if (c.gastosEducativosIdiomasInformatica > 0 && numDescendientesElegibles > 0) {
      const topeMadrid = 412.4 * numDescendientesElegibles * prorrateoDescendientes;
      total += Math.min(topeMadrid, c.gastosEducativosIdiomasInformatica * 0.15);
    }
  } else if (ccaa === 'valencia') {
    if (c.gastosAlquilerAnuales > 0 && baseImponibleTotal <= 30000) {
      total += Math.min(700, c.gastosAlquilerAnuales * 0.2);
    }
  } else if (ccaa === 'cataluna') {
    if (c.gastosAlquilerAnuales > 0 && c.edad <= 32 && baseImponibleTotal <= 20000) {
      total += Math.min(300, c.gastosAlquilerAnuales * 0.1);
    }
  }
  return total;
}

function calcularDeduccionFamiliaNumerosaTotal(
  categoria: 'ninguna' | 'general' | 'especial',
  numDescendientesElegibles: number
): number {
  if (categoria === 'general') {
    const exceso = Math.max(0, numDescendientesElegibles - 3);
    return 1200 + exceso * 600;
  }
  if (categoria === 'especial') {
    const exceso = Math.max(0, numDescendientesElegibles - 5);
    return 2400 + exceso * 600;
  }
  return 0;
}

function liquidarDeclaracion(params: {
  titulo: string;
  elegible: boolean;
  motivoNoElegible?: string;
  ccaa: ComunidadAutonoma;
  rnt: number;
  reduccionArt20: number;
  rntr: number;
  autonomoPrevio: number;
  autonomoDificil: number;
  autonomoNeto: number;
  interesesAhorro: number;
  reduccionConjunta: number;
  minimoContribuyente: number;
  minimoDescendientes: number;
  baseViviendaAportada: number;
  topeBaseVivienda: number;
  deduccionEficiencia: number;
  deduccionMaternidadYGuarderia: number;
  deduccionFamiliaNumerosa: number;
  deduccionAutonomica: number;
  retencionesYPagosCuenta: number;
}): DeclaracionBreakdown {
  if (!params.elegible) {
    return {
      titulo: params.titulo,
      elegible: false,
      motivoNoElegible: params.motivoNoElegible,
      rendimientoNetoTrabajo: 0,
      reduccionArt20Trabajo: 0,
      rendimientoNetoTrabajoReducido: 0,
      rendimientoNetoAutonomoPrevio: 0,
      gastosDificilJustificacion5Pct: 0,
      rendimientoNetoAutonomo: 0,
      baseImponibleGeneral: 0,
      reduccionTributacionConjunta: 0,
      baseLiquidableGeneral: 0,
      baseLiquidableAhorro: 0,
      minimoContribuyente: 0,
      minimoDescendientes: 0,
      minimoTotal: 0,
      cuotaIntegraEstatalGeneral: 0,
      cuotaIntegraAutonomicaGeneral: 0,
      cuotaIntegraAhorro: 0,
      cuotaIntegraTotal: 0,
      deduccionViviendaHabitual: 0,
      baseViviendaComputable: 0,
      baseViviendaTopeAplicado: 0,
      deduccionEficienciaEnergetica: 0,
      deduccionMaternidadYGuarderia: 0,
      deduccionFamiliaNumerosa: 0,
      deduccionAutonomica: 0,
      totalDeducciones: 0,
      cuotaLiquida: 0,
      retencionesYPagosCuenta: 0,
      resultadoDeclaracion: 0,
    };
  }

  const baseImponibleGeneral = Math.max(0, params.rntr + params.autonomoNeto);
  const reduccionAplicadaGeneral = Math.min(baseImponibleGeneral, params.reduccionConjunta);
  const remanenteReduccion = Math.max(0, params.reduccionConjunta - reduccionAplicadaGeneral);

  const baseLiquidableGeneral = Math.max(0, baseImponibleGeneral - reduccionAplicadaGeneral);
  const baseLiquidableAhorro = Math.max(0, params.interesesAhorro - remanenteReduccion);

  const minimoTotal = params.minimoContribuyente + params.minimoDescendientes;
  const escalaAutonomica = ESCALAS_AUTONOMICAS[params.ccaa] ?? ESCALA_ESTATAL;

  // Regla AEAT: Si Base Liquidable General < Mínimo Personal y Familiar, el exceso del mínimo minora la Base del Ahorro
  const minimoEnGeneral = Math.min(baseLiquidableGeneral, minimoTotal);
  const remanenteMinimoParaAhorro = Math.max(0, minimoTotal - baseLiquidableGeneral);

  const cuotaIntegraEstatalGeneral = Math.max(
    0,
    calcularCuotaEscala(baseLiquidableGeneral, ESCALA_ESTATAL) -
      calcularCuotaEscala(minimoEnGeneral, ESCALA_ESTATAL)
  );
  const cuotaIntegraAutonomicaGeneral = Math.max(
    0,
    calcularCuotaEscala(baseLiquidableGeneral, escalaAutonomica) -
      calcularCuotaEscala(minimoEnGeneral, escalaAutonomica)
  );

  const cuotaIntegraAhorro = Math.max(
    0,
    calcularCuotaEscala(baseLiquidableAhorro, ESCALA_AHORRO) -
      calcularCuotaEscala(Math.min(baseLiquidableAhorro, remanenteMinimoParaAhorro), ESCALA_AHORRO)
  );

  const cuotaIntegraTotal =
    cuotaIntegraEstatalGeneral + cuotaIntegraAutonomicaGeneral + cuotaIntegraAhorro;

  // Deducción Vivienda Habitual DT 18ª (15% hasta tope legal, limitada por cuota íntegra)
  const baseViviendaComputable = Math.min(params.baseViviendaAportada, params.topeBaseVivienda);
  const deduccionViviendaTeorica = baseViviendaComputable * 0.15;
  const deduccionViviendaHabitual = Math.min(cuotaIntegraTotal, deduccionViviendaTeorica);

  const cuotaTrasVivienda = Math.max(0, cuotaIntegraTotal - deduccionViviendaHabitual);
  const deduccionEficienciaAplicada = Math.min(cuotaTrasVivienda, params.deduccionEficiencia);
  const cuotaTrasEficiencia = Math.max(0, cuotaTrasVivienda - deduccionEficienciaAplicada);
  const deduccionAutonomicaAplicada = Math.min(cuotaTrasEficiencia, params.deduccionAutonomica);

  // Nota: Maternidad y Familia Numerosa son deducciones negativas (abonables incluso con cuota 0 si hay cotización SS/RETA)
  const totalDeducciones =
    deduccionViviendaHabitual +
    deduccionEficienciaAplicada +
    deduccionAutonomicaAplicada +
    params.deduccionMaternidadYGuarderia +
    params.deduccionFamiliaNumerosa;

  const cuotaLiquida =
    cuotaIntegraTotal -
    deduccionViviendaHabitual -
    deduccionEficienciaAplicada -
    deduccionAutonomicaAplicada;

  // Cuota diferencial = Cuota líquida - retenciones/pagos a cuenta - deducciones abonables (maternidad + fam. numerosa)
  const resultadoDeclaracion =
    cuotaLiquida -
    params.retencionesYPagosCuenta -
    params.deduccionMaternidadYGuarderia -
    params.deduccionFamiliaNumerosa;

  return {
    titulo: params.titulo,
    elegible: true,
    rendimientoNetoTrabajo: params.rnt,
    reduccionArt20Trabajo: params.reduccionArt20,
    rendimientoNetoTrabajoReducido: params.rntr,
    rendimientoNetoAutonomoPrevio: params.autonomoPrevio,
    gastosDificilJustificacion5Pct: params.autonomoDificil,
    rendimientoNetoAutonomo: params.autonomoNeto,
    baseImponibleGeneral,
    reduccionTributacionConjunta: reduccionAplicadaGeneral + remanenteReduccion,
    baseLiquidableGeneral,
    baseLiquidableAhorro,
    minimoContribuyente: params.minimoContribuyente,
    minimoDescendientes: params.minimoDescendientes,
    minimoTotal,
    cuotaIntegraEstatalGeneral,
    cuotaIntegraAutonomicaGeneral,
    cuotaIntegraAhorro,
    cuotaIntegraTotal,
    deduccionViviendaHabitual,
    baseViviendaComputable,
    baseViviendaTopeAplicado: params.topeBaseVivienda,
    deduccionEficienciaEnergetica: deduccionEficienciaAplicada,
    deduccionMaternidadYGuarderia: params.deduccionMaternidadYGuarderia,
    deduccionFamiliaNumerosa: params.deduccionFamiliaNumerosa,
    deduccionAutonomica: deduccionAutonomicaAplicada,
    totalDeducciones,
    cuotaLiquida,
    retencionesYPagosCuenta: params.retencionesYPagosCuenta,
    resultadoDeclaracion,
  };
}

export function simulateIrpfComparison(input: IrpfSimulationInput): IrpfComparisonResult {
  const advertenciasLegales: string[] = [];
  const haySegundoDeclarante =
    input.tipoUnidadFamiliar === 'matrimonio' || input.tipoUnidadFamiliar === 'pareja_de_hecho';

  if (input.tipoUnidadFamiliar === 'pareja_de_hecho') {
    advertenciasLegales.push(
      'Criterio estricto AEAT (Art. 82 Ley 35/2006): Las parejas de hecho NO pueden presentar declaración conjunta entre ambos miembros. Solo uno de los progenitores puede formar unidad familiar monoparental con todos los hijos menores; el otro debe presentar declaración individual.'
    );
    if (input.descendientes.some((d) => d.edad < 18)) {
      advertenciasLegales.push(
        'Reducción Art. 84.2.4.º LIRPF bloqueada: Al existir convivencia entre ambos progenitores en pareja de hecho, la declaración conjunta de un progenitor con los hijos menores NO da derecho a la reducción de 2.150 € en la base imponible.'
      );
    }
  }

  if (input.tipoUnidadFamiliar === 'monoparental' && input.conviveOtroProgenitor) {
    advertenciasLegales.push(
      'Art. 84.2.4.º LIRPF: La reducción de 2.150 € por unidad familiar monoparental no es aplicable si el contribuyente convive con el padre o la madre de alguno de los hijos que integran la unidad familiar.'
    );
  }

  if (input.custodiaCompartida) {
    advertenciasLegales.push(
      'Guarda y custodia compartida: El mínimo por descendientes se prorratea al 50% entre ambos progenitores, y la opción de tributación conjunta con los hijos solo puede ejercitarla uno de ellos cada año de mutuo acuerdo.'
    );
  }

  const d1 = input.declarante1;
  const d2 = input.declarante2;

  // Prorrateo de descendientes en Individual:
  // Si matrimonio/pareja de hecho o custodia compartida -> 50% para cada progenitor. Si monoparental exclusiva -> 100%
  const prorrateoInd =
    haySegundoDeclarante || input.custodiaCompartida ? 0.5 : 1.0;

  const numDescendientesElegibles = input.descendientes.filter(
    (d) =>
      (d.edad < 25 || d.discapacidad33) &&
      !d.rentasSuperiores8000 &&
      !d.presentaIrpfMas1800
  ).length;

  // Individual 1
  const aut1 = calcularRendimientoAutonomo(d1);
  const trab1 = calcularRendimientoTrabajo(d1, aut1.neto + d1.interesesCuentaRemunerada);
  const minContrib1 = calcularMinimoContribuyenteIndividual(d1.edad, d1.discapacidad33);
  const minDescInd1 = calcularMinimoDescendientes(input.descendientes, prorrateoInd);
  const maternidad1 =
    d1.madreTrabajadoraHijosMenores3 * 1200 +
    Math.min(d1.madreTrabajadoraHijosMenores3 * 1000, d1.gastosGuarderiaAnuales);
  const famNumTotal = calcularDeduccionFamiliaNumerosaTotal(
    input.familiaNumerosa,
    numDescendientesElegibles
  );
  const famNumInd1 = haySegundoDeclarante ? famNumTotal * 0.5 : famNumTotal;

  const ind1 = liquidarDeclaracion({
    titulo: 'Individual · Declarante 1',
    elegible: true,
    ccaa: input.comunidadAutonoma,
    rnt: trab1.rnt,
    reduccionArt20: trab1.reduccionArt20,
    rntr: trab1.rntr,
    autonomoPrevio: aut1.previo,
    autonomoDificil: aut1.dificilJustificacion,
    autonomoNeto: aut1.neto,
    interesesAhorro: d1.interesesCuentaRemunerada,
    reduccionConjunta: 0,
    minimoContribuyente: minContrib1,
    minimoDescendientes: minDescInd1,
    baseViviendaAportada: d1.aportacionViviendaPre2013,
    topeBaseVivienda: 9040,
    deduccionEficiencia: calcularDeduccionEficiencia(d1),
    deduccionMaternidadYGuarderia: maternidad1,
    deduccionFamiliaNumerosa: famNumInd1,
    deduccionAutonomica: calcularDeduccionAutonomica(
      input.comunidadAutonoma,
      d1,
      trab1.rntr + aut1.neto + d1.interesesCuentaRemunerada,
      false,
      numDescendientesElegibles,
      prorrateoInd
    ),
    retencionesYPagosCuenta:
      d1.retencionesTrabajo +
      d1.retencionesProfesionales +
      d1.pagosFraccionadosMod130 +
      d1.retencionCapital19,
  });

  // Individual 2 (si aplica matrimonio o pareja de hecho)
  let ind2: DeclaracionBreakdown | null = null;
  if (haySegundoDeclarante) {
    const aut2 = calcularRendimientoAutonomo(d2);
    const trab2 = calcularRendimientoTrabajo(d2, aut2.neto + d2.interesesCuentaRemunerada);
    const minContrib2 = calcularMinimoContribuyenteIndividual(d2.edad, d2.discapacidad33);
    const minDescInd2 = calcularMinimoDescendientes(input.descendientes, 0.5);
    const maternidad2 =
      d2.madreTrabajadoraHijosMenores3 * 1200 +
      Math.min(d2.madreTrabajadoraHijosMenores3 * 1000, d2.gastosGuarderiaAnuales);

    ind2 = liquidarDeclaracion({
      titulo: 'Individual · Declarante 2',
      elegible: true,
      ccaa: input.comunidadAutonoma,
      rnt: trab2.rnt,
      reduccionArt20: trab2.reduccionArt20,
      rntr: trab2.rntr,
      autonomoPrevio: aut2.previo,
      autonomoDificil: aut2.dificilJustificacion,
      autonomoNeto: aut2.neto,
      interesesAhorro: d2.interesesCuentaRemunerada,
      reduccionConjunta: 0,
      minimoContribuyente: minContrib2,
      minimoDescendientes: minDescInd2,
      baseViviendaAportada: d2.aportacionViviendaPre2013,
      topeBaseVivienda: 9040,
      deduccionEficiencia: calcularDeduccionEficiencia(d2),
      deduccionMaternidadYGuarderia: maternidad2,
      deduccionFamiliaNumerosa: famNumTotal * 0.5,
      deduccionAutonomica: calcularDeduccionAutonomica(
        input.comunidadAutonoma,
        d2,
        trab2.rntr + aut2.neto + d2.interesesCuentaRemunerada,
        false,
        numDescendientesElegibles,
        0.5
      ),
      retencionesYPagosCuenta:
        d2.retencionesTrabajo +
        d2.retencionesProfesionales +
        d2.pagosFraccionadosMod130 +
        d2.retencionCapital19,
    });
  }

  // Tributación Conjunta (Art. 82 y 84 LIRPF)
  let conjuntaElegible = true;
  let motivoNoElegible: string | undefined;
  let reduccionConjunta = 0;

  const tieneHijosMenores = input.descendientes.some((d) => d.edad < 18);

  if (input.tipoUnidadFamiliar === 'individual') {
    conjuntaElegible = false;
    motivoNoElegible =
      'El contribuyente sin vínculo matrimonial y sin hijos menores no forma unidad familiar a efectos del Art. 82 LIRPF.';
  } else if (input.tipoUnidadFamiliar === 'pareja_de_hecho') {
    if (!tieneHijosMenores) {
      conjuntaElegible = false;
      motivoNoElegible =
        'Las parejas de hecho sin hijos menores comunes no pueden tributar conjuntamente (Art. 82 LIRPF). Ambos miembros deben presentar declaración individual.';
    } else {
      // Solo Declarante 1 + hijos menores (sin Declarante 2), y SIN reducción de 2.150 € por convivencia
      conjuntaElegible = true;
      reduccionConjunta = 0;
    }
  } else if (input.tipoUnidadFamiliar === 'matrimonio') {
    conjuntaElegible = true;
    reduccionConjunta = 3400;
  } else if (input.tipoUnidadFamiliar === 'monoparental') {
    if (!tieneHijosMenores) {
      conjuntaElegible = false;
      motivoNoElegible =
        'La unidad familiar monoparental requiere convivencia con hijos menores de edad (o mayores incapacitados judicialmente).';
    } else {
      conjuntaElegible = true;
      reduccionConjunta = input.conviveOtroProgenitor ? 0 : 2150;
    }
  }

  let conjunta: DeclaracionBreakdown;
  if (input.tipoUnidadFamiliar === 'matrimonio' && conjuntaElegible) {
    const aut2Conj = calcularRendimientoAutonomo(d2);
    const autConj = {
      previo: aut1.previo + aut2Conj.previo,
      dificil: aut1.dificilJustificacion + aut2Conj.dificilJustificacion,
      neto: aut1.neto + aut2Conj.neto,
    };
    const interesesConjuntos = d1.interesesCuentaRemunerada + d2.interesesCuentaRemunerada;

    // Art. 84.2.1.º LIRPF: En tributación conjunta, los 2.000 € de otros gastos (Art. 19.2.f)
    // y la reducción por obtención de rendimientos del trabajo (Art. 20) se aplican UNA SOLA VEZ
    // sobre la suma de rendimientos del trabajo de ambos cónyuges.
    const trabConjunta = calcularRendimientoTrabajoDesdeTotales(
      d1.salarioBrutoAnual + d2.salarioBrutoAnual,
      d1.cotizacionSeguridadSocial + d2.cotizacionSeguridadSocial,
      autConj.neto + interesesConjuntos
    );

    const minContribConj = calcularMinimoContribuyenteConjuntaMatrimonio(d1, d2);
    const minDescConj = calcularMinimoDescendientes(input.descendientes, 1.0);

    const maternidadConj =
      maternidad1 +
      (d2.madreTrabajadoraHijosMenores3 * 1200 +
        Math.min(d2.madreTrabajadoraHijosMenores3 * 1000, d2.gastosGuarderiaAnuales));

    conjunta = liquidarDeclaracion({
      titulo: 'Tributación Conjunta (Matrimonio)',
      elegible: true,
      ccaa: input.comunidadAutonoma,
      rnt: trabConjunta.rnt,
      reduccionArt20: trabConjunta.reduccionArt20,
      rntr: trabConjunta.rntr,
      autonomoPrevio: autConj.previo,
      autonomoDificil: autConj.dificil,
      autonomoNeto: autConj.neto,
      interesesAhorro: interesesConjuntos,
      reduccionConjunta,
      minimoContribuyente: minContribConj,
      minimoDescendientes: minDescConj,
      // En conjunta, el tope combinado de la vivienda habitual DT 18ª es ESTRICTAMENTE 9.040 €/año
      baseViviendaAportada: d1.aportacionViviendaPre2013 + d2.aportacionViviendaPre2013,
      topeBaseVivienda: 9040,
      deduccionEficiencia: calcularDeduccionEficiencia(d1) + calcularDeduccionEficiencia(d2),
      deduccionMaternidadYGuarderia: maternidadConj,
      deduccionFamiliaNumerosa: famNumTotal,
      deduccionAutonomica: calcularDeduccionAutonomica(
        input.comunidadAutonoma,
        {
          ...d1,
          gastosEducativosIdiomasInformatica:
            d1.gastosEducativosIdiomasInformatica + d2.gastosEducativosIdiomasInformatica,
          gastosAlquilerAnuales: d1.gastosAlquilerAnuales + d2.gastosAlquilerAnuales,
        },
        trabConjunta.rntr + autConj.neto + interesesConjuntos,
        true,
        numDescendientesElegibles,
        1.0
      ),
      retencionesYPagosCuenta:
        ind1.retencionesYPagosCuenta + (ind2 ? ind2.retencionesYPagosCuenta : 0),
    });
  } else {
    // Monoparental o Pareja de hecho (Progenitor 1 con hijos + Progenitor 2 individual en su caso)
    const prorrateoConjMono = input.custodiaCompartida ? 0.5 : 1.0;
    const minDescConj = calcularMinimoDescendientes(input.descendientes, prorrateoConjMono);
    conjunta = liquidarDeclaracion({
      titulo:
        input.tipoUnidadFamiliar === 'pareja_de_hecho'
          ? 'Conjunta Monoparental (D1 + hijos; D2 va Individual)'
          : 'Tributación Conjunta Monoparental',
      elegible: conjuntaElegible,
      motivoNoElegible,
      ccaa: input.comunidadAutonoma,
      rnt: trab1.rnt,
      reduccionArt20: trab1.reduccionArt20,
      rntr: trab1.rntr,
      autonomoPrevio: aut1.previo,
      autonomoDificil: aut1.dificilJustificacion,
      autonomoNeto: aut1.neto,
      interesesAhorro: d1.interesesCuentaRemunerada,
      reduccionConjunta,
      minimoContribuyente: minContrib1,
      minimoDescendientes: minDescConj,
      baseViviendaAportada: d1.aportacionViviendaPre2013,
      topeBaseVivienda: 9040,
      deduccionEficiencia: calcularDeduccionEficiencia(d1),
      deduccionMaternidadYGuarderia: maternidad1,
      deduccionFamiliaNumerosa: famNumTotal,
      deduccionAutonomica: calcularDeduccionAutonomica(
        input.comunidadAutonoma,
        d1,
        trab1.rntr + aut1.neto + d1.interesesCuentaRemunerada,
        true,
        numDescendientesElegibles,
        prorrateoConjMono
      ),
      retencionesYPagosCuenta: ind1.retencionesYPagosCuenta,
    });
  }

  const sumaIndividualesResultado =
    ind1.resultadoDeclaracion + (ind2 ? ind2.resultadoDeclaracion : 0);
  const sumaIndividualesCuotaLiquida =
    ind1.cuotaLiquida + (ind2 ? ind2.cuotaLiquida : 0);
  const sumaIndividualesDeduccionVivienda =
    ind1.deduccionViviendaHabitual + (ind2 ? ind2.deduccionViviendaHabitual : 0);

  // En pareja de hecho con hijos, la comparación real del hogar frente a 2 individuales suma la conjunta de D1+hijos + Individual de D2
  const resultadoTotalEscenarioConjunta =
    input.tipoUnidadFamiliar === 'pareja_de_hecho' && conjunta.elegible && ind2
      ? conjunta.resultadoDeclaracion + ind2.resultadoDeclaracion
      : conjunta.resultadoDeclaracion;

  let modalidadOptima: 'individual' | 'conjunta' = 'individual';
  let ahorroFiscalOptimo = 0;

  if (conjunta.elegible) {
    if (resultadoTotalEscenarioConjunta < sumaIndividualesResultado) {
      modalidadOptima = 'conjunta';
      ahorroFiscalOptimo = sumaIndividualesResultado - resultadoTotalEscenarioConjunta;
    } else {
      modalidadOptima = 'individual';
      ahorroFiscalOptimo = resultadoTotalEscenarioConjunta - sumaIndividualesResultado;
    }
  }

  // Advertencia crítica sobre deducción de vivienda DT 18ª
  if (
    haySegundoDeclarante &&
    d1.aportacionViviendaPre2013 + d2.aportacionViviendaPre2013 > 9040 &&
    input.tipoUnidadFamiliar === 'matrimonio'
  ) {
    advertenciasLegales.push(
      `Impacto DT 18.ª Vivienda Habitual: En Declaración Individual (2 titulares al 50%), el techo combinado asciende a 18.080 € (hasta 2.712 € de deducción). En Conjunta se limita estrictamente a 9.040 € (máximo 1.356 €).`
    );
  }

  return {
    individual1: ind1,
    individual2: ind2,
    sumaIndividualesResultado,
    sumaIndividualesCuotaLiquida,
    sumaIndividualesDeduccionVivienda,
    conjunta,
    modalidadOptima,
    ahorroFiscalOptimo,
    advertenciasLegales,
  };
}
