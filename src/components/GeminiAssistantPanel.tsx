import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  FileImage,
  Loader2,
  MessageSquareText,
  Mic,
  ScanLine,
  Square,
  Upload,
  X,
} from 'lucide-react';
import {
  EconomyWorkspaceState,
  FinancialMovement,
  MovementRecurrence,
  MovementType,
} from '../types/economy';
import { computeFinancedInstallment } from '../utils/financing';
import { formatEUR } from '../utils/formatters';

interface ProposedMovement {
  tempId: string;
  tipo: MovementType;
  importe: number;
  fecha: string;
  concepto: string;
  emisor?: string;
  categoriaId: string;
  subcategoria: string;
  cuentaId: string;
  miembroId: string;
  recurrencia: MovementRecurrence;
  esDeducibleAutonomo: boolean;
  financiado: boolean;
  importeTotalFinanciado: number;
  mensualidadesTotal: number;
  tinFinanciacionPct: number;
  confianza: 'alta' | 'media' | 'baja';
  explicacion: string;
  justificanteNombre?: string;
}

interface GeminiAssistantPanelProps {
  state: EconomyWorkspaceState;
  initialMode?: 'texto' | 'ocr';
  onClose: () => void;
  onAddMovement: (mov: Omit<FinancialMovement, 'id'>) => void;
}

