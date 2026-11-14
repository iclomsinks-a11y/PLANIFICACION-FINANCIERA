import { useEffect, useMemo, useState } from 'react';
import { Moon, RotateCcw, Sun } from 'lucide-react';
import { AccountsAndFunds } from './components/AccountsAndFunds';
import { IrpfSimulator } from './components/IrpfSimulator';
import { MortgageTreasurySimulator } from './components/MortgageTreasurySimulator';
import { MovementsLedger } from './components/MovementsLedger';
import { OverviewDashboard } from './components/OverviewDashboard';
import { PosterLandscapeView } from './components/PosterLandscapeView';
import { SetupWizardModal } from './components/SetupWizardModal';
import {
  TEMPLATE_METADATA,
  createEconomyTemplateState,
} from './data/economyTemplates';
import { computeEconomySummary } from './engines/economyEngine';
import { simulateMortgageAndTreasury } from './engines/mortgageEngine';
import {
  EconomyWorkspaceState,
  FinancialMovement,
  MainSection,
  MovementRecurrence,
  PeriodPreset,
  SavedSupuesto,
  SupuestosWorkspaceStore,
  TemplateId,
} from './types/economy';
import {
  IrpfSimulationInput,
  MortgageSimulationInput,
  ProfileDefinition,
} from './types/finance';
import { downloadTextFile } from './utils/formatters';

const SUPUESTOS_STORAGE_KEY = 'patrimonio_irpf_supuestos_v3';
const LEGACY_STORAGE_KEY = 'patrimonio_irpf_economy_v2';
const THEME_KEY = 'patrimonio_irpf_theme_v1';

function recurrenceAnnualFactor(recurrence: MovementRecurrence): number {
  if (recurrence === 'mensual') return 12;
  if (recurrence === 'trimestral') return 4;
  return 1;
}

function createInitialSupuesto(
  numero: number,
  templateId: TemplateId = 'unidad_familiar',
  customName?: string
): SavedSupuesto {
  return {
    id: `sup-${numero}-${Date.now()}`,
    numero,
    nombre: customName ?? `Supuesto ${numero}`,
    updatedAt: new Date().toISOString(),
    state: createEconomyTemplateState(templateId),
  };
}

function loadInitialSupuestosStore(): SupuestosWorkspaceStore {
  try {
    const raw = localStorage.getItem(SUPUESTOS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SupuestosWorkspaceStore>;
      if (
        Array.isArray(parsed.supuestos) &&
        parsed.supuestos.length > 0 &&
        parsed.activeSupuestoId
      ) {
        return {
          activeSupuestoId: parsed.activeSupuestoId,
          nextSupuestoNumber: parsed.nextSupuestoNumber ?? parsed.supuestos.length + 1,
          supuestos: parsed.supuestos,
        };
      }
    }

    // Migración suave desde v2 si existía
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw) as Partial<
        Record<TemplateId, EconomyWorkspaceState>
      >;
      if (legacyParsed.unidad_familiar?.version === 2) {
        const sup1: SavedSupuesto = {
          id: 'sup-1-migrated',
          numero: 1,
          nombre: 'Supuesto 1',
          updatedAt: new Date().toISOString(),
          state: legacyParsed.unidad_familiar,
        };
        return {
          activeSupuestoId: sup1.id,
          nextSupuestoNumber: 2,
          supuestos: [sup1],
        };
      }
    }
  } catch {
    // Usar valores por defecto ante error de lectura
  }

  const first = createInitialSupuesto(1, 'unidad_familiar');
  return {
    activeSupuestoId: first.id,
    nextSupuestoNumber: 2,
    supuestos: [first],
  };
}

