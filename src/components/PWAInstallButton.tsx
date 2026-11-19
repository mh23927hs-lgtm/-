import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'full' }> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={
          variant === 'full'
            ? 'w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white hover:bg-zinc-800 transition-colors min-h-[44px]'
            : 'inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0 min-h-[40px]'
        }
      >
        <Download className="w-4 h-4 text-[#E94F36]" />
        <span>تثبيت التطبيق</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'full'
              ? 'w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-bold text-zinc-800 hover:bg-zinc-50 transition-colors min-h-[44px]'
              : 'inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0 min-h-[40px]'
          }
        >
          <Smartphone className="w-4 h-4 text-[#E94F36]" />
          <span>تثبيت على iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 border border-zinc-200 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold text-zinc-900">تثبيت تطبيق زاد مهاوي</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100"
                  aria-label="إغلاق"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-sm text-zinc-600 space-y-2 list-decimal list-inside leading-relaxed">
                <li>اضغط على زر <strong>المشاركة (Share)</strong> في متصفح Safari.</li>
                <li>اختر <strong>إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong>.</li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-[#E94F36] py-2.5 text-sm font-bold text-white hover:bg-[#d54028]"
              >
                حسناً
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
