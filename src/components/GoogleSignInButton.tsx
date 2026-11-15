import React from 'react';
import { User } from 'firebase/auth';
import { Cloud, CloudOff, LogOut } from 'lucide-react';

interface GoogleSignInButtonProps {
  user: User | null;
  syncStatus: 'local' | 'syncing' | 'synced' | 'error';
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  user,
  syncStatus,
  authLoading,
  onSignIn,
  onSignOut,
}) => {
  if (user) {
    return (
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
          {syncStatus === 'error' ? (
            <CloudOff className="h-4 w-4 text-red-600 dark:text-red-400" />
          ) : (
            <Cloud className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
          )}
          <span className="max-w-[160px] truncate">
            {user.displayName || user.email}
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {syncStatus === 'syncing'
              ? 'Sincronizando'
              : syncStatus === 'error'
                ? 'Error nube'
                : 'Nube activa'}
          </span>
        </span>
        <button
          type="button"
          onClick={onSignOut}
          title="Cerrar sesión en Google"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <LogOut className="h-3.5 w-3.5" />
          Salir
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSignIn}
      disabled={authLoading}
      className="inline-flex items-center gap-2.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-800 shadow-xs transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
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
      <span>{authLoading ? 'Conectando...' : 'Acceder con Google'}</span>
    </button>
  );
};