export const GeminiAssistantPanel: React.FC<GeminiAssistantPanelProps> = ({
  state,
  initialMode = 'texto',
  onClose,
  onAddMovement,
}) => {
  const [mode, setMode] = useState<'texto' | 'ocr'>(initialMode);
  const [textInput, setTextInput] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string>('image/jpeg');
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ocrSummary, setOcrSummary] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ProposedMovement[]>([]);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Cámara en vivo (OCR estilo Google Lens)
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Dictado de voz para movimientos (gemini-3.5-transcribe)
  const [dictatingVoice, setDictatingVoice] = useState(false);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  const stopCamera = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
      if (voiceStreamRef.current) {
        for (const track of voiceStreamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  const handleToggleVoiceDictation = async () => {
    setErrorMsg(null);
    if (dictatingVoice && voiceRecorderRef.current) {
      voiceRecorderRef.current.stop();
      setDictatingVoice(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Tu navegador no permite acceso al micrófono para dictar movimientos.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      voiceRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) voiceChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        for (const t of stream.getTracks()) t.stop();
        voiceStreamRef.current = null;
        const blob = new Blob(voiceChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size === 0) return;

        setTranscribingVoice(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = typeof reader.result === 'string' ? reader.result : '';
            const res = await fetch('/api/gemini/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: blob.type || 'audio/webm',
              }),
            });
            const data = (await res.json()) as { transcript?: string; error?: string };
            if (!res.ok) {
              throw new Error(data.error || 'Error al transcribir el dictado de voz.');
            }
            if (data.transcript) {
              setTextInput((prev) =>
                prev.trim() ? `${prev.trim()} ${data.transcript}` : data.transcript!
              );
            }
          } catch (err) {
            setErrorMsg(
              err instanceof Error ? err.message : 'No se pudo transcribir el audio.'
            );
          } finally {
            setTranscribingVoice(false);
          }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start();
      setDictatingVoice(true);
    } catch {
      setErrorMsg('No se pudo activar el micrófono. Comprueba los permisos.');
    }
  };

  const handleOpenCamera = async () => {
    setErrorMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg(
        'Tu navegador no permite abrir la cámara en directo. Usa el botón "Subir foto o usar cámara móvil".'
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 60);
    } catch {
      setErrorMsg(
        'No se pudo acceder a la cámara. Comprueba los permisos o sube una imagen del ticket.'
      );
    }
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setPreviewDataUrl(dataUrl);
    setPreviewMime('image/jpeg');
    setPreviewFileName(`ticket-ocr-${new Date().toISOString().slice(0, 10)}.jpg`);
    stopCamera();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setPreviewFileName(file.name);
    setPreviewMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErrorMsg(null);
    setSavedNotice(null);

    if (mode === 'texto' && !textInput.trim()) {
      setErrorMsg('Escribe el movimiento que deseas registrar.');
      return;
    }
    if (mode === 'ocr' && !previewDataUrl && !textInput.trim()) {
      setErrorMsg('Captura una fotografía del ticket o sube una imagen/PDF de factura.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/gemini/parse-movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textInput.trim(),
          imageBase64: mode === 'ocr' ? previewDataUrl ?? undefined : undefined,
          imageMimeType: mode === 'ocr' ? previewMime : undefined,
          categories: state.categories
            .filter((c) => !c.oculta)
            .map((c) => ({
              id: c.id,
              nombre: c.nombre,
              tipo: c.tipo,
              subcategorias: c.subcategorias,
            })),
          accounts: state.accounts.map((a) => ({ id: a.id, nombre: a.nombre })),
          members: state.members.map((m) => ({ id: m.id, nombre: m.nombre })),
          todayISO: '2026-11-13',
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        ocrTextoDetectado?: string;
        movements?: Array<{
          tipo: MovementType;
          importe: number;
          fecha: string;
          concepto: string;
          emisor?: string;
          categoriaId: string;
          subcategoria: string;
          cuentaId?: string;
          miembroId?: string;
          recurrencia: MovementRecurrence;
          esDeducibleAutonomo?: boolean;
          financiadoSugerido?: boolean;
          mensualidadesSugeridas?: number;
          confianza: 'alta' | 'media' | 'baja';
          explicacion: string;
        }>;
      };

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo procesar la solicitud con Gemini.');
      }

      setOcrSummary(data.ocrTextoDetectado ?? null);

      const defaultAcc = state.accounts[0]?.id ?? '';
      const mapped: ProposedMovement[] = (data.movements ?? []).map((m, idx) => {
        const validCat =
          state.categories.find((c) => c.id === m.categoriaId) ??
          state.categories.find((c) => c.id === 'cat-alimentacion') ??
          state.categories[0];
        const validAcc = state.accounts.some((a) => a.id === m.cuentaId)
          ? m.cuentaId!
          : defaultAcc;
        const validMem = state.members.some((mem) => mem.id === m.miembroId)
          ? m.miembroId!
          : state.actingMemberId;
        const isFinanced = Boolean(m.financiadoSugerido);
        const months = Math.max(2, m.mensualidadesSugeridas || 12);
        const totalFin = isFinanced ? Math.max(0, Number(m.importe) || 0) : 0;
        const cuota = isFinanced
          ? computeFinancedInstallment(totalFin, months, 0).cuotaMensual
          : Math.max(0, Number(m.importe) || 0);

        return {
          tempId: `prop-${Date.now()}-${idx}`,
          tipo: m.tipo || 'gasto',
          importe: cuota,
          fecha: /^\d{4}-\d{2}-\d{2}$/.test(m.fecha) ? m.fecha : '2026-11-13',
          concepto: m.concepto || 'Movimiento detectado',
          emisor: m.emisor,
          categoriaId: validCat.id,
          subcategoria: m.subcategoria || validCat.subcategorias[0] || 'General',
          cuentaId: validAcc,
          miembroId: validMem,
          recurrencia: isFinanced ? 'mensual' : m.recurrencia || 'puntual',
          esDeducibleAutonomo: Boolean(m.esDeducibleAutonomo),
          financiado: isFinanced,
          importeTotalFinanciado: totalFin,
          mensualidadesTotal: months,
          tinFinanciacionPct: 0,
          confianza: m.confianza || 'media',
          explicacion: m.explicacion || '',
          justificanteNombre: previewFileName || undefined,
        };
      });

      setProposals(mapped);
      if (mapped.length === 0) {
        setErrorMsg('No se detectaron movimientos claros en la entrada proporcionada.');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Error de conexión con el asistente Gemini.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmProposal = (prop: ProposedMovement) => {
    const finCalc = prop.financiado
      ? computeFinancedInstallment(
          prop.importeTotalFinanciado,
          prop.mensualidadesTotal,
          prop.tinFinanciacionPct
        )
      : null;

    onAddMovement({
      tipo: prop.tipo,
      importe: prop.financiado && finCalc ? finCalc.cuotaMensual : prop.importe,
      fecha: prop.fecha,
      concepto: prop.concepto.trim(),
      emisor: prop.emisor,
      categoriaId: prop.categoriaId,
      subcategoria: prop.subcategoria,
      cuentaId: prop.cuentaId,
      miembroId: prop.miembroId,
      visibilidad: state.mode === 'familiar' ? 'compartida' : 'privada',
      recurrencia: prop.financiado ? 'mensual' : prop.recurrencia,
      estado: 'confirmado',
      esDeducibleAutonomo: prop.esDeducibleAutonomo || undefined,
      financiado: prop.financiado || undefined,
      importeTotalFinanciado: prop.financiado ? prop.importeTotalFinanciado : undefined,
      mensualidadesTotal: prop.financiado ? prop.mensualidadesTotal : undefined,
      tinFinanciacionPct: prop.financiado ? prop.tinFinanciacionPct : undefined,
      cuotaMensualFinanciada: prop.financiado && finCalc ? finCalc.cuotaMensual : undefined,
      justificanteNombre: prop.justificanteNombre,
      observaciones: prop.explicacion || undefined,
    });

    setProposals((prev) => prev.filter((p) => p.tempId !== prop.tempId));
    setSavedNotice(`Movimiento "${prop.concepto}" guardado correctamente.`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Asistente IA Gemini y Escáner OCR de Tickets"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Asistente IA Gemini · Lenguaje Natural y OCR de Tickets
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Propone la clasificación COICOP y extrae datos del ticket sin alterar cálculos deterministas; tú confirmas antes de guardar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar asistente IA"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {/* Selector de modo */}
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setMode('texto');
              }}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                mode === 'texto'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <MessageSquareText className="h-4 w-4" />
              Texto en lenguaje natural
            </button>
            <button
              type="button"
              onClick={() => setMode('ocr')}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                mode === 'ocr'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
              }`}
            >
              <ScanLine className="h-4 w-4" />
              Cámara / OCR Tickets (estilo Lens)
            </button>
          </div>

          <form onSubmit={handleAnalyze} className="space-y-4">
            {mode === 'ocr' && (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleOpenCamera}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 whitespace-nowrap"
                  >
                    <Camera className="h-4 w-4" />
                    Abrir cámara para fotografiar ticket
                  </button>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700">
                    <Upload className="h-4 w-4" />
                    <span>Subir foto o factura (JPG/PNG/PDF)</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      capture="environment"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {cameraOpen && (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-xl border border-slate-300 bg-black dark:border-slate-700">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="max-h-72 w-full object-contain"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleCapturePhoto}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                      >
                        <Camera className="h-4 w-4" />
                        Capturar ticket
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300"
                      >
                        Cerrar cámara
                      </button>
                    </div>
                  </div>
                )}

                {previewDataUrl && (
                  <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                    {previewMime.startsWith('image/') ? (
                      <img
                        src={previewDataUrl}
                        alt="Vista previa del ticket capturado"
                        className="h-28 w-28 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                        <FileImage className="h-8 w-8 text-blue-700" />
                      </div>
                    )}
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        Archivo listo para lectura OCR: {previewFileName}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewDataUrl(null);
                          setPreviewFileName('');
                        }}
                        className="text-xs font-semibold text-red-700 hover:underline dark:text-red-400"
                      >
                        Quitar imagen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                {mode === 'texto'
                  ? 'Describe uno o varios movimientos en lenguaje natural'
                  : 'Nota adicional opcional sobre el ticket (ej. cuenta utilizada o financiación)'}
              </label>
              <textarea
                rows={mode === 'texto' ? 3 : 2}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={
                  mode === 'texto'
                    ? 'Ej.: "Ayer gasté 64,50 € en Mercadona con la cuenta corriente, y pagué 92 € de recibo de luz deducible" o "Electrodoméstico 900 € financiado en 12 mensualidades"'
                    : 'Opcional: ej. "Pagado con tarjeta o financiado en 6 cuotas"'
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {mode === 'texto' && (
              <div className="flex flex-wrap gap-2">
                {[
                  'Ayer compré 58,40 € en Mercadona y 42 € de gasolina',
                  'Factura de Iberdrola 96,30 € luz deducible de autónomo',
                  'Lavadora nueva 720 € financiada a 12 meses sin intereses',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setTextInput(sample)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void handleToggleVoiceDictation()}
                disabled={transcribingVoice || loading}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  dictatingVoice
                    ? 'bg-red-700 text-white hover:bg-red-800'
                    : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700'
                } disabled:opacity-60`}
              >
                {transcribingVoice ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Transcribiendo audio...
                  </>
                ) : dictatingVoice ? (
                  <>
                    <Square className="h-4 w-4 fill-current" />
                    Detener dictado
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Dictar movimiento por voz
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={loading || transcribingVoice}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analizando con Gemini...
                  </>
                ) : (
                  <>
                    <ScanLine className="h-4 w-4" />
                    {mode === 'ocr' ? 'Leer ticket con OCR' : 'Interpretar y clasificar'}
                  </>
                )}
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3.5 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {savedNotice && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              {savedNotice}
            </div>
          )}

          {ocrSummary && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <strong>Texto OCR leído en el ticket:</strong> {ocrSummary}
            </div>
          )}

          {/* Propuestas detectadas para revisión obligatoria antes de guardar */}
          {proposals.length > 0 && (
            <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Movimientos propuestos ({proposals.length}) · Revisa antes de confirmar
              </h3>

              {proposals.map((prop) => {
                const selectedCat = state.categories.find((c) => c.id === prop.categoriaId);
                const finPreview = prop.financiado
                  ? computeFinancedInstallment(
                      prop.importeTotalFinanciado,
                      prop.mensualidadesTotal,
                      prop.tinFinanciacionPct
                    )
                  : null;

                return (
                  <div
                    key={prop.tempId}
                    className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        Confianza detección: <strong>{prop.confianza.toUpperCase()}</strong>
                        {prop.emisor ? ` · Emisor: ${prop.emisor}` : ''}
                      </span>
                      <span>{prop.explicacion}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Concepto</span>
                        <input
                          type="text"
                          value={prop.concepto}
                          onChange={(e) =>
                            setProposals((prev) =>
                              prev.map((p) =>
                                p.tempId === prop.tempId
                                  ? { ...p, concepto: e.target.value }
                                  : p
                              )
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </label>

                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>{prop.financiado ? 'Total financiado (€)' : 'Importe (€)'}</span>
                        <input
                          type="number"
                          step="0.01"
                          value={prop.financiado ? prop.importeTotalFinanciado : prop.importe}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setProposals((prev) =>
                              prev.map((p) =>
                                p.tempId === prop.tempId
                                  ? p.financiado
                                    ? { ...p, importeTotalFinanciado: val }
                                    : { ...p, importe: val }
                                  : p
                              )
                            );
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm font-bold tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </label>

                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Fecha</span>
                        <input
                          type="date"
                          value={prop.fecha}
                          onChange={(e) =>
                            setProposals((prev) =>
                              prev.map((p) =>
                                p.tempId === prop.tempId ? { ...p, fecha: e.target.value } : p
                              )
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </label>

                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Categoría COICOP</span>
                        <select
                          value={prop.categoriaId}
                          onChange={(e) => {
                            const nextCat = state.categories.find((c) => c.id === e.target.value);
                            setProposals((prev) =>
                              prev.map((p) =>
                                p.tempId === prop.tempId
                                  ? {
                                      ...p,
                                      categoriaId: e.target.value,
                                      subcategoria:
                                        nextCat?.subcategorias[0] ?? 'General',
                                    }
                                  : p
                              )
                            );
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          {state.categories
                            .filter((c) => !c.oculta)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Subcategoría</span>
                        <select
                          value={prop.subcategoria}
                          onChange={(e) =>
                            setProposals((prev) =>
                              prev.map((p) =>
                                p.tempId === prop.tempId
                                  ? { ...p, subcategoria: e.target.value }
                                  : p
                              )
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          {(selectedCat?.subcategorias ?? ['General']).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                        <span>Cuenta</span>
                        <select
                          value={prop.cuentaId}
                          onChange={(e) =>
                            setProposals((prev) =>
                              prev.map((p) =>
                                p.tempId === prop.tempId
                                  ? { ...p, cuentaId: e.target.value }
                                  : p
                              )
                            )
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

                      <div className="flex flex-wrap items-end gap-4 pb-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={prop.esDeducibleAutonomo}
                            onChange={(e) =>
                              setProposals((prev) =>
                                prev.map((p) =>
                                  p.tempId === prop.tempId
                                    ? { ...p, esDeducibleAutonomo: e.target.checked }
                                    : p
                                )
                              )
                            }
                          />
                          <span>Deducible AEAT</span>
                        </label>
                        {prop.tipo === 'gasto' && (
                          <label className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={prop.financiado}
                              onChange={(e) =>
                                setProposals((prev) =>
                                  prev.map((p) =>
                                    p.tempId === prop.tempId
                                      ? {
                                          ...p,
                                          financiado: e.target.checked,
                                          importeTotalFinanciado: e.target.checked
                                            ? p.importeTotalFinanciado || p.importe
                                            : 0,
                                        }
                                      : p
                                  )
                                )
                              }
                            />
                            <span>Financiado a plazos</span>
                          </label>
                        )}
                      </div>
                    </div>

                    {prop.financiado && (
                      <div className="grid grid-cols-1 gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 md:grid-cols-3 dark:border-blue-900 dark:bg-blue-950/20">
                        <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <span>Mensualidades (meses)</span>
                          <input
                            type="number"
                            min="2"
                            max="120"
                            value={prop.mensualidadesTotal}
                            onChange={(e) =>
                              setProposals((prev) =>
                                prev.map((p) =>
                                  p.tempId === prop.tempId
                                    ? {
                                        ...p,
                                        mensualidadesTotal: Math.max(2, Number(e.target.value) || 2),
                                      }
                                    : p
                                )
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                          <span>TIN (%)</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={prop.tinFinanciacionPct}
                            onChange={(e) =>
                              setProposals((prev) =>
                                prev.map((p) =>
                                  p.tempId === prop.tempId
                                    ? {
                                        ...p,
                                        tinFinanciacionPct: Math.max(0, Number(e.target.value) || 0),
                                      }
                                    : p
                                )
                              )
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </label>
                        <div className="flex items-center text-sm font-semibold text-blue-900 dark:text-blue-300">
                          Cuota mensual: {formatEUR(finPreview?.cuotaMensual ?? 0)}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          setProposals((prev) => prev.filter((p) => p.tempId !== prop.tempId))
                        }
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Descartar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmProposal(prop)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800"
                      >
                        <Check className="h-4 w-4" />
                        Confirmar y guardar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