export default function App() {
  const [store, setStore] = useState<SupuestosWorkspaceStore>(loadInitialSupuestosStore);
  const [activeSection, setActiveSection] = useState<MainSection>('resumen');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('mes_actual');
  const [customStart, setCustomStart] = useState('2026-11-01');
  const [customEnd, setCustomEnd] = useState('2026-11-30');
  const [posterFullscreen, setPosterFullscreen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Ignorar errores de almacenamiento
    }
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem(SUPUESTOS_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Ignorar errores de almacenamiento
    }
  }, [store]);

  const activeSupuesto = useMemo(
    () =>
      store.supuestos.find((s) => s.id === store.activeSupuestoId) ?? store.supuestos[0],
    [store.supuestos, store.activeSupuestoId]
  );

  const activeState = activeSupuesto.state;
  const activeTemplateId = activeState.templateId;

  const updateActiveState = (updater: (prev: EconomyWorkspaceState) => EconomyWorkspaceState) => {
    setStore((prev) => ({
      ...prev,
      supuestos: prev.supuestos.map((sup) =>
        sup.id === activeSupuesto.id
          ? {
              ...sup,
              updatedAt: new Date().toISOString(),
              state: updater(sup.state),
            }
          : sup
      ),
    }));
  };

  const handleCreateNewSupuesto = () => {
    const nextNum = store.nextSupuestoNumber;
    const created = createInitialSupuesto(nextNum, activeTemplateId);
    setStore((prev) => ({
      activeSupuestoId: created.id,
      nextSupuestoNumber: nextNum + 1,
      supuestos: [...prev.supuestos, created],
    }));
  };

  const handleSaveSupuestoAs = (rawName: string) => {
    const trimmed = rawName.trim() || `Supuesto ${activeSupuesto.numero}`;
    setStore((prev) => {
      const current =
        prev.supuestos.find((s) => s.id === prev.activeSupuestoId) ?? prev.supuestos[0];

      // Si mantiene el nombre actual, actualiza el supuesto activo
      if (trimmed === current.nombre) {
        return {
          ...prev,
          supuestos: prev.supuestos.map((sup) =>
            sup.id === current.id
              ? { ...sup, updatedAt: new Date().toISOString() }
              : sup
          ),
        };
      }

      // Si introduce un nuevo nombre en "Guardar como", crea un nuevo supuesto numerado
      const nextNum = prev.nextSupuestoNumber;
      const cloned: SavedSupuesto = {
        id: `sup-${nextNum}-${Date.now()}`,
        numero: nextNum,
        nombre: trimmed,
        updatedAt: new Date().toISOString(),
        state: structuredClone(current.state),
      };

      return {
        activeSupuestoId: cloned.id,
        nextSupuestoNumber: nextNum + 1,
        supuestos: [...prev.supuestos, cloned],
      };
    });
  };

  const handleDeleteSupuesto = (id: string) => {
    setStore((prev) => {
      if (prev.supuestos.length <= 1) return prev;
      const remaining = prev.supuestos.filter((s) => s.id !== id);
      return {
        ...prev,
        activeSupuestoId:
          prev.activeSupuestoId === id ? remaining[0].id : prev.activeSupuestoId,
        supuestos: remaining,
      };
    });
  };

  const handleApplyWizard = (nextState: EconomyWorkspaceState, finalName: string) => {
    setStore((prev) => ({
      ...prev,
      supuestos: prev.supuestos.map((sup) =>
        sup.id === activeSupuesto.id
          ? {
              ...sup,
              nombre: finalName.trim() || sup.nombre,
              updatedAt: new Date().toISOString(),
              state: nextState,
            }
          : sup
      ),
    }));
    setWizardOpen(false);
  };

  const summary = useMemo(
    () => computeEconomySummary(activeState, periodPreset, customStart, customEnd),
    [activeState, periodPreset, customStart, customEnd]
  );

  const effectiveMortgageInput = useMemo<MortgageSimulationInput>(
    () => ({
      ...activeState.mortgageInput,
      ajustesSalarioFuturo: summary.ajustesSalarioFuturo,
    }),
    [activeState.mortgageInput, summary.ajustesSalarioFuturo]
  );

  const actingMember = activeState.members.find((m) => m.id === activeState.actingMemberId);
  const irpfHabilitado =
    activeTemplateId !== 'adolescente' && actingMember?.rol !== 'limitado';

  const adaptedProfileForIrpf = useMemo<ProfileDefinition>(() => {
    const meta = TEMPLATE_METADATA[activeTemplateId];
    return {
      id:
        activeTemplateId === 'unidad_familiar'
          ? 'unidad_familiar'
          : activeTemplateId === 'adulto_individual'
            ? 'hombre_adulto'
            : 'hombre_adolescente',
      mode: activeState.mode,
      nombre: meta.nombre,
      subtitulo: meta.subtitulo,
      descripcion: meta.descripcion,
      irpfHabilitado,
      hipotecaRecomendada: activeTemplateId === 'unidad_familiar',
      categorias: activeState.categories.map((c) => c.nombre),
      itemsIniciales: [],
    };
  }, [activeTemplateId, activeState.mode, activeState.categories, irpfHabilitado]);

  const handleAddMovement = (mov: Omit<FinancialMovement, 'id'>) => {
    const created: FinancialMovement = {
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ...mov,
    };
    updateActiveState((prev) => ({
      ...prev,
      movements: [created, ...prev.movements],
    }));
  };

  const handleUpdateMovement = (updated: FinancialMovement) => {
    updateActiveState((prev) => ({
      ...prev,
      movements: prev.movements.map((m) => (m.id === updated.id ? updated : m)),
    }));
  };

  const handleDeleteMovement = (id: string) => {
    updateActiveState((prev) => ({
      ...prev,
      movements: prev.movements.filter((m) => m.id !== id),
    }));
  };

  const handleConfirmMovement = (id: string) => {
    updateActiveState((prev) => ({
      ...prev,
      movements: prev.movements.map((m) =>
        m.id === id ? { ...m, estado: 'confirmado' } : m
      ),
    }));
  };

  const handleSyncIrpfFromEconomy = () => {
    const mortgageSim = simulateMortgageAndTreasury(effectiveMortgageInput);
    const firstYearSummary = mortgageSim.annualSummaries[0];
    const baseHipotecaAnual = firstYearSummary
      ? Math.round(
          firstYearSummary.baseFiscalAnio + effectiveMortgageInput.segurosVinculadosAnuales
        )
      : 0;

    const interesesCuentaAnual = firstYearSummary
      ? Math.round(firstYearSummary.interesesCuentaBrutos * 100) / 100
      : Math.round(
          effectiveMortgageInput.saldoInicialEfectivo *
            (effectiveMortgageInput.taeCuentaRemunerada / 100) *
            100
        ) / 100;

    let suministrosVivienda = 0;
    let retaPresupuesto = 0;

    for (const m of activeState.movements) {
      if (m.tipo !== 'gasto' || !m.esDeducibleAutonomo) continue;
      const annual = m.importe * recurrenceAnnualFactor(m.recurrencia);
      if (
        m.concepto.toLowerCase().includes('reta') ||
        m.subcategoria.toLowerCase().includes('reta')
      ) {
        retaPresupuesto += annual;
      } else {
        suministrosVivienda += annual;
      }
    }

    const curr = activeState.irpfInput;
    const haySegundo =
      curr.tipoUnidadFamiliar === 'matrimonio' || curr.tipoUnidadFamiliar === 'pareja_de_hecho';
    const d1Share = haySegundo ? 0.5 : 1;
    const d1Aportacion = Math.round(baseHipotecaAnual * d1Share);
    const d2Aportacion = haySegundo ? Math.round(baseHipotecaAnual * 0.5) : 0;
    const d1Interes = Math.round(interesesCuentaAnual * d1Share * 100) / 100;
    const d2Interes = haySegundo ? Math.round(interesesCuentaAnual * 0.5 * 100) / 100 : 0;

    const nextIrpf: IrpfSimulationInput = {
      ...curr,
      declarante1: {
        ...curr.declarante1,
        aportacionViviendaPre2013:
          baseHipotecaAnual > 0 ? d1Aportacion : curr.declarante1.aportacionViviendaPre2013,
        interesesCuentaRemunerada: d1Interes,
        retencionCapital19: Math.round(d1Interes * 0.19 * 100) / 100,
        suministrosViviendaAnuales:
          suministrosVivienda > 0
            ? Math.round(suministrosVivienda)
            : curr.declarante1.suministrosViviendaAnuales,
        cuotaRetaAnual:
          curr.declarante1.esAutonomo && retaPresupuesto > 0
            ? Math.round(retaPresupuesto)
            : curr.declarante1.cuotaRetaAnual,
      },
      declarante2: {
        ...curr.declarante2,
        aportacionViviendaPre2013:
          haySegundo && baseHipotecaAnual > 0
            ? d2Aportacion
            : curr.declarante2.aportacionViviendaPre2013,
        interesesCuentaRemunerada: d2Interes,
        retencionCapital19: Math.round(d2Interes * 0.19 * 100) / 100,
        suministrosViviendaAnuales:
          suministrosVivienda > 0
            ? Math.round(suministrosVivienda)
            : curr.declarante2.suministrosViviendaAnuales,
        cuotaRetaAnual:
          curr.declarante2.esAutonomo && retaPresupuesto > 0
            ? Math.round(retaPresupuesto)
            : curr.declarante2.cuotaRetaAnual,
      },
    };

    updateActiveState((prev) => ({ ...prev, irpfInput: nextIrpf }));
  };

  const handleExportReport = () => {
    const mortgageSummary = simulateMortgageAndTreasury(effectiveMortgageInput);
    const payload = {
      exportadoEl: new Date().toISOString(),
      supuesto: {
        numero: activeSupuesto.numero,
        nombre: activeSupuesto.nombre,
      },
      plantilla: TEMPLATE_METADATA[activeTemplateId].nombre,
      resumenPeriodo: summary.periodRange,
      totales: {
        ingresos: summary.ingresosPeriodo,
        gastos: summary.gastosPeriodo,
        ahorroNeto: summary.ahorroNetoPeriodo,
        totalEnCuentas: summary.totalEnCuentas,
        totalReservadoFondos: summary.totalReservadoFondos,
        dineroRealmenteDisponible: summary.dineroRealmenteDisponible,
      },
      miembros: activeState.members,
      cuentas: activeState.accounts,
      fondosReservados: activeState.savingsGoals,
      movimientos: activeState.movements,
      simulacionIRPF: activeState.irpfInput,
      simulacionHipotecaYTesoreria: {
        parametros: effectiveMortgageInput,
        fechaCancelacionExacta: mortgageSummary.fechaCancelacionExacta,
        totalPrincipalPagado: mortgageSummary.totalPrincipalPagado,
        totalInteresesBancarios: mortgageSummary.totalInteresesBancarios,
        ahorroInteresesBancarios: mortgageSummary.ahorroInteresesBancarios,
        totalDevolucionesAEAT: mortgageSummary.totalDevolucionesAEAT,
        saldoFinalCuentaRemunerada: mortgageSummary.saldoFinalCuentaRemunerada,
        resumenAnual: mortgageSummary.annualSummaries,
      },
    };
    downloadTextFile(
      `${activeSupuesto.nombre.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8;'
    );
  };

  const navItems: { id: MainSection; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'cuentas', label: 'Cuentas' },
    { id: 'hipoteca', label: 'Hipoteca' },
    { id: 'irpf', label: 'Renta IRPF' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Bar Contract: estrictamente 3 zonas con gap-8 */}
      <header className="no-print border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-4">
          {/* Zona 1: Brand wordmark en una línea */}
          <button
            type="button"
            onClick={() => {
              setActiveSection('resumen');
              setPosterFullscreen(false);
            }}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white"
          >
            Patrimonio &amp; IRPF España
          </button>

          {/* Zona 2: 5 enlaces de navegación en una línea */}
          <nav className="hidden items-center gap-6 md:flex" aria-label="Navegación principal">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveSection(item.id);
                  setPosterFullscreen(false);
                }}
                className={`border-b-2 py-1 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeSection === item.id
                    ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zona 3: 1 acción principal */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setActiveSection('poster')}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeSection === 'poster'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-blue-700 text-white hover:bg-blue-800'
              }`}
            >
              Póster Landscape
            </button>
          </div>
        </div>
      </header>

      {/* Navegación móvil compacta */}
      <div className="no-print flex overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 md:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex gap-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap shrink-0 ${
                activeSection === item.id
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Barra del Espacio de Trabajo: Modalidad, Alcance por Miembro, Control de Permisos y Tema */}
      <section className="no-print border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            {(
              ['unidad_familiar', 'adulto_individual', 'adolescente'] as TemplateId[]
            ).map((tpl) => (
              <button
                key={tpl}
                type="button"
                onClick={() => {
                  if (tpl !== activeTemplateId) {
                    updateActiveState(() => createEconomyTemplateState(tpl));
                  }
                }}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTemplateId === tpl
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {TEMPLATE_METADATA[tpl].nombre}
              </button>
            ))}

            <button
              type="button"
              onClick={() => updateActiveState(() => createEconomyTemplateState(activeTemplateId))}
              title="Restaurar datos base de esta modalidad"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeState.members.length > 1 && (
              <>
                <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                  <span>Ver:</span>
                  <select
                    value={activeState.activeMemberScope}
                    onChange={(e) =>
                      updateActiveState((prev) => ({
                        ...prev,
                        activeMemberScope: e.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="todos">Todo el hogar</option>
                    {activeState.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                  <span>Operando como:</span>
                  <select
                    value={activeState.actingMemberId}
                    onChange={(e) =>
                      updateActiveState((prev) => ({
                        ...prev,
                        actingMemberId: e.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {activeState.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre} ({m.rol})
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </section>

      {/* Contenido Principal */}
      <main className="mx-auto max-w-[1440px] px-6 py-7">
        {activeSection === 'resumen' && (
          <OverviewDashboard
            state={activeState}
            summary={summary}
            periodPreset={periodPreset}
            customStart={customStart}
            customEnd={customEnd}
            supuestos={store.supuestos}
            activeSupuesto={activeSupuesto}
            nextSupuestoNumber={store.nextSupuestoNumber}
            onOpenWizard={() => setWizardOpen(true)}
            onSelectSupuesto={(id) =>
              setStore((prev) => ({ ...prev, activeSupuestoId: id }))
            }
            onSaveSupuestoAs={handleSaveSupuestoAs}
            onCreateNewSupuesto={handleCreateNewSupuesto}
            onDeleteSupuesto={handleDeleteSupuesto}
            onChangePeriod={setPeriodPreset}
            onChangeCustomRange={(start, end) => {
              setCustomStart(start);
              setCustomEnd(end);
            }}
            onQuickAddMovement={handleAddMovement}
            onConfirmMovement={handleConfirmMovement}
            onNavigate={(sec) => setActiveSection(sec)}
          />
        )}

        {activeSection === 'movimientos' && (
          <MovementsLedger
            state={activeState}
            summary={summary}
            periodPreset={periodPreset}
            onChangePeriod={setPeriodPreset}
            onAddMovement={handleAddMovement}
            onUpdateMovement={handleUpdateMovement}
            onDeleteMovement={handleDeleteMovement}
            onConfirmMovement={handleConfirmMovement}
          />
        )}

        {activeSection === 'cuentas' && (
          <AccountsAndFunds
            state={activeState}
            summary={summary}
            onUpdateAccounts={(accounts) =>
              updateActiveState((prev) => ({ ...prev, accounts }))
            }
            onUpdateGoals={(savingsGoals) =>
              updateActiveState((prev) => ({ ...prev, savingsGoals }))
            }
            onUpdateCategories={(categories) =>
              updateActiveState((prev) => ({ ...prev, categories }))
            }
            onUpdateMembers={(members) =>
              updateActiveState((prev) => ({ ...prev, members }))
            }
            onAddMovement={handleAddMovement}
          />
        )}

        {activeSection === 'hipoteca' && (
          <MortgageTreasurySimulator
            input={effectiveMortgageInput}
            budgetFreeCashflowPreMortgage={summary.capacidadAhorroPreHipotecaMensual}
            onUpdateInput={(mortgageInput) =>
              updateActiveState((prev) => ({ ...prev, mortgageInput }))
            }
            onOpenPosterMode={() => {
              setActiveSection('poster');
              setPosterFullscreen(true);
            }}
          />
        )}

        {activeSection === 'irpf' && (
          <IrpfSimulator
            profile={adaptedProfileForIrpf}
            irpfInput={activeState.irpfInput}
            onUpdateIrpf={(irpfInput) =>
              updateActiveState((prev) => ({ ...prev, irpfInput }))
            }
            onSyncFromBudgetAndMortgage={handleSyncIrpfFromEconomy}
          />
        )}

        {activeSection === 'poster' && (
          <PosterLandscapeView
            title={`${activeSupuesto.nombre} · ${TEMPLATE_METADATA[activeTemplateId].nombre}`}
            irpfHabilitado={irpfHabilitado}
            state={activeState}
            summary={summary}
            effectiveMortgageInput={effectiveMortgageInput}
            isFullscreen={posterFullscreen}
            onToggleFullscreen={() => setPosterFullscreen((prev) => !prev)}
            onExportReport={handleExportReport}
          />
        )}
      </main>

      {/* Asistente Guiado paso a paso lanzado desde el botón "Iniciar" del Dashboard */}
      {wizardOpen && (
        <SetupWizardModal
          initialState={activeState}
          initialSupuestoName={activeSupuesto.nombre}
          onClose={() => setWizardOpen(false)}
          onApply={handleApplyWizard}
        />
      )}
    </div>
  );
}
