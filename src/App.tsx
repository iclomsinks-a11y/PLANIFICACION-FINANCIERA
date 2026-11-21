import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { FlaskConical, MessageCircle, Moon, RotateCcw, Sun } from 'lucide-react';
import { AccountsAndFunds } from './components/AccountsAndFunds';
import { FinancialAdvisorPanel } from './components/FinancialAdvisorPanel';
import { GeminiAssistantPanel } from './components/GeminiAssistantPanel';
import { GestarianLandingView } from './components/GestarianLandingView';
import { GmailInvoicesPanel } from './components/GmailInvoicesPanel';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { IrpfSimulator } from './components/IrpfSimulator';
import { MortgageTreasurySimulator } from './components/MortgageTreasurySimulator';
import { MovementsLedger } from './components/MovementsLedger';
import { OverviewDashboard } from './components/OverviewDashboard';
import { PosterLandscapeView } from './components/PosterLandscapeView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ScenarioComparator } from './components/ScenarioComparator';
import { SetupWizardModal } from './components/SetupWizardModal';
import { TestFamilyAccessModal } from './components/TestFamilyAccessModal';
import {
  TEMPLATE_METADATA,
  createEconomyTemplateState,
} from './data/economyTemplates';
import {
  computeEconomySummary,
  processDueCardAutoRecharges,
} from './engines/economyEngine';
import { simulateMortgageAndTreasury } from './engines/mortgageEngine';
import {
  clearCachedGmailToken,
  emailRegister,
  emailSignIn,
  firebaseLogout,
  formatEmailAuthError,
  formatGoogleAuthError,
  getCachedGmailToken,
  googleSignIn,
  subscribeAuth,
  testFirestoreConnection,
} from './firebase';
import {
  deleteSupuestoFromCloud,
  loadUserCloudWorkspace,
  saveSupuestoToCloud,
  saveUserWorkspaceMeta,
} from './services/cloudSyncService';
import { DetectedEmailInvoice, scanGmailForInvoices } from './services/gmailService';
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
const DISMISSED_GMAIL_KEY = 'patrimonio_irpf_dismissed_gmail_v1';
const THEME_KEY = 'patrimonio_irpf_theme_v1';
const PORTRAIT_SCROLL_MEDIA_QUERY =
  '(max-width: 767px), ((max-width: 1024px) and (orientation: portrait))';

const SECTION_ORDER: MainSection[] = [
  'resumen',
  'movimientos',
  'cuentas',
  'comparador',
  'hipoteca',
  'irpf',
  'poster',
];

const SECTION_LABELS: Record<MainSection, string> = {
  resumen: 'Resumen',
  movimientos: 'Movimientos',
  cuentas: 'Cuentas',
  comparador: 'Comparador',
  hipoteca: 'Hipoteca',
  irpf: 'IRPF',
  asesor: 'Asesor IA',
  poster: 'Póster',
};

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

function loadInitialDismissedGmailIds(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_GMAIL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignorar error de lectura
  }
  return [];
}

