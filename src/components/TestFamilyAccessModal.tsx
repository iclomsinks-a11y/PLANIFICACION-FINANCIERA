import React, { useState } from 'react';
import {
  CheckCircle2,
  FlaskConical,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { authorizeFamilyMemberByEmail } from '../engines/economyEngine';
import { EconomyWorkspaceState, HouseholdMember } from '../types/economy';

interface TestFamilyAccessModalProps {
  state: EconomyWorkspaceState;
  onClose: () => void;
  onLoadTestFamilySupuesto: () => void;
  onSwitchActingMember: (memberId: string) => void;
  onUpdateMembers: (members: HouseholdMember[]) => void;
}

export const TestFamilyAccessModal: React.FC<TestFamilyAccessModalProps> = ({
  state,
  onClose,
  onLoadTestFamilySupuesto,
  onSwitchActingMember,
  onUpdateMembers,
}) => {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginFeedback, setLoginFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  const [authEmail, setAuthEmail] = useState('');
  const [grantFullView, setGrantFullView] = useState(true);
  const [authFeedback, setAuthFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  const actingMember = state.members.find((m) => m.id === state.actingMemberId);
  const adminMember = state.members.find((m) => m.rol === 'admin') ?? state.members[0];
  const isFamilyMode = state.mode === 'familiar';
  const hasTestEmails = state.members.some((m) =>
    (m.email ?? '').toLowerCase().includes('deprueba@gmail.com')
  );

  const attemptEmailAccess = (rawEmail: string) => {
    const normalized = rawEmail.trim().toLowerCase();
    if (!normalized) {
      setLoginFeedback({
        type: 'error',
        text: 'Introduce un correo electrónico para acceder.',
      });
      return;
    }

    const matched = state.members.find(
      (m) => (m.email ?? '').trim().toLowerCase() === normalized
    );

    if (!matched) {
      setLoginFeedback({
        type: 'error',
        text: `Acceso denegado: "${rawEmail.trim()}" no pertenece a ningún miembro registrado en esta unidad familiar. Nunca se permite el acceso a terceras personas.`,
      });
      return;
    }

    if (matched.rol !== 'admin' && matched.autorizadoAcceso === false) {
      setLoginFeedback({
        type: 'error',
        text: `Acceso pendiente de autorización: ${matched.nombre} (${matched.email}) necesita que el usuario titular (${adminMember?.email ?? 'administrador'}) autorice su correo en la unidad familiar.`,
      });
      return;
    }

    onSwitchActingMember(matched.id);
    setLoginEmail(matched.email ?? '');

    if (matched.rol === 'admin') {
      setLoginFeedback({
        type: 'ok',
        text: `Sesión iniciada como ${matched.nombre} (${matched.email}). Acceso total como titular de la cuenta.`,
      });
    } else if (matched.rol === 'adulto') {
      setLoginFeedback({
        type: 'ok',
        text: matched.autorizadoVerTodo
          ? `Sesión iniciada como ${matched.nombre} (${matched.email}). Autorizado por el titular: puedes ver toda la unidad familiar.`
          : `Sesión iniciada como ${matched.nombre} (${matched.email}). Acceso parcial (datos propios y compartidos). Necesitas autorización del titular para ver todo.`,
      });
    } else {
      setLoginFeedback({
        type: 'ok',
        text: `Sesión iniciada como ${matched.nombre} (${matched.email}). Acceso limitado a sus propios datos económicos.`,
      });
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    attemptEmailAccess(loginEmail);
  };

  const handleAuthorizeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = authorizeFamilyMemberByEmail(state, authEmail, grantFullView);
    if (!res.ok || !res.updatedMembers || !res.authorizedMember) {
      setAuthFeedback({
        type: 'error',
        text: res.error ?? 'No se pudo autorizar el correo indicado.',
      });
      return;
    }

    onUpdateMembers(res.updatedMembers);
    setAuthFeedback({
      type: 'ok',
      text:
        res.authorizedMember.rol === 'adulto' && res.authorizedMember.autorizadoVerTodo
          ? `Autorizado ${res.authorizedMember.nombre} (${res.authorizedMember.email}) para ver toda la unidad familiar.`
          : `Autorizado acceso a ${res.authorizedMember.nombre} (${res.authorizedMember.email}) sobre sus datos permitidos.`,
    });
    setAuthEmail('');
  };

  const toggleMemberAccess = (memberId: string, field: 'autorizadoAcceso' | 'autorizadoVerTodo') => {
    if (!isFamilyMode || actingMember?.rol !== 'admin') return;
    onUpdateMembers(
      state.members.map((m) => {
        if (m.id !== memberId || m.rol === 'admin') return m;
        if (field === 'autorizadoAcceso') {
          const nextAccess = m.autorizadoAcceso === false;
          return {
            ...m,
            autorizadoAcceso: nextAccess,
            autorizadoVerTodo: nextAccess ? m.autorizadoVerTodo : false,
          };
        }
        const nextFull = !m.autorizadoVerTodo;
        return {
          ...m,
          autorizadoAcceso: nextFull ? true : (m.autorizadoAcceso ?? true),
          autorizadoVerTodo: m.rol === 'adulto' ? nextFull : false,
        };
      })
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Entorno de Prueba y Acceso por Correo"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Entorno Ficticio de Prueba · Unidad Familiar
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Simula el acceso por correo de cada miembro y gestiona las autorizaciones del titular.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar entorno de prueba"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Bloque 1: Cargar Unidad Familiar de Prueba */}
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/20">
            <div>
              <p className="text-sm font-bold text-blue-950 dark:text-blue-200">
                Supuesto completo «Unidad Familiar de Prueba»
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-300">
                Incluye a Adulto 1 de Prueba (<code>adulto1deprueba@gmail.com</code>), Adulto 2 de
                Prueba (<code>adulto2deprueba@gmail.com</code>), Adolescente 1 de Prueba (
                <code>adolescente1deprueba@gmail.com</code>) y Adolescente 2 de Prueba (
                <code>adolescente2deprueba@gmail.com</code>).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onLoadTestFamilySupuesto();
                setLoginFeedback({
                  type: 'ok',
                  text: 'Cargado el supuesto «Unidad Familiar de Prueba» con los 4 miembros ficticios.',
                });
                setAuthFeedback(null);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
            >
              <Users className="h-4 w-4" />
              {hasTestEmails
                ? 'Crear nuevo supuesto de prueba limpio'
                : 'Cargar Unidad Familiar de Prueba'}
            </button>
          </section>

          {/* Bloque 2: Acceso por Correo */}
          <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  1. Acceso de miembros por correo electrónico (simulación)
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Usuario activo actual:{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {actingMember?.nombre ?? 'Sin miembro'}
                  </strong>{' '}
                  {actingMember?.email ? (
                    <span className="font-mono text-xs">({actingMember.email})</span>
                  ) : null}
                </p>
              </div>
              {actingMember && actingMember.rol !== 'admin' && adminMember && (
                <button
                  type="button"
                  onClick={() => attemptEmailAccess(adminMember.email || '')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  Volver a {adminMember.nombre}
                </button>
              )}
            </div>

            <form onSubmit={handleLoginSubmit} className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[260px] flex-1">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Introduce correo para acceder (ej. adulto2deprueba@gmail.com)"
                  aria-label="Correo de acceso del miembro"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900"
              >
                <UserCheck className="h-4 w-4" />
                Acceder por correo
              </button>
            </form>

            {/* Accesos rápidos para simular cada miembro ficticio */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Accesos rápidos de prueba:
              </span>
              {state.members.map((m) =>
                m.email ? (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => attemptEmailAccess(m.email!)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      state.actingMemberId === m.id
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {m.email} ({m.rol === 'admin' ? 'Titular' : m.rol})
                  </button>
                ) : null
              )}
            </div>

            {loginFeedback && (
              <div
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  loginFeedback.type === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
                }`}
              >
                {loginFeedback.type === 'ok' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{loginFeedback.text}</span>
              </div>
            )}
          </section>

          {/* Bloque 3: Autorizaciones del Titular (EXCLUSIVO Unidad Familiar) */}
          <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                2. Autorizaciones del usuario de la cuenta (solo Unidad Familiar)
              </h3>
            </div>

            {!isFamilyMode ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                <Lock className="h-4 w-4 shrink-0 text-slate-500" />
                <span>
                  Las autorizaciones solo están disponibles en la modalidad{' '}
                  <strong>Unidad Familiar</strong>. En modalidad individual o adolescente no se
                  pueden autorizar otros miembros ni terceras personas.
                </span>
              </div>
            ) : actingMember?.rol !== 'admin' ? (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                <p>
                  Estás operando como <strong>{actingMember?.nombre}</strong> (
                  <code>{actingMember?.email || 'sin correo'}</code>). Solo el titular de la cuenta
                  (<strong>{adminMember?.nombre}</strong> ·{' '}
                  <code>{adminMember?.email || 'admin'}</code>) puede conceder o revocar
                  autorizaciones.
                </p>
                {actingMember?.rol === 'adulto' && (
                  <p className="font-semibold">
                    {actingMember.autorizadoVerTodo
                      ? 'Estado actual: Autorizado por el titular para ver toda la unidad familiar.'
                      : 'Estado actual: Sin autorización completa. Solo ves tus datos y los compartidos; pide autorización al titular para ver todo.'}
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Introduce el correo de un miembro perteneciente a esta unidad familiar para
                  autorizar su acceso o permitir que un adulto vea toda la unidad familiar.{' '}
                  <strong>
                    Nunca se puede autorizar a una tercera persona ajena a la unidad familiar.
                  </strong>
                </p>

                <form
                  onSubmit={handleAuthorizeSubmit}
                  className="grid grid-cols-1 gap-3 md:grid-cols-12"
                >
                  <div className="md:col-span-5">
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="Correo del miembro (ej. adulto2deprueba@gmail.com)"
                      aria-label="Correo del miembro de la unidad familiar a autorizar"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-4 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={grantFullView}
                      onChange={(e) => setGrantFullView(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span>Permitir ver toda la unidad (adultos)</span>
                  </label>
                  <div className="md:col-span-3">
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                    >
                      Autorizar miembro
                    </button>
                  </div>
                </form>

                {authFeedback && (
                  <div
                    className={`rounded-lg border p-3 text-sm ${
                      authFeedback.type === 'ok'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
                        : 'border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
                    }`}
                  >
                    {authFeedback.text}
                  </div>
                )}

                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {state.members
                    .filter((m) => m.rol !== 'admin')
                    .map((m) => {
                      const accessOn = m.autorizadoAcceso !== false;
                      const fullViewOn = m.rol === 'adulto' && Boolean(m.autorizadoVerTodo);
                      return (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                        >
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {m.nombre}{' '}
                              <span className="font-mono text-xs font-normal text-slate-500">
                                ({m.email || 'sin correo asignado'})
                              </span>
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {!accessOn
                                ? 'Acceso bloqueado por el titular'
                                : m.rol === 'adulto'
                                  ? fullViewOn
                                    ? 'Autorizado: puede ver TODA la unidad familiar'
                                    : 'Acceso parcial: solo datos propios y compartidos (pendiente de ver todo)'
                                  : 'Autorizado: acceso limitado exclusivamente a sus propios datos'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleMemberAccess(m.id, 'autorizadoAcceso')}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                                accessOn
                                  ? 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200'
                                  : 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800'
                              }`}
                            >
                              {accessOn ? 'Revocar acceso' : 'Autorizar acceso'}
                            </button>

                            {m.rol === 'adulto' && (
                              <button
                                type="button"
                                onClick={() => toggleMemberAccess(m.id, 'autorizadoVerTodo')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                  fullViewOn
                                    ? 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                                    : 'bg-blue-700 text-white hover:bg-blue-800'
                                }`}
                              >
                                {fullViewOn ? 'Revocar ver todo' : 'Autorizar ver todo'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
