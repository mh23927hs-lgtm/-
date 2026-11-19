import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { ImageOff } from 'lucide-react';
import { db } from '../firebase';

const mediaMemoryCache = new Map<string, string>();

interface MediaImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export const MediaImage: React.FC<MediaImageProps> = ({ src, alt, className = '', fallbackLabel }) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    if (!src) {
      setResolvedUrl('');
      return;
    }

    if (src.startsWith('media://')) {
      const mediaId = src.slice('media://'.length);
      const cached = mediaMemoryCache.get(mediaId);
      if (cached) {
        setResolvedUrl(cached);
        return;
      }
      getDoc(doc(db, 'media', mediaId))
        .then((snap) => {
          if (!active) return;
          if (snap.exists()) {
            const dataUrl = String(snap.data().dataUrl || '');
            mediaMemoryCache.set(mediaId, dataUrl);
            setResolvedUrl(dataUrl);
          } else {
            setFailed(true);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    } else {
      setResolvedUrl(src);
    }

    return () => {
      active = false;
    };
  }, [src]);

  if (!src || failed || !resolvedUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-zinc-100 text-zinc-400 select-none ${className}`}
        aria-label={alt}
      >
        <div className="flex items-center gap-1 mb-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#E94F36]/70" />
          <span className="w-2.5 h-2.5 rounded-xs bg-[#B8E638]/80" />
          <span className="w-2.5 h-2.5 rounded-xs bg-[#65D9EA]/80" />
        </div>
        <ImageOff className="w-5 h-5 text-zinc-400" />
        {fallbackLabel && <span className="text-[11px] text-zinc-500 mt-1 px-2 text-center truncate max-w-full">{fallbackLabel}</span>}
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
