import React, { useState } from 'react';
import { Minus, Plus, ShoppingCart, Tag, Trash2, X } from 'lucide-react';
import type { CartItem, Offer } from '../types';
import { calculateCartItemTotal, formatPrice } from '../utils/storeHelpers';
import { MediaImage } from './MediaImage';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  currency: string;
  offers: Offer[];
  appliedCoupon: Offer | null;
  onApplyCoupon: (offer: Offer | null) => void;
  onUpdateQty: (cartKey: string, delta: number) => void;
  onRemoveItem: (cartKey: string) => void;
  onClearCart: () => void;
  onProceedCheckout: () => void;
  defaultDeliveryFee: number;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  currency,
  offers,
  appliedCoupon,
  onApplyCoupon,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onProceedCheckout,
  defaultDeliveryFee,
}) => {
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');

  if (!isOpen) return null;

  const subtotal = Number(
    cart.reduce((sum, item) => sum + calculateCartItemTotal(item), 0).toFixed(2),
  );

  let discountAmount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.minOrderAmount && subtotal < appliedCoupon.minOrderAmount) {
      discountAmount = 0;
    } else if (appliedCoupon.discountType === 'percent') {
      discountAmount = Number(((subtotal * appliedCoupon.discountValue) / 100).toFixed(2));
    } else {
      discountAmount = Number(Math.min(subtotal, appliedCoupon.discountValue).toFixed(2));
    }
  }

  const handleCheckCoupon = () => {
    setCouponError('');
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const today = new Date().toISOString().slice(0, 10);
    const match = offers.find((o) => {
      if (o.type !== 'coupon' || !o.isActive) return false;
      if ((o.code || '').toUpperCase() !== code) return false;
      if (o.startDate && o.startDate > today) return false;
      if (o.endDate && o.endDate < today) return false;
      return true;
    });
    if (!match) {
      setCouponError('كود الخصم غير صحيح أو منتهي الصلاحية');
      onApplyCoupon(null);
      return;
    }
    if (match.minOrderAmount && subtotal < match.minOrderAmount) {
      setCouponError(`يتطلب الكود حداً أدنى للطلب ${formatPrice(match.minOrderAmount, currency)}`);
      onApplyCoupon(null);
      return;
    }
    onApplyCoupon(match);
  };

  const estimatedTotal = Number(Math.max(0, subtotal - discountAmount).toFixed(2));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full flex flex-col border-r border-zinc-200 shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="w-5 h-5 text-[#E94F36]" />
            <h2 className="font-display text-lg font-extrabold text-zinc-900">سلة المشتريات</h2>
            <span className="text-xs font-bold text-zinc-500 tabular-nums">({cart.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {cart.length > 0 && (
              <button
                onClick={onClearCart}
                className="text-xs font-medium text-zinc-500 hover:text-[#E94F36] px-2 py-1"
              >
                إفراغ
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                <ShoppingCart className="w-7 h-7" />
              </div>
              <p className="font-display font-bold text-zinc-800">سلة المشتريات فارغة</p>
              <p className="text-sm text-zinc-500 max-w-xs">
                أضف منتجاتك المفضلة من القائمة للمتابعة إلى إتمام الطلب.
              </p>
            </div>
          ) : (
            cart.map((item) => {
              const lineTotal = calculateCartItemTotal(item);
              return (
                <div key={item.cartKey} className="flex gap-3.5 pb-4 border-b border-zinc-100">
                  <MediaImage
                    src={item.imageUrl}
                    alt={item.productName}
                    className="w-20 h-20 rounded-xl object-cover shrink-0 border border-zinc-200"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-bold text-sm text-zinc-900 truncate">
                        {item.productName}
                      </h3>
                      <button
                        onClick={() => onRemoveItem(item.cartKey)}
                        className="text-zinc-400 hover:text-[#E94F36] p-1"
                        aria-label="حذف المنتج"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {item.selectedOptionChoices.length > 0 && (
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        {item.selectedOptionChoices.map((o) => `${o.groupName}: ${o.choiceName}`).join(' · ')}
                      </p>
                    )}

                    {item.selectedAddons.length > 0 && (
                      <p className="text-xs text-zinc-500">
                        إضافات: {item.selectedAddons.map((a) => a.name).join('، ')}
                      </p>
                    )}

                    {item.note && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
                        ملاحظة: {item.note}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1.5">
                      <div className="inline-flex items-center border border-zinc-200 rounded-lg bg-zinc-50">
                        <button
                          onClick={() => onUpdateQty(item.cartKey, -1)}
                          className="w-8 h-8 flex items-center justify-center text-zinc-700"
                          aria-label="إنقاص"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-7 text-center text-xs font-bold tabular-nums">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQty(item.cartKey, 1)}
                          className="w-8 h-8 flex items-center justify-center text-zinc-700"
                          aria-label="زيادة"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="font-bold text-sm text-zinc-900 tabular-nums">
                        {formatPrice(lineTotal, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Totals & Coupon */}
        {cart.length > 0 && (
          <div className="p-5 border-t border-zinc-200 bg-zinc-50 space-y-4">
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="w-4 h-4 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="لديك كود خصم؟"
                    className="w-full h-10 pr-9 pl-3 rounded-xl border border-zinc-200 bg-white text-sm focus:outline-none focus:border-[#E94F36]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCheckCoupon}
                  className="px-4 h-10 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 whitespace-nowrap"
                >
                  تطبيق
                </button>
              </div>
              {couponError && <p className="text-xs text-[#E94F36] font-medium">{couponError}</p>}
              {appliedCoupon && (
                <div className="flex items-center justify-between text-xs text-emerald-700 font-medium">
                  <span>تم تطبيق الكود: {appliedCoupon.code}</span>
                  <button onClick={() => onApplyCoupon(null)} className="underline">
                    إزالة
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>المجموع الفرعي</span>
                <span className="tabular-nums font-medium">{formatPrice(subtotal, currency)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>الخصم</span>
                  <span className="tabular-nums font-bold">-{formatPrice(discountAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-500 text-xs">
                <span>رسوم التوصيل</span>
                <span>تُحدد حسب المنطقة (الافتراضي {formatPrice(defaultDeliveryFee, currency)})</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-zinc-900 pt-2 border-t border-zinc-200">
                <span>الإجمالي المبدئي</span>
                <span className="tabular-nums text-[#E94F36]">{formatPrice(estimatedTotal, currency)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onProceedCheckout}
              className="w-full h-12 rounded-xl bg-[#E94F36] text-white font-bold text-sm hover:bg-[#d54028] transition-colors"
            >
              متابعة إتمام الطلب
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
