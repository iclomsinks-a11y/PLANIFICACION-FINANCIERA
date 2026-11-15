import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { canPromptInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {!isOnline && (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
          <WifiOff className="h-3.5 w-3.5" />
          Sin conexión (modo local)
        </span>
      )}

      {!isInstalled && canPromptInstall && (
        <button
          type="button"
          onClick={() => {
            void promptInstall();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
        >
          <Download className="h-3.5 w-3.5" />
          Instalar App
        </button>
      )}

      {!isInstalled && !canPromptInstall && isIOS && (
        <button
          type="button"
          onClick={() => setIosHelpOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <Smartphone className="h-3.5 w-3.5" />
          Instalar en iOS
        </button>
      )}

      {iosHelpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Instalar en iPhone o iPad"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Instalar PatrimonioES en iOS
              </h3>
              <button
                type="button"
                onClick={() => setIosHelpOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-base text-slate-700 dark:text-slate-300">
              <li>Pulsa el botón <strong>Compartir</strong> en la barra inferior de Safari.</li>
              <li>Desliza y selecciona <strong>Añadir a pantalla de inicio</strong>.</li>
              <li>Pulsa <strong>Añadir</strong> para usarla como aplicación independiente.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};
