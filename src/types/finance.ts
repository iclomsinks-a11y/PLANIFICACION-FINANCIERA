export type AppMode = 'familiar' | 'personal';

export type ProfileId =
  | 'unidad_familiar'
  | 'hombre_adulto'
  | 'mujer_adulta'
  | 'hombre_adolescente'
  | 'mujer_adolescente';

export type ActiveTab = 'presupuesto' | 'irpf' | 'hipoteca' | 'poster';

export type BudgetFrequency = 'mensual' | 'trimestral' | 'anual' | 'puntual';

export type BudgetItemType = 'ingreso' | 'gasto_ordinario' | 'gasto_extraordinario';

export interface SalarioFuturo {
  activo: boolean;
  mes: number; // 1..12
  anio: number;
  importePrevisto: number;
}

export interface BudgetItem {
  id: string;
  nombre: string;
  categoria: string;
  coicopCode: string;
  tipo: BudgetItemType;
  importe: number; // importe por ocurrencia según frecuencia
  frecuencia: BudgetFrequency;
  mesPuntual?: number; // 1..12 si frecuencia === 'puntual'
  activo: boolean;
  esHipoteca?: boolean;
  esSeguroVinculadoHipoteca?: boolean;
  esDeducibleAutonomo?: boolean;
  esNomina?: boolean;
  salarioFuturo?: SalarioFuturo;
  notas?: string;
}

export interface ProfileDefinition {
  id: ProfileId;
  mode: AppMode;
  nombre: string;
  subtitulo: string;
  descripcion: string;
  irpfHabilitado: boolean;
  hipotecaRecomendada: boolean;
  categorias: string[];
  itemsIniciales: BudgetItem[];
}

// ==========================================
// MÓDULO IRPF (LEY 35/2006 Y AEAT)
// ==========================================

export type UnidadFamiliarTipo =
  | 'matrimonio'
  | 'pareja_de_hecho'
  | 'monoparental'
  | 'individual';

export type ComunidadAutonoma =
  | 'andalucia'
  | 'madrid'
  | 'cataluna'
  | 'valencia'
  | 'galicia'
  | 'castilla_leon'
  | 'canarias'
  | 'otra_comun';

export type EficienciaEnergeticaTipo = 'ninguna' | '20_demanda' | '40_primaria' | '60_edificio';

export interface DescendienteInput {
  id: string;
  edad: number;
  discapacidad33: boolean;
  rentasSuperiores8000: boolean;
  presentaIrpfMas1800: boolean;
  orden: number;
}

export interface ContribuyenteIrpfInput {
  nombre: string;
  edad: number;
  discapacidad33: boolean;
  // Rendimientos del trabajo
  salarioBrutoAnual: number;
  cotizacionSeguridadSocial: number;
  retencionesTrabajo: number;
  // Rendimientos Actividades Económicas (Autónomos - EDS)
  esAutonomo: boolean;
  ingresosAutonomoAnuales: number;
  cuotaRetaAnual: number;
  gestoriaYOtrosGastos: number;
  suministrosViviendaAnuales: number;
  porcentajeViviendaAfecta: number; // 0..100 (se aplica el 30% legal sobre esa proporción)
  retencionesProfesionales: number;
  pagosFraccionadosMod130: number;
  // Capital Mobiliario (Cuenta remunerada u otros)
  interesesCuentaRemunerada: number;
  retencionCapital19: number;
  // Deducciones
  aportacionViviendaPre2013: number; // 50% o 100% según titularidad
  porcentajeTitularidadVivienda: number; // ej. 50 o 100
  gastosEficienciaEnergetica: number;
  tipoEficienciaEnergetica: EficienciaEnergeticaTipo;
  tieneCeePrevioYPosterior: boolean;
  madreTrabajadoraHijosMenores3: number;
  gastosGuarderiaAnuales: number;
  gastosEducativosIdiomasInformatica: number; // Deducción autonómica (Andalucía, etc.)
  gastosAlquilerAnuales: number;
}

export interface IrpfSimulationInput {
  ejercicio: number;
  comunidadAutonoma: ComunidadAutonoma;
  tipoUnidadFamiliar: UnidadFamiliarTipo;
  conviveOtroProgenitor: boolean; // Crítico en monoparental (Art. 84.2.4 LIRPF)
  custodiaCompartida: boolean;
  descendientes: DescendienteInput[];
  familiaNumerosa: 'ninguna' | 'general' | 'especial';
  declarante1: ContribuyenteIrpfInput;
  declarante2: ContribuyenteIrpfInput;
  usarDatosPresupuestoYHipoteca: boolean;
}

export interface DeclaracionBreakdown {
  titulo: string;
  elegible: boolean;
  motivoNoElegible?: string;
  // Rendimientos
  rendimientoNetoTrabajo: number;
  reduccionArt20Trabajo: number;
  rendimientoNetoTrabajoReducido: number;
  rendimientoNetoAutonomoPrevio: number;
  gastosDificilJustificacion5Pct: number;
  rendimientoNetoAutonomo: number;
  baseImponibleGeneral: number;
  reduccionTributacionConjunta: number;
  baseLiquidableGeneral: number;
  baseLiquidableAhorro: number;
  // Mínimos
  minimoContribuyente: number;
  minimoDescendientes: number;
  minimoTotal: number;
  // Cuotas íntegras
  cuotaIntegraEstatalGeneral: number;
  cuotaIntegraAutonomicaGeneral: number;
  cuotaIntegraAhorro: number;
  cuotaIntegraTotal: number;
  // Deducciones
  deduccionViviendaHabitual: number;
  baseViviendaComputable: number;
  baseViviendaTopeAplicado: number;
  deduccionEficienciaEnergetica: number;
  deduccionMaternidadYGuarderia: number;
  deduccionFamiliaNumerosa: number;
  deduccionAutonomica: number;
  totalDeducciones: number;
  // Cuota líquida y resultado
  cuotaLiquida: number;
  retencionesYPagosCuenta: number;
  resultadoDeclaracion: number; // Negativo = A DEVOLVER, Positivo = A INGRESAR
}

