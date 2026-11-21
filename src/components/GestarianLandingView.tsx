import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowRight,
  Building2,
  Calculator,
  GitCompare,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Maximize2,
  MessageCircle,
  Plus,
  Scale,
  SlidersHorizontal,
  Wallet,
  X,
} from 'lucide-react';
import { MainSection } from '../types/economy';

interface GestarianLandingViewProps {
  user: User | null;
  authLoading: boolean;
  onGoogleSignIn: () => Promise<void> | void;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailRegister: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void> | void;
  onEnterWorkspace: (section?: MainSection) => void;
  onOpenWizardAssistant: () => void;
  onOpenChat: () => void;
}

const SECTION_SHORTCUTS: Array<{
  id: MainSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'movimientos', label: 'Movimientos', icon: ListOrdered },
  { id: 'cuentas', label: 'Cuentas', icon: Wallet },
  { id: 'comparador', label: 'Comparador', icon: GitCompare },
  { id: 'hipoteca', label: 'Hipoteca', icon: Building2 },
  { id: 'irpf', label: 'IRPF', icon: Calculator },
  { id: 'asesor', label: 'Asesor IA', icon: Scale },
  { id: 'poster', label: 'Póster', icon: Maximize2 },
];

export const GestarianLandingView: React.FC<GestarianLandingViewProps> = ({
  user,
  authLoading,
  onGoogleSignIn,
  onEmailSignIn,
  onEmailRegister,
  onSignOut,
  onEnterWorkspace,
  onOpenWizardAssistant,
  onOpenChat,
}) => {
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput) return;
    setEmailBusy(true);
    setAuthError(null);
    try {
      if (authMode === 'login') {
        await onEmailSignIn(emailInput, passwordInput);
      } else {
        await onEmailRegister(emailInput, passwordInput);
      }
      setAuthModalOpen(false);
      onEnterWorkspace('resumen');
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'No se pudo completar la autenticación.'
      );
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col justify-between overflow-hidden bg-black text-white select-none">
      {/* Centro absoluto: Marca GESTARIAN al 80% de ancho en móvil portrait con animación fade-in + zoom de 2s */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 pt-8 pb-4">
        <div className="animate-gestarian-reveal flex w-[80vw] max-w-[680px] items-center justify-center">
          <svg
            viewBox="0 0 800 120"
            className="h-auto w-full overflow-visible"
            role="img"
            aria-label="GESTARIAN"
          >
            <title>GESTARIAN</title>
            <text
              x="400"
              y="92"
              textAnchor="middle"
              textLength="780"
              lengthAdjust="spacing"
              fill="#FFFFFF"
              style={{
                fontFamily: "'DM Sans', var(--font-display, 'Plus Jakarta Sans'), sans-serif",
                fontWeight: 100,
                fontSize: '96px',
              }}
            >
              GESTARIAN
            </text>
          </svg>
        </div>

        {/* Botón minimalista Iniciar (aparece tras la animación de 2s) */}
        <div className="animate-gestarian-controls mt-10 flex flex-col items-center gap-4 sm:mt-12">
          <button
            type="button"
            onClick={() => {
              setAuthError(null);
              setAuthModalOpen(true);
            }}
            className="min-h-[44px] rounded-full border border-white/40 bg-transparent px-10 py-2.5 text-sm font-medium tracking-[0.18em] uppercase text-white transition-colors duration-200 hover:border-white hover:bg-white hover:text-black focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white whitespace-nowrap"
          >
            Iniciar
          </button>

          {user && (
            <button
              type="button"
              onClick={() => onEnterWorkspace('resumen')}
              className="inline-flex min-h-[40px] items-center gap-2 text-xs font-medium text-white/65 transition-colors hover:text-white"
            >
              <span>Continuar como {user.displayName || user.email}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </main>

      {/* Dock inferior minimalista: Izquierda Asistente · Centro (+) Secciones · Derecha Chat */}
      <footer className="animate-gestarian-controls relative z-50 mx-auto w-full max-w-md px-8 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end justify-between">
          {/* Izquierda: Iniciar supuesto con el asistente */}
          <button
            type="button"
            onClick={onOpenWizardAssistant}
            aria-label="Iniciar supuesto con el asistente"
            title="Iniciar supuesto con el asistente"
            className="group flex min-w-[56px] flex-col items-center gap-1.5 text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 transition-colors duration-200 group-hover:border-white group-hover:bg-white group-hover:text-black">
              <SlidersHorizontal className="h-5 w-5" />
            </span>
            <span className="text-[11px] font-medium tracking-wide text-white/55 group-hover:text-white">
              Asistente
            </span>
          </button>

          {/* Centro: Icono + rodeado con círculo minimalista para mostrar botones flotantes de cada sección */}
          <button
            type="button"
            onClick={() => setSectionsOpen((prev) => !prev)}
            aria-label="Mostrar botones de cada sección"
            aria-expanded={sectionsOpen}
            title="Mostrar todas las secciones"
            className="group flex min-w-[56px] flex-col items-center gap-1.5 text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-200 ${
                sectionsOpen
                  ? 'rotate-45 border-white bg-white text-black'
                  : 'border-white/55 bg-transparent text-white group-hover:border-white group-hover:bg-white group-hover:text-black'
              }`}
            >
              <Plus className="h-6 w-6 stroke-[1.5]" />
            </span>
            <span className="text-[11px] font-medium tracking-wide text-white/55 group-hover:text-white">
              Secciones
            </span>
          </button>

          {/* Derecha: Icono de Chat */}
          <button
            type="button"
            onClick={onOpenChat}
            aria-label="Abrir chat con asesor"
            title="Chat"
            className="group flex min-w-[56px] flex-col items-center gap-1.5 text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 transition-colors duration-200 group-hover:border-white group-hover:bg-white group-hover:text-black">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="text-[11px] font-medium tracking-wide text-white/55 group-hover:text-white">
              Chat
            </span>
          </button>
        </div>
      </footer>

      {/* Solo botones flotantes sin relleno ni tarjeta agrupadora, ocupando todo el ancho (2 por fila en móvil y tablet portrait) */}
      {sectionsOpen && (
        <div
          role="dialog"
          aria-label="Secciones de GESTARIAN"
          onClick={() => setSectionsOpen(false)}
          className="fixed inset-0 z-40 flex flex-col justify-end bg-black/75 px-3 pb-[calc(7.25rem+env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:px-6"
        >
          <div className="gestarian-floating-grid animate-gestarian-float">
            {SECTION_SHORTCUTS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSectionsOpen(false);
                    onEnterWorkspace(item.id);
                  }}
                  className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-full border border-white/45 bg-transparent px-4 py-3 text-sm font-light tracking-wide text-white transition-all duration-150 hover:border-white hover:bg-white/10 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap"
                >
                  <Icon className="h-4 w-4 shrink-0 stroke-[1.5]" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal minimalista Iniciar Sesión / Registrarse */}
      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setAuthModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Iniciar sesión o registrarse"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/20 bg-zinc-950 p-6 text-white"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
              <h2 className="font-display text-lg font-bold tracking-tight">
                {user ? 'Cuenta GESTARIAN' : authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </h2>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                aria-label="Cerrar acceso"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/75 hover:border-white/50 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {user ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-white/15 bg-black p-4">
                  <p className="text-xs text-white/55">Sesión activa</p>
                  <p className="mt-1 truncate text-sm font-semibold text-white">
                    {user.displayName || user.email}
                  </p>
                  {user.email && user.displayName && (
                    <p className="truncate text-xs text-white/60">{user.email}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAuthModalOpen(false);
                    onEnterWorkspace('resumen');
                  }}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
                >
                  Entrar al espacio de trabajo
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void onSignOut();
                  }}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-medium text-white/85 transition-colors hover:border-white hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {/* Selector Iniciar sesión / Registrarse */}
                <div className="grid grid-cols-2 gap-1 rounded-full border border-white/15 bg-black p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                    }}
                    className={`min-h-[38px] rounded-full text-xs font-semibold transition-colors ${
                      authMode === 'login'
                        ? 'bg-white text-black'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Iniciar sesión
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError(null);
                    }}
                    className={`min-h-[38px] rounded-full text-xs font-semibold transition-colors ${
                      authMode === 'register'
                        ? 'bg-white text-black'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    Registrarse
                  </button>
                </div>

                {/* Acceso Google */}
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={async () => {
                    setAuthError(null);
                    await onGoogleSignIn();
                  }}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>
                    {authLoading
                      ? 'Conectando...'
                      : authMode === 'login'
                        ? 'Continuar con Google'
                        : 'Registrarse con Google'}
                  </span>
                </button>

                <div className="flex items-center gap-3 text-xs text-white/35">
                  <span className="h-px flex-1 bg-white/15" />
                  <span>o con correo</span>
                  <span className="h-px flex-1 bg-white/15" />
                </div>

                <form onSubmit={handleEmailSubmit} className="space-y-3">
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Correo electrónico"
                    aria-label="Correo electrónico"
                    className="min-h-[44px] w-full rounded-xl border border-white/20 bg-black px-3.5 py-2 text-sm text-white placeholder:text-white/40 focus:border-white focus:outline-none"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Contraseña (mín. 6 caracteres)"
                    aria-label="Contraseña"
                    className="min-h-[44px] w-full rounded-xl border border-white/20 bg-black px-3.5 py-2 text-sm text-white placeholder:text-white/40 focus:border-white focus:outline-none"
                  />

                  {authError && (
                    <p className="text-xs leading-relaxed text-red-400">{authError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={emailBusy}
                    className="flex min-h-[44px] w-full items-center justify-center rounded-full border border-white/40 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white hover:text-black disabled:opacity-60"
                  >
                    {emailBusy
                      ? 'Procesando...'
                      : authMode === 'login'
                        ? 'Acceder con correo'
                        : 'Crear cuenta con correo'}
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => {
                    setAuthModalOpen(false);
                    onEnterWorkspace('resumen');
                  }}
                  className="w-full py-1.5 text-center text-xs font-medium text-white/55 transition-colors hover:text-white"
                >
                  Continuar sin cuenta (modo local)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
