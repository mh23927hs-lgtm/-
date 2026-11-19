import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Heart, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import type { CartItem, Product } from '../types';
import { formatPrice, getEffectiveProductPrice } from '../utils/storeHelpers';
import { MediaImage } from './MediaImage';

interface ProductModalProps {
  product: Product | null;
  currency: string;
  isFavorite: boolean;
  onToggleFavorite: (productId: string) => void;
  onClose: () => void;
  onAddToCart: (item: CartItem) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  currency,
  isFavorite,
  onToggleFavorite,
  onClose,
  onAddToCart,
}) => {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!product) return;
    const defaults: Record<string, string[]> = {};
    for (const grp of product.optionGroups || []) {
      if (grp.required && grp.maxSelect === 1 && grp.choices.length > 0) {
        defaults[grp.id] = [grp.choices[0].id];
      } else {
        defaults[grp.id] = [];
      }
    }
    setSelectedOptions(defaults);
    setSelectedAddonIds([]);
    setQuantity(1);
    setNote('');
    setValidationError('');
  }, [product]);

  const effectiveBasePrice = useMemo(() => (product ? getEffectiveProductPrice(product) : 0), [product]);

  const unitTotal = useMemo(() => {
    if (!product) return 0;
    let sum = effectiveBasePrice;
    for (const grp of product.optionGroups || []) {
      const picked = selectedOptions[grp.id] || [];
      for (const cid of picked) {
        const ch = grp.choices.find((c) => c.id === cid);
        if (ch) sum += ch.extraPrice || 0;
      }
    }
    for (const aid of selectedAddonIds) {
      const ad = (product.addons || []).find((a) => a.id === aid);
      if (ad) sum += ad.price || 0;
    }
    return Number(sum.toFixed(2));
  }, [product, effectiveBasePrice, selectedOptions, selectedAddonIds]);

  if (!product) return null;

  const isOutOfStock =
    !product.isAvailable ||
    product.isHidden ||
    (typeof product.stockQuantity === 'number' && product.stockQuantity <= 0);

  const maxOrderQty =
    typeof product.stockQuantity === 'number' && product.stockQuantity > 0
      ? product.stockQuantity
      : 99;

  const handleOptionToggle = (groupId: string, choiceId: string, maxSelect: number) => {
    setValidationError('');
    setSelectedOptions((prev) => {
      const current = prev[groupId] || [];
      if (maxSelect === 1) {
        return { ...prev, [groupId]: current.includes(choiceId) ? [] : [choiceId] };
      }
      if (current.includes(choiceId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== choiceId) };
      }
      if (maxSelect > 0 && current.length >= maxSelect) {
        return prev;
      }
      return { ...prev, [groupId]: [...current, choiceId] };
    });
  };

  const handleAddonToggle = (addonId: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId],
    );
  };

  const handleConfirm = () => {
    if (isOutOfStock) return;

    for (const grp of product.optionGroups || []) {
      const picked = selectedOptions[grp.id] || [];
      const minRequired = grp.required ? Math.max(1, grp.minSelect || 1) : (grp.minSelect || 0);
      if (picked.length < minRequired) {
        setValidationError(`يرجى اختيار ${minRequired} على الأقل من "${grp.name}"`);
        return;
      }
      if (grp.maxSelect > 0 && picked.length > grp.maxSelect) {
        setValidationError(`الحد الأقصى للاختيار في "${grp.name}" هو ${grp.maxSelect}`);
        return;
      }
    }

    const pickedOptionsFlat: CartItem['selectedOptionChoices'] = [];
    for (const grp of product.optionGroups || []) {
      const pickedIds = selectedOptions[grp.id] || [];
      for (const cid of pickedIds) {
        const ch = grp.choices.find((c) => c.id === cid);
        if (ch) {
          pickedOptionsFlat.push({
            groupId: grp.id,
            groupName: grp.name,
            choiceId: ch.id,
            choiceName: ch.name,
            extraPrice: ch.extraPrice || 0,
          });
        }
      }
    }

    const pickedAddons = (product.addons || [])
      .filter((a) => selectedAddonIds.includes(a.id))
      .map((a) => ({ id: a.id, name: a.name, price: a.price || 0 }));

    const keyParts = [
      product.id,
      pickedOptionsFlat.map((o) => `${o.groupId}:${o.choiceId}`).sort().join(','),
      pickedAddons.map((a) => a.id).sort().join(','),
      note.trim(),
    ];

    onAddToCart({
      cartKey: keyParts.join('|'),
      productId: product.id,
      productName: product.name,
      imageUrl: product.imageUrl,
      baseUnitPrice: effectiveBasePrice,
      quantity,
      selectedOptionChoices: pickedOptionsFlat,
      selectedAddons: pickedAddons,
      note: note.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white border border-zinc-200 overflow-hidden shadow-2xl">
        {/* Header image */}
        <div className="relative h-56 sm:h-64 bg-zinc-100 shrink-0">
          <MediaImage
            src={product.imageUrl}
            alt={product.name}
            fallbackLabel={product.name}
            className="w-full h-full object-cover"
          />
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/95 border border-zinc-200 flex items-center justify-center text-zinc-800 hover:bg-white shadow-sm"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={() => onToggleFavorite(product.id)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/95 border border-zinc-200 flex items-center justify-center text-zinc-800 hover:bg-white shadow-sm"
            aria-label="المفضلة"
          >
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-[#E94F36] text-[#E94F36]' : 'text-zinc-600'}`} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-xl font-extrabold text-zinc-900">{product.name}</h2>
              <div className="text-left shrink-0 tabular-nums">
                <div className="text-lg font-extrabold text-[#E94F36]">
                  {formatPrice(effectiveBasePrice, currency)}
                </div>
                {typeof product.discountPrice === 'number' && product.discountPrice < product.price && (
                  <div className="text-xs text-zinc-400 line-through">
                    {formatPrice(product.price, currency)}
                  </div>
                )}
              </div>
            </div>

            {product.description && (
              <p className="text-sm text-zinc-600 leading-relaxed">{product.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 pt-1">
              {typeof product.prepTimeMinutes === 'number' && product.prepTimeMinutes > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#65D9EA]" />
                  مدة التحضير: {product.prepTimeMinutes} دقيقة
                </span>
              )}
              {typeof product.calories === 'number' && product.calories > 0 && (
                <span className="tabular-nums">{product.calories} سعرة حرارية</span>
              )}
              {typeof product.stockQuantity === 'number' && (
                <span className="tabular-nums">المتوفر: {product.stockQuantity}</span>
              )}
            </div>
            {product.allergens && (
              <p className="text-xs text-amber-700 pt-1">
                تنبيه الحساسية: {product.allergens}
              </p>
            )}
          </div>

          {/* Option Groups */}
          {(product.optionGroups || []).map((grp) => {
            const picked = selectedOptions[grp.id] || [];
            return (
              <div key={grp.id} className="space-y-2.5 pt-3 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-zinc-900">{grp.name}</h3>
                  <span className="text-xs text-zinc-500">
                    {grp.required ? 'إجباري' : 'اختياري'}
                    {grp.maxSelect > 1 ? ` · حتى ${grp.maxSelect} خيارات` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {grp.choices.map((ch) => {
                    const active = picked.includes(ch.id);
                    return (
                      <button
                        type="button"
                        key={ch.id}
                        onClick={() => handleOptionToggle(grp.id, ch.id, grp.maxSelect || 1)}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm transition-colors min-h-[44px] ${
                          active
                            ? 'border-[#E94F36] bg-[#E94F36]/8 text-zinc-900 font-bold'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                        }`}
                      >
                        <span>{ch.name}</span>
                        {ch.extraPrice > 0 && (
                          <span className="text-xs text-[#E94F36] tabular-nums">
                            +{formatPrice(ch.extraPrice, currency)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Addons */}
          {(product.addons || []).length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-zinc-100">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-zinc-900">الإضافات</h3>
                <span className="text-xs text-zinc-500">اختياري</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.addons.map((addon) => {
                  const active = selectedAddonIds.includes(addon.id);
                  return (
                    <button
                      type="button"
                      key={addon.id}
                      onClick={() => handleAddonToggle(addon.id)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm transition-colors min-h-[44px] ${
                        active
                          ? 'border-[#B8E638] bg-[#B8E638]/20 text-zinc-900 font-bold'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                      }`}
                    >
                      <span>{addon.name}</span>
                      <span className="text-xs text-zinc-600 tabular-nums">
                        +{formatPrice(addon.price, currency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2 pt-3 border-t border-zinc-100">
            <label className="block text-sm font-bold text-zinc-900">ملاحظات خاصة (اختياري)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="مثال: بدون مخلل، تحمير إضافي..."
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#E94F36]"
            />
          </div>

          {validationError && (
            <div className="rounded-xl bg-[#E94F36]/10 border border-[#E94F36]/30 px-4 py-2.5 text-xs font-bold text-[#E94F36]">
              {validationError}
            </div>
          )}
        </div>

        {/* Sticky Bottom CTA */}
        <div className="p-4 sm:p-5 border-t border-zinc-200 bg-white flex items-center gap-3 shrink-0">
          <div className="flex items-center border border-zinc-200 rounded-xl bg-zinc-50 shrink-0">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-11 h-11 flex items-center justify-center text-zinc-700 hover:text-zinc-900"
              aria-label="إنقاص الكمية"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-9 text-center font-bold text-sm tabular-nums">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(maxOrderQty, q + 1))}
              className="w-11 h-11 flex items-center justify-center text-zinc-700 hover:text-zinc-900"
              aria-label="زيادة الكمية"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            disabled={isOutOfStock}
            onClick={handleConfirm}
            className="flex-1 h-11 rounded-xl bg-[#E94F36] text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#d54028] disabled:bg-zinc-300 disabled:text-zinc-500 transition-colors px-4"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>
              {isOutOfStock
                ? 'غير متوفر حالياً'
                : `إضافة للسلة · ${formatPrice(unitTotal * quantity, currency)}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
