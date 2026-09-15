import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { X, Camera, Flashlight, RefreshCw, AlertCircle, Keyboard } from 'lucide-react';
import { beepService } from '../../services/beepService';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Escanear Código de Barras',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let isSubscribed = true;
    setError(null);

    const startCamera = async () => {
      try {
        const codeReader = new BrowserMultiFormatReader();
        codeReaderRef.current = codeReader;

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (!isSubscribed) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Check torch support
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as { torch?: boolean };
          if (capabilities.torch) {
            setHasTorch(true);
          }
        }

        // Continuous scanning
        codeReader.decodeFromVideoElement(videoRef.current!, (result, err) => {
          if (result && isSubscribed) {
            const text = result.getText();
            if (text) {
              beepService.playSuccess();
              onScan(text);
              stopCamera();
              onClose();
            }
          }
          if (err && !(err.name === 'NotFoundException')) {
            // Normal search frame noise, ignore
          }
        });
      } catch (err: unknown) {
        if (!isSubscribed) return;
        console.error('Camera scan error:', err);
        const errMessage = (err as Error)?.message || '';
        if (errMessage.includes('Permission') || errMessage.includes('denied')) {
          setError('Permissão de acesso à câmera não concedida. Você pode digitar o código manualmente.');
        } else {
          setError('Não foi possível inicializar a câmera do dispositivo. Verifique as permissões.');
        }
      }
    };

    startCamera();

    return () => {
      isSubscribed = false;
      stopCamera();
    };
  }, [isOpen, facingMode, onClose, onScan]);

  const stopCamera = () => {
    if (codeReaderRef.current) {
      // BrowserMultiFormatReader cleanup if available
      codeReaderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const newStatus = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: newStatus }],
      });
      setTorchOn(newStatus);
    } catch (e) {
      console.warn('Torch toggle not supported on this device', e);
    }
  };

  const toggleFacingMode = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      beepService.playSuccess();
      onScan(manualCode.trim());
      stopCamera();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-indigo-400" />
            <span className="font-semibold text-sm tracking-wide">{title}</span>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Camera Stage */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Viewfinder Target Graphic */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="relative h-44 w-64 rounded-xl border-2 border-dashed border-indigo-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
              {/* Corner brackets */}
              <div className="absolute -top-1 -left-1 h-5 w-5 border-t-4 border-l-4 border-indigo-400 rounded-tl" />
              <div className="absolute -top-1 -right-1 h-5 w-5 border-t-4 border-r-4 border-indigo-400 rounded-tr" />
              <div className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-indigo-400 rounded-bl" />
              <div className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-indigo-400 rounded-br" />

              {/* Red Laser Sweep Line Animation */}
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse" />
            </div>
          </div>

          {/* Error notice */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center">
              <AlertCircle className="h-10 w-10 text-amber-400 mb-3" />
              <p className="text-sm font-medium text-slate-200 mb-4">{error}</p>
              <button
                onClick={() => setShowManualInput(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
              >
                <Keyboard className="h-4 w-4" /> Digitar Código
              </button>
            </div>
          )}
        </div>

        {/* Controls Toolbar */}
        <div className="flex items-center justify-around border-t border-slate-800 bg-slate-900 px-4 py-3">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                torchOn ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Flashlight className="h-4 w-4" />
              {torchOn ? 'Lanterna Ligada' : 'Lanterna'}
            </button>
          )}

          <button
            onClick={toggleFacingMode}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <RefreshCw className="h-4 w-4" /> Alternar Câmera
          </button>

          <button
            onClick={() => setShowManualInput(prev => !prev)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <Keyboard className="h-4 w-4" /> Manual
          </button>
        </div>

        {/* Optional Manual Input Tray */}
        {showManualInput && (
          <form onSubmit={handleManualSubmit} className="border-t border-slate-800 bg-slate-950 p-4">
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Entrada manual do código:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Ex: 7891234567890 ou ABC-4589"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-indigo-500"
              >
                OK
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
