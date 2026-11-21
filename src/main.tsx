import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const reg of registrations) {
        if (reg.active?.scriptURL.includes('dev-sw')) {
          void reg.unregister();
        }
      }
    })
    .catch(() => {});
}

interface RootErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error inesperado al renderizar la aplicación.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-zinc-950 p-6 text-center">
            <h1 className="text-lg font-semibold">No se pudo mostrar la vista actual</h1>
            <p className="mt-2 text-sm text-white/70">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-full border border-white/40 px-6 py-2 text-sm font-medium text-white hover:bg-white hover:text-black"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
