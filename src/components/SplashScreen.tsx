import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { USER_LOGO_PATH } from '../utils/storeHelpers';
import { MediaImage } from './MediaImage';

interface SplashScreenProps {
  logoUrl?: string;
  nameAr: string;
  nameEn: string;
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  logoUrl,
  nameAr,
  nameEn,
  onFinish,
}) => {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const holdMs = prefersReduced ? 350 : 1250;

    const exitTimer = setTimeout(() => setExiting(true), holdMs);
    const doneTimer = setTimeout(() => onFinish(), holdMs + (prefersReduced ? 50 : 280));
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onFinish]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(onFinish, 180);
  };

  return (
    <div
      dir="rtl"
      onClick={handleDismiss}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white px-6 select-none transition-opacity duration-300 ${
        exiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Subtle geometric accent bars inspired by store signage */}
      <div className="absolute top-0 left-0 right-0 h-1.5 flex">
        <div className="flex-1 bg-[#E94F36]" />
        <div className="flex-1 bg-[#B8E638]" />
        <div className="flex-1 bg-[#65D9EA]" />
      </div>

      <div className="animate-zad-splash flex flex-col items-center text-center max-w-sm w-full space-y-6">
        <div className="relative">
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-3xl overflow-hidden border-2 border-zinc-200 bg-zinc-950 shadow-xl">
            <MediaImage
              src={logoUrl || USER_LOGO_PATH}
              alt={nameAr}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-4">
            <span className="w-4 h-1.5 rounded-full bg-[#E94F36]" />
            <span className="w-4 h-1.5 rounded-full bg-[#B8E638]" />
            <span className="w-4 h-1.5 rounded-full bg-[#65D9EA]" />
          </div>
        </div>

        <div className="space-y-1.5">
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-zinc-900 tracking-tight">
            {nameAr}
          </h1>
          <p className="font-mono text-xs sm:text-sm font-bold tracking-[0.22em] text-zinc-500 uppercase">
            {nameEn}
          </p>
        </div>

        <div className="w-44 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
          <div className="h-full w-full bg-[#E94F36] animate-zad-progress rounded-full" />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-600 hover:text-[#E94F36] py-2 px-4 rounded-xl min-h-[44px]"
        >
          <span>دخول إلى المتجر</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