export default function App() {
  const [store, setStore] = useState<SupuestosWorkspaceStore>(loadInitialSupuestosStore);
  const [showLanding, setShowLanding] = useState<boolean>(true);
  const [activeSection, setActiveSection] = useState<MainSection>('resumen');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('mes_actual');
  const [customStart, setCustomStart] = useState('2026-11-01');
  const [customEnd, setCustomEnd] = useState('2026-11-30');
  const [posterFullscreen, setPosterFullscreen] = useState(false);
  const [advisorChatOpen, setAdvisorChatOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [testAccessModalOpen, setTestAccessModalOpen] = useState(false);
  const [isPortraitScrollViewport, setIsPortraitScrollViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(PORTRAIT_SCROLL_MEDIA_QUERY).matches;
  });

  const horizontalTrackRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const programmaticTimerRef = useRef<number | null>(null);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const mobileNavTabRefs = useRef<Partial<Record<MainSection, HTMLButtonElement | null>>>({});

  // Fase 7: Asistente Gemini & OCR de tickets
  const [geminiModalOpen, setGeminiModalOpen] = useState(false);
  const [geminiInitialMode, setGeminiInitialMode] = useState<'texto' | 'ocr'>('texto');

  // Gmail Invoice Scanner
  const [gmailPanelOpen, setGmailPanelOpen] = useState(false);
  const [gmailToken, setGmailToken] = useState<string | null>(() => getCachedGmailToken());
  const [gmailScanning, setGmailScanning] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [detectedEmailInvoices, setDetectedEmailInvoices] = useState<DetectedEmailInvoice[]>([]);
  const [dismissedGmailIds, setDismissedGmailIds] = useState<string[]>(
    loadInitialDismissedGmailIds
  );

  // Fase 8: Firebase Auth + Cloud Sync
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'synced' | 'error'>('local');
  const cloudHydratedRef = useRef(false);

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

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_GMAIL_KEY, JSON.stringify(dismissedGmailIds));
    } catch {
      // Ignorar errores de almacenamiento
    }
  }, [dismissedGmailIds]);

  // Prueba inicial obligatoria de conexión Firestore
  useEffect(() => {
    void testFirestoreConnection();
  }, []);

  // Recarga automática mensual periódica de tarjetas (hasta alcanzar su límite disponible)
  useEffect(() => {
    updateActiveState((prev) => {
      const res = processDueCardAutoRecharges(prev);
      return res.appliedCount > 0 || res.nextState !== prev ? res.nextState : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.activeSupuestoId]);

  // Detección de móvil y tablet portrait para habilitar scroll lateral entre secciones
  useEffect(() => {
    const mql = window.matchMedia(PORTRAIT_SCROLL_MEDIA_QUERY);
    const updateMatch = () => setIsPortraitScrollViewport(mql.matches);
    updateMatch();
    mql.addEventListener('change', updateMatch);
    window.addEventListener('resize', updateMatch);
    return () => {
      mql.removeEventListener('change', updateMatch);
      window.removeEventListener('resize', updateMatch);
    };
  }, []);

  // Sincronización inicial al entrar desde portada o al cambiar a portrait
  useEffect(() => {
    if (showLanding || !isPortraitScrollViewport) return;
    const track = horizontalTrackRef.current;
    if (!track) return;
    const idx = SECTION_ORDER.indexOf(activeSection);
    if (idx < 0) return;
    const targetLeft = idx * track.clientWidth;
    if (Math.abs(track.scrollLeft - targetLeft) > 4) {
      programmaticScrollRef.current = true;
      track.scrollTo({ left: targetLeft, behavior: 'auto' });
      if (programmaticTimerRef.current) window.clearTimeout(programmaticTimerRef.current);
      programmaticTimerRef.current = window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 150);
    }
    mobileNavTabRefs.current[activeSection]?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [showLanding, isPortraitScrollViewport, activeSection]);

  const activeSupuesto = useMemo(
    () =>
      store.supuestos.find((s) => s.id === store.activeSupuestoId) ?? store.supuestos[0],
    [store.supuestos, store.activeSupuestoId]
  );

  const activeState = activeSupuesto.state;
  const activeTemplateId = activeState.templateId;

  const processedGmailIdsSet = useMemo(() => {
    const set = new Set<string>(dismissedGmailIds);
    for (const sup of store.supuestos) {
      for (const mov of sup.state.movements) {
        if (mov.gmailMessageId) set.add(mov.gmailMessageId);
      }
    }
    return set;
  }, [dismissedGmailIds, store.supuestos]);

  const runGmailScan = useCallback(
    async (token: string) => {
      setGmailScanning(true);
      setGmailError(null);
      try {
        const items = await scanGmailForInvoices(
          token,
          activeState.categories,
          processedGmailIdsSet
        );
        setDetectedEmailInvoices(items);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo consultar Gmail. Vuelve a conectar tu cuenta.';
        if (msg.includes('(401)') || msg.includes('(403)')) {
          clearCachedGmailToken();
          setGmailToken(null);
          setGmailError(
            'Tu permiso de Gmail ha caducado o no incluye lectura de mensajes. Pulsa «Conectar Gmail con Google» y autoriza la lectura.'
          );
        } else {
          setGmailError(msg);
        }
      } finally {
        setGmailScanning(false);
      }
    },
    [activeState.categories, processedGmailIdsSet]
  );

  // Suscripción a Firebase Auth e hidratación inicial desde Firestore
  useEffect(() => {
    const unsubscribe = subscribeAuth(async (authUser, token) => {
      setUser(authUser);
      setGmailToken(token);

      if (!authUser) {
        cloudHydratedRef.current = false;
        setSyncStatus('local');
        return;
      }

      setSyncStatus('syncing');
      try {
        const cloudData = await loadUserCloudWorkspace(authUser.uid);
        if (cloudData.store) {
          setStore(cloudData.store);
          if (cloudData.dismissedGmailIds.length > 0) {
            setDismissedGmailIds((prev) =>
              Array.from(new Set([...prev, ...cloudData.dismissedGmailIds]))
            );
          }
        } else {
          // Subir el supuesto local inicial a la nube del usuario recién autenticado
          await saveUserWorkspaceMeta(
            authUser,
            store.activeSupuestoId,
            store.nextSupuestoNumber,
            dismissedGmailIds
          );
          for (const sup of store.supuestos) {
            await saveSupuestoToCloud(authUser.uid, sup);
          }
        }
        cloudHydratedRef.current = true;
        setSyncStatus('synced');
      } catch {
        setSyncStatus('error');
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincronización automática con Firestore al modificar el supuesto activo cuando hay sesión
  useEffect(() => {
    if (!user || !cloudHydratedRef.current) return;

    const timer = window.setTimeout(async () => {
      setSyncStatus('syncing');
      try {
        await saveUserWorkspaceMeta(
          user,
          store.activeSupuestoId,
          store.nextSupuestoNumber,
          dismissedGmailIds
        );
        await saveSupuestoToCloud(user.uid, activeSupuesto);
        setSyncStatus('synced');
      } catch {
        setSyncStatus('error');
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [user, store.activeSupuestoId, store.nextSupuestoNumber, activeSupuesto, dismissedGmailIds]);

  const handleGoogleSignIn = async (includeGmail = false): Promise<boolean> => {
    setAuthLoading(true);
    setAuthNotice(null);
    if (includeGmail) setGmailError(null);
    try {
      const { accessToken } = await googleSignIn(includeGmail);
      if (includeGmail) {
        if (accessToken) {
          setGmailToken(accessToken);
          void runGmailScan(accessToken);
        } else {
          setGmailError(
            'Has iniciado sesión con Google, pero no se concedió el permiso de lectura de Gmail. Vuelve a pulsar «Conectar Gmail con Google» y marca la casilla de permiso.'
          );
        }
      }
      return true;
    } catch (err) {
      const { message } = formatGoogleAuthError(err, includeGmail);
      if (includeGmail) {
        setGmailError(message);
      }
      if (!includeGmail || !gmailPanelOpen) {
        setAuthNotice(message);
      }
      return false;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await firebaseLogout();
    setAuthNotice(null);
    setGmailToken(null);
    setGmailError(null);
    setDetectedEmailInvoices([]);
  };

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
    if (user) {
      void saveSupuestoToCloud(user.uid, created);
    }
  };

  const handleSaveSupuestoAs = (rawName: string) => {
    const trimmed = rawName.trim() || `Supuesto ${activeSupuesto.numero}`;
    setStore((prev) => {
      const current =
        prev.supuestos.find((s) => s.id === prev.activeSupuestoId) ?? prev.supuestos[0];

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

      const nextNum = prev.nextSupuestoNumber;
      const cloned: SavedSupuesto = {
        id: `sup-${nextNum}-${Date.now()}`,
        numero: nextNum,
        nombre: trimmed,
        updatedAt: new Date().toISOString(),
        state: structuredClone(current.state),
      };

      if (user) {
        void saveSupuestoToCloud(user.uid, cloned);
      }

      return {
        activeSupuestoId: cloned.id,
        nextSupuestoNumber: nextNum + 1,
        supuestos: [...prev.supuestos, cloned],
      };
    });
  };

  const handleSaveWhatIfAsSupuesto = (
    name: string,
    nextMortgageInput: MortgageSimulationInput,
    deltaMonthlyExpense: number
  ) => {
    const nextNum = store.nextSupuestoNumber;
    const clonedState = structuredClone(activeState);
    clonedState.mortgageInput = nextMortgageInput;
    if (deltaMonthlyExpense !== 0) {
      clonedState.movements.unshift({
        id: `mov-whatif-${Date.now()}`,
        tipo: deltaMonthlyExpense > 0 ? 'gasto' : 'ingreso',
        importe: Math.abs(deltaMonthlyExpense),
        fecha: '2026-11-13',
        concepto:
          deltaMonthlyExpense > 0
            ? 'Ajuste incremento gasto mensual (escenario ¿Y si?)'
            : 'Ahorro adicional mensual (escenario ¿Y si?)',
        categoriaId: deltaMonthlyExpense > 0 ? 'cat-extraordinarios' : 'cat-ingresos',
        subcategoria: deltaMonthlyExpense > 0 ? 'Pagos extraordinarios' : 'Otros ingresos',
        cuentaId: clonedState.accounts[0]?.id ?? '',
        miembroId: clonedState.actingMemberId,
        visibilidad: clonedState.mode === 'familiar' ? 'compartida' : 'privada',
        recurrencia: 'mensual',
        estado: 'confirmado',
      });
    }

    const created: SavedSupuesto = {
      id: `sup-${nextNum}-${Date.now()}`,
      numero: nextNum,
      nombre: name,
      updatedAt: new Date().toISOString(),
      state: clonedState,
    };

    setStore((prev) => ({
      activeSupuestoId: created.id,
      nextSupuestoNumber: nextNum + 1,
      supuestos: [...prev.supuestos, created],
    }));

    if (user) {
      void saveSupuestoToCloud(user.uid, created);
    }
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
    if (user) {
      void deleteSupuestoFromCloud(user.uid, id);
    }
  };

  const handleLoadTestFamilySupuesto = () => {
    const nextNum = store.nextSupuestoNumber;
    const created = createInitialSupuesto(
      nextNum,
      'unidad_familiar',
      'Unidad Familiar de Prueba'
    );
    setStore((prev) => ({
      activeSupuestoId: created.id,
      nextSupuestoNumber: nextNum + 1,
      supuestos: [...prev.supuestos, created],
    }));
    if (user) {
      void saveSupuestoToCloud(user.uid, created);
    }
  };

  const handleSwitchActingMember = (memberId: string) => {
    updateActiveState((prev) => {
      const target = prev.members.find((m) => m.id === memberId);
      const nextScope =
        target?.rol === 'limitado'
          ? memberId
          : target?.rol === 'admin' || target?.autorizadoVerTodo
            ? 'todos'
            : prev.activeMemberScope;
      return {
        ...prev,
        actingMemberId: memberId,
        activeMemberScope: nextScope,
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

  const navigateToSection = useCallback(
    (sec: MainSection) => {
      if (sec === 'asesor') {
        setAdvisorChatOpen(true);
        return;
      }
      setActiveSection(sec);
      setPosterFullscreen(false);
      if (isPortraitScrollViewport && horizontalTrackRef.current) {
        const idx = SECTION_ORDER.indexOf(sec);
        if (idx >= 0) {
          programmaticScrollRef.current = true;
          horizontalTrackRef.current.scrollTo({
            left: idx * horizontalTrackRef.current.clientWidth,
            behavior: 'smooth',
          });
          if (programmaticTimerRef.current) {
            window.clearTimeout(programmaticTimerRef.current);
          }
          programmaticTimerRef.current = window.setTimeout(() => {
            programmaticScrollRef.current = false;
          }, 500);
        }
      }
      mobileNavTabRefs.current[sec]?.scrollIntoView({
        inline: 'center',
        block: 'nearest',
        behavior: 'smooth',
      });
    },
    [isPortraitScrollViewport]
  );

  const handleHorizontalTrackScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    const track = horizontalTrackRef.current;
    if (!track || track.clientWidth <= 0) return;

    if (scrollSyncTimerRef.current) {
      window.clearTimeout(scrollSyncTimerRef.current);
    }
    scrollSyncTimerRef.current = window.setTimeout(() => {
      const idx = Math.max(
        0,
        Math.min(
          SECTION_ORDER.length - 1,
          Math.round(track.scrollLeft / Math.max(1, track.clientWidth))
        )
      );
      const nextSection = SECTION_ORDER[idx];
      if (nextSection && nextSection !== activeSection) {
        setActiveSection(nextSection);
        setPosterFullscreen(false);
        mobileNavTabRefs.current[nextSection]?.scrollIntoView({
          inline: 'center',
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }, 85);
  }, [activeSection]);

  const navItems: { id: MainSection; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'cuentas', label: 'Cuentas' },
    { id: 'comparador', label: 'Comparador' },
    { id: 'hipoteca', label: 'Hipoteca' },
    { id: 'irpf', label: 'IRPF' },
  ];

  const renderSectionContent = (section: MainSection) => {
    if (section === 'resumen') {
      return (
        <OverviewDashboard
          state={activeState}
          summary={summary}
          periodPreset={periodPreset}
          customStart={customStart}
          customEnd={customEnd}
          supuestos={store.supuestos}
          activeSupuesto={activeSupuesto}
          nextSupuestoNumber={store.nextSupuestoNumber}
          pendingGmailInvoicesCount={detectedEmailInvoices.length}
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
          onToggleProrratearGastos={() =>
            updateActiveState((prev) => ({
              ...prev,
              prorratearGastos: !prev.prorratearGastos,
            }))
          }
          onQuickAddMovement={handleAddMovement}
          onConfirmMovement={handleConfirmMovement}
          onNavigate={navigateToSection}
          onOpenGeminiAssistant={(mode) => {
            setGeminiInitialMode(mode);
            setGeminiModalOpen(true);
          }}
          onOpenGmailScanner={() => setGmailPanelOpen(true)}
          onOpenTestFamilyModal={() => setTestAccessModalOpen(true)}
        />
      );
    }

    if (section === 'movimientos') {
      return (
        <MovementsLedger
          state={activeState}
          summary={summary}
          periodPreset={periodPreset}
          pendingGmailCount={detectedEmailInvoices.length}
          onChangePeriod={setPeriodPreset}
          onToggleProrratearGastos={() =>
            updateActiveState((prev) => ({
              ...prev,
              prorratearGastos: !prev.prorratearGastos,
            }))
          }
          onAddMovement={handleAddMovement}
          onUpdateMovement={handleUpdateMovement}
          onDeleteMovement={handleDeleteMovement}
          onConfirmMovement={handleConfirmMovement}
          onOpenGeminiAssistant={(mode) => {
            setGeminiInitialMode(mode);
            setGeminiModalOpen(true);
          }}
          onOpenGmailScanner={() => setGmailPanelOpen(true)}
        />
      );
    }

    if (section === 'cuentas') {
      return (
        <AccountsAndFunds
          state={activeState}
          summary={summary}
          onUpdateAccounts={(accounts) =>
            updateActiveState((prev) => {
              const nextState = { ...prev, accounts };
              if (accounts.length > prev.accounts.length) {
                return processDueCardAutoRecharges(nextState).nextState;
              }
              return nextState;
            })
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
          onTriggerCardRecharge={(accountId) =>
            updateActiveState(
              (prev) => processDueCardAutoRecharges(prev, undefined, accountId).nextState
            )
          }
        />
      );
    }

    if (section === 'comparador') {
      return (
        <ScenarioComparator
          activeSupuesto={activeSupuesto}
          effectiveMortgageInput={effectiveMortgageInput}
          supuestos={store.supuestos}
          nextSupuestoNumber={store.nextSupuestoNumber}
          onSaveWhatIfAsSupuesto={handleSaveWhatIfAsSupuesto}
          onSelectSupuesto={(id) =>
            setStore((prev) => ({ ...prev, activeSupuestoId: id }))
          }
        />
      );
    }

    if (section === 'hipoteca') {
      return (
        <MortgageTreasurySimulator
          input={effectiveMortgageInput}
          budgetFreeCashflowPreMortgage={summary.capacidadAhorroPreHipotecaMensual}
          onUpdateInput={(mortgageInput) =>
            updateActiveState((prev) => ({ ...prev, mortgageInput }))
          }
          onOpenPosterMode={() => {
            navigateToSection('poster');
            setPosterFullscreen(true);
          }}
        />
      );
    }

    if (section === 'irpf') {
      return (
        <IrpfSimulator
          profile={adaptedProfileForIrpf}
          irpfInput={activeState.irpfInput}
          onUpdateIrpf={(irpfInput) =>
            updateActiveState((prev) => ({ ...prev, irpfInput }))
          }
          onSyncFromBudgetAndMortgage={handleSyncIrpfFromEconomy}
        />
      );
    }

    return (
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
    );
  };

  if (showLanding) {
    return (
      <>
        <GestarianLandingView
          user={user}
          authLoading={authLoading}
          onGoogleSignIn={async () => {
            const ok = await handleGoogleSignIn(false);
            if (ok) {
              setShowLanding(false);
              navigateToSection('resumen');
            }
          }}
          onEmailSignIn={async (email, password) => {
            try {
              await emailSignIn(email, password);
            } catch (err) {
              throw new Error(formatEmailAuthError(err));
            }
          }}
          onEmailRegister={async (email, password) => {
            try {
              await emailRegister(email, password);
            } catch (err) {
              throw new Error(formatEmailAuthError(err));
            }
          }}
          onSignOut={handleGoogleSignOut}
          onEnterWorkspace={(section) => {
            const target = section ?? 'resumen';
            if (target === 'asesor') {
              setAdvisorChatOpen(true);
              return;
            }
            setShowLanding(false);
            setActiveSection(target);
            setPosterFullscreen(false);
          }}
          onOpenWizardAssistant={() => {
            setShowLanding(false);
            setActiveSection('resumen');
            setWizardOpen(true);
          }}
          onOpenChat={() => {
            setAdvisorChatOpen(true);
          }}
        />
        {wizardOpen && (
          <SetupWizardModal
            initialState={activeState}
            initialSupuestoName={activeSupuesto.nombre}
            onClose={() => setWizardOpen(false)}
            onApply={handleApplyWizard}
          />
        )}
        <FinancialAdvisorPanel
          isOpen={advisorChatOpen}
          state={activeState}
          summary={summary}
          effectiveMortgageInput={effectiveMortgageInput}
          irpfHabilitado={irpfHabilitado}
          onClose={() => setAdvisorChatOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Bar Contract: estrictamente 3 zonas con gap-8 */}
      <header className="no-print border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-4">
          {/* Zona 1: Brand wordmark en una línea */}
          <button
            type="button"
            onClick={() => navigateToSection('resumen')}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 dark:text-white"
          >
            Patrimonio &amp; IRPF España
          </button>

          {/* Zona 2: enlaces de navegación en una línea */}
          <nav className="hidden items-center gap-6 lg:flex" aria-label="Navegación principal">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateToSection(item.id)}
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
        </div>
      </header>

      {/* Navegación móvil y tablet portrait con scroll lateral sincronizado */}
      <div
        className={`no-print border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900 ${
          isPortraitScrollViewport ? 'block' : 'flex lg:hidden'
        }`}
      >
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {SECTION_ORDER.map((sec) => (
            <button
              key={sec}
              ref={(el) => {
                mobileNavTabRefs.current[sec] = el;
              }}
              type="button"
              onClick={() => navigateToSection(sec)}
              className={`min-h-[40px] rounded-lg px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap shrink-0 transition-colors ${
                activeSection === sec
                  ? 'bg-blue-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {SECTION_LABELS[sec]}
            </button>
          ))}
        </div>
        {isPortraitScrollViewport && (
          <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            Desliza lateralmente para cambiar de sección
          </p>
        )}
      </div>

      {/* Barra del Espacio de Trabajo: Modalidad, Alcance, Nube Google, PWA y Tema */}
      <section className="no-print border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLanding(true)}
              className="rounded-lg bg-black px-3 py-1.5 text-xs font-extrabold tracking-[0.14em] text-white transition-opacity hover:opacity-85 whitespace-nowrap shrink-0 dark:border dark:border-white/25"
              title="Volver a la portada GESTARIAN"
            >
              GESTARIAN
            </button>
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
                    value={
                      actingMember?.rol === 'limitado'
                        ? actingMember.id
                        : activeState.activeMemberScope
                    }
                    disabled={actingMember?.rol === 'limitado'}
                    onChange={(e) =>
                      updateActiveState((prev) => ({
                        ...prev,
                        activeMemberScope: e.target.value,
                      }))
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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
                    onChange={(e) => handleSwitchActingMember(e.target.value)}
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
              onClick={() => setAdvisorChatOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90"
              title="Abrir chat de Asesor IA a pantalla completa"
            >
              <MessageCircle className="h-4 w-4" />
              Asesor IA
            </button>

            <button
              type="button"
              onClick={() => setTestAccessModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 whitespace-nowrap shrink-0 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
              title="Acceso ficticio por correo y autorizaciones de la unidad familiar"
            >
              <FlaskConical className="h-4 w-4" />
              {actingMember?.email ? `Prueba: ${actingMember.email}` : 'Acceso Prueba'}
            </button>

            <PWAInstallButton />

            <GoogleSignInButton
              user={user}
              syncStatus={syncStatus}
              authLoading={authLoading}
              onSignIn={() => {
                void handleGoogleSignIn(false);
              }}
              onSignOut={() => {
                void handleGoogleSignOut();
              }}
            />

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

      {authNotice && (
        <div className="no-print mx-auto mt-4 max-w-[1440px] px-6">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
            <span>{authNotice}</span>
            <button
              type="button"
              onClick={() => setAuthNotice(null)}
              className="shrink-0 font-semibold underline hover:no-underline"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Contenido Principal: Scroll lateral en móvil y tablet portrait, vista directa en escritorio */}
      {isPortraitScrollViewport && !posterFullscreen ? (
        <main className="w-full overflow-hidden">
          <div
            ref={horizontalTrackRef}
            onScroll={handleHorizontalTrackScroll}
            className="flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth no-scrollbar"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {SECTION_ORDER.map((sec) => (
              <section
                key={sec}
                data-section={sec}
                aria-label={SECTION_LABELS[sec]}
                className="w-full shrink-0 snap-start snap-always overflow-x-hidden px-4 py-5 sm:px-6"
              >
                {renderSectionContent(sec)}
              </section>
            ))}
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-[1440px] px-6 py-7">
          {renderSectionContent(activeSection)}
        </main>
      )}

      {/* Chat limpio a toda pantalla del Asesor IA */}
      <FinancialAdvisorPanel
        isOpen={advisorChatOpen}
        state={activeState}
        summary={summary}
        effectiveMortgageInput={effectiveMortgageInput}
        irpfHabilitado={irpfHabilitado}
        onClose={() => setAdvisorChatOpen(false)}
      />

      {/* Asistente Guiado paso a paso lanzado desde el botón "Iniciar" del Dashboard */}
      {wizardOpen && (
        <SetupWizardModal
          initialState={activeState}
          initialSupuestoName={activeSupuesto.nombre}
          onClose={() => setWizardOpen(false)}
          onApply={handleApplyWizard}
        />
      )}

      {/* Entorno Ficticio de Prueba: Acceso por Correo y Autorizaciones de Unidad Familiar */}
      {testAccessModalOpen && (
        <TestFamilyAccessModal
          state={activeState}
          onClose={() => setTestAccessModalOpen(false)}
          onLoadTestFamilySupuesto={handleLoadTestFamilySupuesto}
          onSwitchActingMember={handleSwitchActingMember}
          onUpdateMembers={(members) =>
            updateActiveState((prev) => ({ ...prev, members }))
          }
        />
      )}

      {/* Fase 7 + OCR Tickets: Asistente Gemini Lenguaje Natural y Cámara */}
      {geminiModalOpen && (
        <GeminiAssistantPanel
          state={activeState}
          initialMode={geminiInitialMode}
          onClose={() => setGeminiModalOpen(false)}
          onAddMovement={handleAddMovement}
        />
      )}

      {/* Rastreo de Facturas Recibidas en Gmail */}
      {gmailPanelOpen && (
        <GmailInvoicesPanel
          state={activeState}
          hasGmailAccess={Boolean(gmailToken)}
          scanning={gmailScanning}
          scanError={gmailError}
          invoices={detectedEmailInvoices}
          onClose={() => setGmailPanelOpen(false)}
          onRequestGoogleAuth={() => {
            void handleGoogleSignIn(true);
          }}
          onRescan={() => {
            if (gmailToken) {
              void runGmailScan(gmailToken);
            }
          }}
          onAttachInvoice={(invoice, overrides) => {
            const cat = activeState.categories.find((c) => c.id === overrides.categoriaId);
            handleAddMovement({
              tipo: 'gasto',
              importe: overrides.importe,
              fecha: invoice.dateISO,
              concepto: overrides.concepto,
              emisor: invoice.emisor,
              categoriaId: overrides.categoriaId,
              subcategoria:
                overrides.subcategoria || cat?.subcategorias[0] || 'General',
              cuentaId: overrides.cuentaId,
              miembroId: activeState.actingMemberId,
              visibilidad: activeState.mode === 'familiar' ? 'compartida' : 'privada',
              recurrencia: 'puntual',
              estado: 'confirmado',
              esDeducibleAutonomo: overrides.esDeducibleAutonomo || undefined,
              justificanteNombre:
                invoice.attachmentName ||
                (invoice.numeroFactura
                  ? `factura-${invoice.numeroFactura}.pdf`
                  : 'factura-gmail'),
              observaciones: `Importado de Gmail (${invoice.from}): ${invoice.subject}`,
              gmailMessageId: invoice.messageId,
            });
            setDetectedEmailInvoices((prev) =>
              prev.filter((i) => i.messageId !== invoice.messageId)
            );
            setDismissedGmailIds((prev) =>
              Array.from(new Set([...prev, invoice.messageId]))
            );
          }}
          onDismissInvoice={(messageId) => {
            setDetectedEmailInvoices((prev) =>
              prev.filter((i) => i.messageId !== messageId)
            );
            setDismissedGmailIds((prev) => Array.from(new Set([...prev, messageId])));
          }}
        />
      )}
    </div>
  );
}
