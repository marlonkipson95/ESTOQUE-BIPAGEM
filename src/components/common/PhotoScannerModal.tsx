import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, Flashlight, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { beepService } from '../../services/beepService';

interface PhotoScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoIdentify: (base64Data: string) => void;
  title?: string;
}

export const PhotoScannerModal: React.FC<PhotoScannerModalProps> = ({
  isOpen,
  onClose,
  onPhotoIdentify,
  title = 'Identificar por IA (Foto)',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let isSubscribed = true;
    setError(null);

    const startCamera = async () => {
      try {
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

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as { torch?: boolean };
          if (capabilities.torch) {
            setHasTorch(true);
          }
        }
      } catch (err: unknown) {
        if (!isSubscribed) return;
        console.error('Camera photo error:', err);
        setError('Não foi possível inicializar a câmera para foto. Verifique as permissões.');
      }
    };

    startCamera();

    return () => {
      isSubscribed = false;
      stopCamera();
    };
  }, [isOpen, facingMode, onClose]);

  const stopCamera = () => {
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

  const handleAiPhotoClick = () => {
    if (!videoRef.current || videoRef.current.videoWidth === 0) {
      setError('Aguarde a câmera iniciar completamente.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL('image/jpeg', 0.8);
      beepService.playSuccess();
      onPhotoIdentify(base64Image);
      stopCamera();
      onClose();
    }
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            <span className="font-semibold text-sm tracking-wide">{title}</span>
          </div>
          <div className="flex items-center gap-2">
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
            </div>
          </div>
          
          <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-3 z-20">
            <button
              type="button"
              onClick={handleAiPhotoClick}
              className="inline-flex items-center gap-2.5 rounded-full px-7 py-3 text-sm font-black shadow-2xl bg-indigo-600 text-white hover:bg-indigo-500 ring-4 ring-indigo-500/30 shadow-indigo-600/50 transition-all active:scale-95"
            >
              <Camera className="h-5 w-5" />
              <span>Tirar Foto (IA)</span>
            </button>
          </div>

          {/* Error notice */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center">
              <AlertCircle className="h-10 w-10 text-amber-400 mb-3" />
              <p className="text-sm font-medium text-slate-200 mb-4">{error}</p>
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
        </div>
      </div>
    </div>
  );
};
