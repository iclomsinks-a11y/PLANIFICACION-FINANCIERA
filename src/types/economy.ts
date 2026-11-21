import {
  IrpfSimulationInput,
  MortgageSimulationInput,
  SalarioFuturo,
} from './finance';

export type EconomyMode = 'familiar' | 'personal';

export type TemplateId = 'unidad_familiar' | 'adulto_individual' | 'adolescente';

export type MemberRole = 'admin' | 'adulto' | 'limitado';

export type AccountType =
  | 'corriente'
  | 'ahorro'
  | 'remunerada'
  | 'efectivo'
  | 'tarjeta'
  | 'personalizada';

export type CardSubtype = 'credito' | 'debito' | 'monedero' | 'virtual' | 'otras';

export interface CardAccountConfig {
  tipoTarjeta: CardSubtype;
  limiteDisponible: number;
  recargaMensualImporte: number;
  fechaPeriodicaRecarga: string; // YYYY-MM-DD (fecha de inicio y día periódico mensual)
  cuentaOrigenRecargaId?: string;
  ultimaRecargaYYYYMM?: string;
}

export type MovementType = 'ingreso' | 'gasto' | 'transferencia' | 'devolucion';

export type MovementRecurrence = 'puntual' | 'mensual' | 'trimestral' | 'anual';

export type MovementStatus = 'confirmado' | 'pendiente' | 'proximo';

export type PeriodPreset =
  | 'mes_actual'
  | 'mes_anterior'
  | 'ultimos_3_meses'
  | 'anio_actual'
  | 'personalizado';

export type MainSection =
  | 'resumen'
  | 'movimientos'
  | 'cuentas'
  | 'comparador'
  | 'hipoteca'
  | 'irpf'
  | 'asesor'
  | 'poster';

export type SituacionLaboral =
  | 'parado_con_subsidio'
  | 'desempleado'
  | 'cuenta_ajena'
  | 'autonomo';

export interface SituacionFutura {
  activo: boolean;
  situacion: SituacionLaboral;
  mes: number;
  anio: number;
  cuantiaPrevision: number;
}

export interface HouseholdMember {
  id: string;
  nombre: string;
  rol: MemberRole;
  edad: number;
  email?: string;
  autorizadoAcceso?: boolean;
  autorizadoVerTodo?: boolean;
  esTitularFiscal: boolean;
  limiteGastoMensual?: number; // Control parental para miembros limitados
  esNomina?: boolean;
  situacionActual?: SituacionLaboral;
  salarioNetoMensual?: number;
  salarioFuturo?: SalarioFuturo;
  situacionFutura?: SituacionFutura;
}

export interface FinancialAccount {
  id: string;
  nombre: string;
  tipo: AccountType;
  titularId: string; // 'familiar' o id de HouseholdMember
  visibilidad: 'compartida' | 'privada';
  saldoInicial: number;
  taePct: number;
  activa: boolean;
  tarjetaConfig?: CardAccountConfig;
}

export interface SavingsGoal {
  id: string;
  nombre: string;
  categoriaObjetivo:
    | 'vacaciones'
    | 'emergencias'
    | 'compras'
    | 'estudios'
    | 'vehiculos'
    | 'hipoteca'
    | 'personalizado';
  cuentaId: string;
  importeObjetivo: number;
  saldoReservado: number;
  aportacionMensualObjetivo: number;
  fechaObjetivoYYYYMM?: string;
}

export interface CategoryConfig {
  id: string;
  nombre: string;
  coicopCode: string;
  tipo: 'ingreso' | 'gasto';
  presupuestoMensual: number;
  subcategorias: string[];
  oculta: boolean;
  esPersonalizada?: boolean;
}

export interface FinancialMovement {
  id: string;
  tipo: MovementType;
  importe: number;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  categoriaId: string;
  subcategoria: string;
  cuentaId: string;
  cuentaDestinoId?: string; // Solo para transferencias internas (no duplicar ingresos/gastos)
  miembroId: string;
  visibilidad: 'compartida' | 'privada';
  repartoCompartido?: boolean;
  recurrencia: MovementRecurrence;
  estado: MovementStatus;
  esHipoteca?: boolean;
  esSeguroVinculadoHipoteca?: boolean;
  esDeducibleAutonomo?: boolean;
  financiado?: boolean;
  importeTotalFinanciado?: number;
  mensualidadesTotal?: number;
  tinFinanciacionPct?: number;
  cuotaMensualFinanciada?: number;
  observaciones?: string;
  justificanteNombre?: string;
  gmailMessageId?: string;
  emisor?: string;
}

export interface EconomyWorkspaceState {
  version: number;
  templateId: TemplateId;
  mode: EconomyMode;
  activeMemberScope: 'todos' | string; // 'todos' o member.id
  actingMemberId: string; // Usuario actual operando (control parental y permisos)
  prorratearGastos?: boolean; // Divide gastos trimestrales entre 3 y anuales entre 12
  members: HouseholdMember[];
  accounts: FinancialAccount[];
  savingsGoals: SavingsGoal[];
  categories: CategoryConfig[];
  movements: FinancialMovement[];
  mortgageInput: MortgageSimulationInput;
  irpfInput: IrpfSimulationInput;
}

export interface SavedSupuesto {
  id: string;
  numero: number;
  nombre: string;
  updatedAt: string;
  state: EconomyWorkspaceState;
}

export interface SupuestosWorkspaceStore {
  activeSupuestoId: string;
  nextSupuestoNumber: number;
  supuestos: SavedSupuesto[];
}
