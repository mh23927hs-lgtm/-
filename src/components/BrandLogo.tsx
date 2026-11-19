import React from 'react';
import { USER_LOGO_PATH } from '../utils/storeHelpers';
import { MediaImage } from './MediaImage';

interface BrandLogoProps {
  logoUrl?: string;
  nameAr?: string;
  nameEn?: string;
  compact?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  logoUrl,
  nameAr = 'زاد مهاوي',
  nameEn = 'ZAD MAHAWI',
  compact = false,
}) => {
  const effectiveSrc = logoUrl || USER_LOGO_PATH;

  return (
    <div className="flex items-center gap-3 shrink-0">
      <MediaImage
        src={effectiveSrc}
        alt={nameAr}
        className="w-10 h-10 rounded-xl object-cover border border-zinc-200 bg-zinc-950 shrink-0 shadow-xs"
      />
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="font-display font-extrabold text-lg text-zinc-900 whitespace-nowrap">
            {nameAr}
          </span>
          <span className="font-mono text-[10px] tracking-wider text-zinc-500 whitespace-nowrap mt-0.5">
            {nameEn}
          </span>
        </div>
      )}
    </div>
  );
};
