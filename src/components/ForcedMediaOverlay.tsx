import { useEffect, useRef, useState } from 'react';
import { ShieldAlert, Play, Eye, Check } from 'lucide-react';

interface Props {
  mediaUrl: string;
  category?: string | null;
  onComplete: () => void;
}

function isVideoMedia(url: string, category?: string | null): boolean {
  if (category === 'sissy_hypno') return true;
  const videoExts = ['.mp4', '.webm', '.ogg', '.ogv', '.mov', '.m4v'];
  const clean = url.split('?')[0].toLowerCase();
  return videoExts.some((ext) => clean.endsWith(ext));
}

export default function ForcedMediaOverlay({ mediaUrl, category, onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const isVideo = isVideoMedia(mediaUrl, category);

  useEffect(() => {
    if (!isVideo) return;

    const handleBlur = () => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    const handleFocus = () => {
      if (videoRef.current && hasStarted) {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(err => console.error("Auto-play on focus failed", err));
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [hasStarted, isVideo]);

  const handleStart = () => {
    if (isVideo) {
      videoRef.current?.play().then(() => {
        setIsPlaying(true);
        setHasStarted(true);
      });
    } else {
      setHasStarted(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      <div className="w-full h-full max-w-none aspect-video bg-black relative overflow-hidden">
        {isVideo ? (
          <video
            ref={videoRef}
            src={mediaUrl}
            className="w-full h-full object-contain"
            onEnded={onComplete}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            playsInline
          />
        ) : hasStarted ? (
          <img
            src={mediaUrl}
            alt=""
            className="w-full h-full object-contain"
          />
        ) : null}

        {!hasStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10">
            <button
              onClick={handleStart}
              className="w-20 h-20 flex items-center justify-center rounded-full bg-red-900/50 hover:bg-red-800/80 border border-red-500 transition-colors"
            >
              {isVideo ? (
                <Play className="w-8 h-8 text-white ml-1" />
              ) : (
                <Eye className="w-8 h-8 text-white" />
              )}
            </button>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 mt-6">
              Lyra hat dir ein {isVideo ? 'Video' : 'Bild'} geschickt.
            </p>
          </div>
        )}

        {hasStarted && isVideo && !isPlaying && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-10">
            <ShieldAlert className="w-10 h-10 text-red-500 mb-4 animate-pulse" />
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-white">Weggucken wird bestraft.</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40 mt-2">Kehr zum Fenster zurück, um weiterzusehen.</p>
          </div>
        )}

        {hasStarted && !isVideo && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center pb-10 z-10 bg-gradient-to-t from-black/80 to-transparent pt-12">
            <button
              onClick={onComplete}
              className="flex items-center gap-2 px-4 py-2 bg-red-900/60 hover:bg-red-800/80 border border-red-500/50 rounded text-[10px] uppercase tracking-widest text-white transition-colors"
            >
              <Check className="w-4 h-4" /> Bestätigen
            </button>
          </div>
        )}

        <div className="absolute top-6 left-6 flex gap-2">
          <span className="text-[9px] bg-red-950/80 text-red-500 px-2 py-0.5 rounded border border-red-900/50 flex items-center gap-1 uppercase tracking-widest font-mono">
            Von Lyra
          </span>
        </div>
      </div>
    </div>
  );
}
