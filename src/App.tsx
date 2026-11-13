import { useEffect, useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { BudgetWorkspace } from './components/BudgetWorkspace';
import { IrpfSimulator } from './components/IrpfSimulator';
import { MortgageTreasurySimulator } from './components/MortgageTreasurySimulator';
import { PosterLandscapeView } from './components/PosterLandscapeView';
import { PROFILES_LIST, createInitialProfileState } from './data/profilesData';
import { simulateMortgageAndTreasury } from './engines/mortgageEngine';
import {
  ActiveTab,
  AppMode,
  BudgetItem,
  IrpfSimulationInput,
  MortgageSimulationInput,
  ProfileId,
  ProfileState,
} from './types/finance';
import {
  downloadTextFile,
  toAnnualAmount,
  toMonthlyEquivalent,
} from './utils/formatters';

const STORAGE_KEY = 'patrimonio_irpf_profiles_v1';
const THEME_KEY = 'patrimonio_irpf_theme_v1';

type ProfilesStore = Record<ProfileId, ProfileState>;

function loadInitialStore(): ProfilesStore {
  const defaults: ProfilesStore = {
    unidad_familiar: createInitialProfileState('unidad_familiar'),
    hombre_adulto: createInitialProfileState('hombre_adulto'),
    mujer_adulta: createInitialProfileState('mujer_adulta'),
    hombre_adolescente: createInitialProfileState('hombre_adolescente'),
    mujer_adolescente: createInitialProfileState('mujer_adolescente'),
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<ProfilesStore>;
    return {
      unidad_familiar: parsed.unidad_familiar ?? defaults.unidad_familiar,
      hombre_adulto: parsed.hombre_adulto ?? defaults.hombre_adulto,
      mujer_adulta: parsed.mujer_adulta ?? defaults.mujer_adulta,
      hombre_adolescente: parsed.hombre_adolescente ?? defaults.hombre_adolescente,
      mujer_adolescente: parsed.mujer_adolescente ?? defaults.mujer_adolescente,
    };
  } catch {
    return defaults;
  }
}

export default function App() {
  const [store, setStore] = useState<ProfilesStore>(loadInitialStore);
  const [activeProfileId, setActiveProfileId] = useState<ProfileId>('unidad_familiar');
  const [activeTab, setActiveTab] = useState<ActiveTab>('presupuesto');
  const [posterFullscreen, setPosterFullscreen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Ignorar errores de almacenamiento restringido
    }
  }, [darkMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Ignorar errores de almacenamiento restringido
    }
  }, [store]);

  const activeProfileDef = useMemo(
    () => PROFILES_LIST.find((p) => p.id === activeProfileId) ?? PROFILES_LIST[0],
    [activeProfileId]
  );

  const activeState = store[activeProfileId];
  const activeMode: AppMode = activeProfileDef.mode;

  const budgetFreeCashflowPreMortgage = useMemo(() => {
    let ingresos = 0;
    let gastosSinHipoteca = 0;
    for (const item of activeState.budgetItems) {
      if (!item.activo) continue;
      const eq = toMonthlyEquivalent(item.importe, item.frecuencia);
      if (item.tipo === 'ingreso') {
        ingresos += eq;
      } else if (!item.esHipoteca) {
        gastosSinHipoteca += eq;
      }
    }
    return ingresos - gastosSinHipoteca;
  }, [activeState.budgetItems]);

  const handleModeSwitch = (mode: AppMode) => {
    if (mode === 'familiar') {
      setActiveProfileId('unidad_familiar');
    } else if (activeProfileDef.mode !== 'personal') {
      setActiveProfileId('hombre_adulto');
    }
  };

  const updateBudgetItems = (items: BudgetItem[]) => {
    setStore((prev) => ({
      ...prev,
      [activeProfileId]: {
        ...prev[activeProfileId],
        budgetItems: items,
      },
    }));
  };

  const updateIrpfInput = (irpfInput: IrpfSimulationInput) => {
    setStore((prev) => ({
      ...prev,
      [activeProfileId]: {
        ...prev[activeProfileId],
        irpfInput,
      },
    }));
  };

  const updateMortgageInput = (mortgageInput: MortgageSimulationInput) => {
    setStore((prev) => ({
      ...prev,
      [activeProfileId]: {
        ...prev[activeProfileId],
        mortgageInput,
      },
    }));
  };

  const handleResetProfile = () => {
    setStore((prev) => ({
      ...prev,
      [activeProfileId]: createInitialProfileState(activeProfileId),
    }));
  };

  const handleSyncIrpfFromBudgetAndMortgage = () => {
    const mortgageSim = simulateMortgageAndTreasury(activeState.mortgageInput);
    const firstYearSummary = mortgageSim.annualSummaries[0];
    const baseHipotecaAnual = firstYearSummary
      ? Math.round(firstYearSummary.baseFiscalAnio + activeState.mortgageInput.segurosVinculadosAnuales)
      : 0;
    const interesesCuentaAnual = firstYearSummary
      ? Math.round(firstYearSummary.interesesCuentaBrutos * 100) / 100
      : Math.round(
          activeState.mortgageInput.saldoInicialEfectivo *
            (activeState.mortgageInput.taeCuentaRemunerada / 100) *
            100
        ) / 100;

    let suministrosVivienda = 0;
    let retaPresupuesto = 0;
    for (const item of activeState.budgetItems) {
      if (!item.activo) continue;
      if (item.esDeducibleAutonomo) {
        if (item.nombre.toLowerCase().includes('reta') || item.nombre.toLowerCase().includes('autónomos')) {
          retaPresupuesto += toAnnualAmount(item.importe, item.frecuencia);
        } else {
          suministrosVivienda += toAnnualAmount(item.importe, item.frecuencia);
        }
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

    updateIrpfInput({
      ...curr,
      declarante1: {
        ...curr.declarante1,
        aportacionViviendaPre2013:
          baseHipotecaAnual > 0 ? d1Aportacion : curr.declarante1.aportacionViviendaPre2013,
        interesesCuentaRemunerada: d1Interes,
        retencionCapital19: Math.round(d1Interes * 0.19 * 100) / 100,
        suministrosViviendaAnuales:
          suministrosVivienda > 0 ? Math.round(suministrosVivienda) : curr.declarante1.suministrosViviendaAnuales,
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
          suministrosVivienda > 0 ? Math.round(suministrosVivienda) : curr.declarante2.suministrosViviendaAnuales,
        cuotaRetaAnual:
          curr.declarante2.esAutonomo && retaPresupuesto > 0
            ? Math.round(retaPresupuesto)
            : curr.declarante2.cuotaRetaAnual,
      },
    });
  };

  const handleExportReport = () => {
    const mortgageSummary = simulateMortgageAndTreasury(activeState.mortgageInput);
    const payload = {
      exportadoEl: new Date().toISOString(),
      perfil: activeProfileDef.nombre,
      modalidad: activeProfileDef.mode,
      presupuestoCOICOP: activeState.budgetItems,
      simulacionIRPF: activeState.irpfInput,
      simulacionHipotecaYTesoreria: {
        parametros: activeState.mortgageInput,
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
      `informe-${activeProfileId}-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8;'
    );
  };

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'presupuesto', label: 'Presupuesto' },
    { id: 'irpf', label: 'Renta IRPF' },
    { id: 'hipoteca', label: 'Hipoteca y Tesorería' },
    { id: 'poster', label: 'Póster Landscape' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Bar Contract: estrictamente 3 zonas con gap-8 */}
      <header className="no-print border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-4">
          {/* Zona 1: Brand wordmark en una línea */}
          <button
            type="button"
            onClick={() => setActiveTab('presupuesto')}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white"
          >
            Patrimonio &amp; IRPF España
          </button>

          {/* Zona 2: 4 enlaces de navegación en una línea */}
          <nav className="hidden items-center gap-6 md:flex" aria-label="Navegación principal">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id !== 'poster') setPosterFullscreen(false);
                }}
                className={`border-b-2 py-1 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === item.id
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
              onClick={handleExportReport}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
            >
              Exportar Informe
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
              onClick={() => setActiveTab(item.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Barra de Herramientas del Espacio de Trabajo: Selector de Modalidad (Familiar / Personal) y 5 Perfiles */}
      <section className="no-print border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            {/* Selector Modalidad */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => handleModeSwitch('familiar')}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeMode === 'familiar'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Modo Familiar
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('personal')}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeMode === 'personal'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Modo Personal
              </button>
            </div>

            <span className="hidden text-slate-300 sm:inline dark:text-slate-700" aria-hidden="true">
              /
            </span>

            {/* Selector 5 Perfiles */}
            <div className="flex flex-wrap items-center gap-1.5">
              {PROFILES_LIST.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveProfileId(p.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeProfileId === p.id
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {p.nombre.replace('Personal · ', '')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 xl:inline dark:text-slate-400">
              {activeProfileDef.subtitulo}
            </span>
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
        {activeTab === 'presupuesto' && (
          <BudgetWorkspace
            profile={activeProfileDef}
            items={activeState.budgetItems}
            onUpdateItems={updateBudgetItems}
            onResetProfile={handleResetProfile}
            onNavigateMortgage={() => setActiveTab('hipoteca')}
          />
        )}

        {activeTab === 'irpf' && (
          <IrpfSimulator
            profile={activeProfileDef}
            irpfInput={activeState.irpfInput}
            onUpdateIrpf={updateIrpfInput}
            onSyncFromBudgetAndMortgage={handleSyncIrpfFromBudgetAndMortgage}
          />
        )}

        {activeTab === 'hipoteca' && (
          <MortgageTreasurySimulator
            input={activeState.mortgageInput}
            budgetFreeCashflowPreMortgage={budgetFreeCashflowPreMortgage}
            onUpdateInput={updateMortgageInput}
            onOpenPosterMode={() => {
              setActiveTab('poster');
              setPosterFullscreen(true);
            }}
          />
        )}

        {activeTab === 'poster' && (
          <PosterLandscapeView
            profile={activeProfileDef}
            state={activeState}
            isFullscreen={posterFullscreen}
            onToggleFullscreen={() => setPosterFullscreen((prev) => !prev)}
          />
        )}
      </main>
    </div>
  );
}
