import { useEffect, useRef, useState } from 'react';
import { ShieldAlert, Play } from 'lucide-react';

interface Props {
  videoUrl: string;
  onComplete: () => void;
}

export default function ForcedMediaOverlay({ videoUrl, onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
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
  }, [hasStarted]);

  const handleStart = () => {
    if (videoRef.current) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
        setHasStarted(true);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      <div className="w-full h-full max-w-none aspect-video bg-black relative overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          onEnded={onComplete}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          playsInline
        />

        {!hasStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10">
            <button
              onClick={handleStart}
              className="w-20 h-20 flex items-center justify-center rounded-full bg-red-900/50 hover:bg-red-800/80 border border-red-500 transition-colors"
            >
              <Play className="w-8 h-8 text-white ml-1" />
            </button>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 mt-6">Mandatory Sequence. Initiate.</p>
          </div>
        )}

        {hasStarted && !isPlaying && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md z-10">
            <ShieldAlert className="w-10 h-10 text-red-500 mb-4 animate-pulse" />
            <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-white">Focus Lost. Playback Paused.</p>
            <p className="text-[10px] uppercase tracking-widest text-white/40 mt-2">Return to window to continue.</p>
          </div>
        )}

        <div className="absolute top-6 left-6 flex gap-2">
          <span className="text-[9px] bg-red-950/80 text-red-500 px-2 py-0.5 rounded border border-red-900/50 flex items-center gap-1 uppercase tracking-widest font-mono">
            Forced Feed
          </span>
        </div>
      </div>
    </div>
  );
}
