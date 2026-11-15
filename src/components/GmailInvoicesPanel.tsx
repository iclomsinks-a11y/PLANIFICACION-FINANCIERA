import React, { useState } from 'react';
import { Check, Loader2, Mail, RefreshCw, Trash2, X } from 'lucide-react';
import { DetectedEmailInvoice } from '../services/gmailService';
import { EconomyWorkspaceState } from '../types/economy';
import { formatEUR } from '../utils/formatters';

interface GmailInvoicesPanelProps {
  state: EconomyWorkspaceState;
  hasGmailAccess: boolean;
  scanning: boolean;
  scanError: string | null;
  invoices: DetectedEmailInvoice[];
  onClose: () => void;
  onRequestGoogleAuth: () => void;
  onRescan: () => void;
  onAttachInvoice: (invoice: DetectedEmailInvoice, overrides: {
    concepto: string;
    importe: number;
    categoriaId: string;
    subcategoria: string;
    cuentaId: string;
    esDeducibleAutonomo: boolean;
  }) => void;
  onDismissInvoice: (messageId: string) => void;
}

export const GmailInvoicesPanel: React.FC<GmailInvoicesPanelProps> = ({
  state,
  hasGmailAccess,
  scanning,
  scanError,
  invoices,
  onClose,
  onRequestGoogleAuth,
  onRescan,
  onAttachInvoice,
  onDismissInvoice,
}) => {
  const [edits, setEdits] = useState<
    Record<
      string,
      {
        concepto: string;
        importe: number;
        categoriaId: string;
        subcategoria: string;
        cuentaId: string;
        esDeducibleAutonomo: boolean;
      }
    >
  >({});

  const defaultAccountId = state.accounts[0]?.id ?? '';

  const getDraft = (inv: DetectedEmailInvoice) =>
    edits[inv.messageId] ?? {
      concepto: inv.concepto,
      importe: inv.importe,
      categoriaId: inv.categoriaId,
      subcategoria: inv.subcategoria,
      cuentaId: defaultAccountId,
      esDeducibleAutonomo: inv.esDeducibleAutonomo,
    };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Rastreo de facturas en Gmail"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Rastreo de Facturas Recibidas en Gmail
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Detecta facturas recientes en tu correo en modo solo lectura para revisarlas antes de adjuntarlas como gasto.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar panel de facturas Gmail"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {!hasGmailAccess ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-950">
              <Mail className="mx-auto h-10 w-10 text-blue-700 dark:text-blue-400" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Conecta tu cuenta de Google para rastrear facturas recibidas
              </h3>
              <p className="mx-auto max-w-lg text-base text-slate-600 dark:text-slate-400">
                La aplicación leerá únicamente correos recientes con facturas o recibos (con tu permiso) y te avisará antes de adjuntar ningún gasto.
              </p>
              {scanError && (
                <div className="mx-auto max-w-lg rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-left text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                  {scanError}
                </div>
              )}
              <button
                type="button"
                onClick={onRequestGoogleAuth}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
              >
                Conectar Gmail con Google
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-base text-slate-700 dark:text-slate-300">
                  Facturas detectadas pendientes de revisión:{' '}
                  <strong className="font-mono tabular-nums">{invoices.length}</strong>
                </p>
                <button
                  type="button"
                  onClick={onRescan}
                  disabled={scanning}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analizando Gmail...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Buscar nuevas facturas en Gmail
                    </>
                  )}
                </button>
              </div>

              {scanError && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {scanError}
                </div>
              )}

              {!scanning && invoices.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-base text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  No hay nuevas facturas pendientes de revisar en los últimos 60 días.
                </div>
              ) : (
                <div className="space-y-4">
                  {invoices.map((inv) => {
                    const d = getDraft(inv);
                    const catObj = state.categories.find((c) => c.id === d.categoriaId);
                    return (
                      <div
                        key={inv.messageId}
                        className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
                          <div>
                            <p className="text-base font-bold text-slate-900 dark:text-white">
                              {inv.emisor} · {inv.subject}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Fecha: {inv.dateISO}
                              {inv.numeroFactura ? ` · Factura ${inv.numeroFactura}` : ''}
                              {inv.attachmentName ? ` · Adjunto: ${inv.attachmentName}` : ''}
                            </p>
                          </div>
                          <span className="font-mono text-lg font-bold text-red-700 tabular-nums dark:text-red-400">
                            -{formatEUR(d.importe)}
                          </span>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-400">{inv.resumen}</p>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <span>Concepto gasto</span>
                            <input
                              type="text"
                              value={d.concepto}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [inv.messageId]: { ...d, concepto: e.target.value },
                                }))
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          </label>

                          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <span>Importe (€)</span>
                            <input
                              type="number"
                              step="0.01"
                              value={d.importe}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [inv.messageId]: {
                                    ...d,
                                    importe: Math.max(0, Number(e.target.value) || 0),
                                  },
                                }))
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          </label>

                          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <span>Categoría COICOP</span>
                            <select
                              value={d.categoriaId}
                              onChange={(e) => {
                                const nextCat = state.categories.find(
                                  (c) => c.id === e.target.value
                                );
                                setEdits((prev) => ({
                                  ...prev,
                                  [inv.messageId]: {
                                    ...d,
                                    categoriaId: e.target.value,
                                    subcategoria: nextCat?.subcategorias[0] ?? 'General',
                                  },
                                }))
                              }}
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            >
                              {state.categories
                                .filter((c) => !c.oculta && c.tipo === 'gasto')
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nombre}
                                  </option>
                                ))}
                            </select>
                          </label>

                          <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <span>Cuenta cargo ({catObj?.subcategorias[0] ?? 'General'})</span>
                            <select
                              value={d.cuentaId}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [inv.messageId]: { ...d, cuentaId: e.target.value },
                                }))
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            >
                              {state.accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.nombre}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={d.esDeducibleAutonomo}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [inv.messageId]: {
                                    ...d,
                                    esDeducibleAutonomo: e.target.checked,
                                  },
                                }))
                              }
                            />
                            <span>Deducible actividad económica / AEAT</span>
                          </label>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onDismissInvoice(inv.messageId)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Descartar
                            </button>
                            <button
                              type="button"
                              onClick={() => onAttachInvoice(inv, d)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
                            >
                              <Check className="h-4 w-4" />
                              Adjuntar como gasto
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