export interface IrpfComparisonResult {
  individual1: DeclaracionBreakdown;
  individual2: DeclaracionBreakdown | null;
  sumaIndividualesResultado: number;
  sumaIndividualesCuotaLiquida: number;
  sumaIndividualesDeduccionVivienda: number;
  conjunta: DeclaracionBreakdown;
  modalidadOptima: 'individual' | 'conjunta';
  ahorroFiscalOptimo: number;
  advertenciasLegales: string[];
}

// ==========================================
// MÓDULO HIPOTECA, CBP Y CUENTA REMUNERADA
// ==========================================

export type EstrategiaAmortizacion = 'reducir_cuota' | 'reducir_plazo' | 'hibrida';
export type ModalidadFiscalHipoteca = 'ninguna' | 'conjunta_9040' | 'individual_18080';

export interface FutureSalaryAdjustment {
  id: string;
  nombre: string;
  fechaYYYYMM: string; // YYYY-MM a partir del cual aplica el nuevo salario
  deltaMensual: number; // Diferencia mensual neta (importePrevisto - importeActual)
}

export interface MortgageSimulationInput {
  capitalPendienteInicial: number;
  fechaInicio: string; // YYYY-MM
  fechaVencimiento: string; // YYYY-MM
  enCarenciaCBP: boolean;
  fechaFinCarenciaCBP: string; // YYYY-MM
  cuotaInteresesCBP: number;
  tinPostCarencia: number; // % anual ej 3.5
  comisionAmortizacionAnticipadaPct: number; // % ej 0
  saldoInicialEfectivo: number;
  colchonSeguridad: number; // 6.000 - 10.000 €
  taeCuentaRemunerada: number; // % TAE ej 2.5
  ahorroNetoMensualSinHipoteca: number; // Capacidad de ahorro antes de pagar hipoteca
  ajustesSalarioFuturo?: FutureSalaryAdjustment[];
  estrategia: EstrategiaAmortizacion;
  umbralCuotaHibrida: number; // ej 300 €/mes para pasar de reducir cuota a reducir plazo
  modalidadFiscal: ModalidadFiscalHipoteca;
  segurosVinculadosAnuales: number; // Sumados a base deducible DT 18ª
  reinvertirDevolucionAEAT: boolean; // Inyecta devolución de junio directamente al capital
  cuotaIntegraDisponibleAnual: number; // Techo de cuota IRPF del hogar para validar absorción real
}

export interface MortgageLedgerRow {
  indiceMes: number;
  fechaYYYYMM: string;
  anio: number;
  mes: number;
  fase: 'Carencia CBP' | 'Ordinaria (Reducir Cuota)' | 'Ordinaria (Reducir Plazo)';
  capitalInicialMes: number;
  cuotaOrdinaria: number;
  interesBancario: number;
  principalOrdinario: number;
  amortizacionExtraEnero: number;
  amortizacionExtraAEAT: number;
  amortizacionExtraTotal: number;
  capitalFinalMes: number;
  saldoCuentaInicial: number;
  interesCuentaNeto: number;
  interesCuentaBruto: number;
  flujoAhorroMes: number;
  saldoCuentaFinal: number;
  baseFiscalAcumuladaAnio: number;
  devolucionAEATCobrada: number;
  plazoRestanteMeses: number;
}

export interface MortgageAnnualSummary {
  anio: number;
  cuotasPagadas: number;
  interesesPagados: number;
  principalOrdinario: number;
  amortizacionExtra: number;
  totalPrincipalAmortizado: number;
  capitalPendienteFinAnio: number;
  saldoCuentaFinAnio: number;
  interesesCuentaBrutos: number;
  baseFiscalAnio: number;
  devolucionAEATGenerada: number;
}

export interface MortgageSimulationResult {
  rows: MortgageLedgerRow[];
  annualSummaries: MortgageAnnualSummary[];
  fechaCancelacionExacta: string;
  mesesTotales: number;
  mesesAhorradosVsVencimiento: number;
  cuotaOrdinariaInicialPostCBP: number;
  taeRealEstimada: number;
  totalInteresesBancarios: number;
  totalInteresesBaselineSinExtra: number;
  ahorroInteresesBancarios: number;
  totalPrincipalPagado: number;
  totalDevolucionesAEAT: number;
  totalInteresesCuentaBrutos: number;
  saldoFinalCuentaRemunerada: number;
  patrimonioNetoFinal: number;
  primerMesCambioHibrido?: string;
}

export interface ProfileState {
  budgetItems: BudgetItem[];
  irpfInput: IrpfSimulationInput;
  mortgageInput: MortgageSimulationInput;
}
