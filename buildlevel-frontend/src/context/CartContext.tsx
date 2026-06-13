import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { publicApi, type CartProductType, type CartSyncItem, type DigitalProduct, type Product, type SavedCart } from "../lib/api";

const CART_STORAGE_KEY = "buildlevel_cart_v1";
const CART_DISMISSED_KEY = "buildlevel_cart_reminder_dismissed_v1";
const CART_TTL_DAYS = 30;

export type CartItem = {
  productType: CartProductType;
  productId: number;
  name: string;
  imageUrl?: string;
  quantity: number;
  unitPrice: number;
  selectedSize?: string;
  selectedColor?: string;
  selectedVariant?: string;
  printifyVariantId?: string;
  printifyProductId?: string;
};

type StoredCart = {
  sessionId: string;
  email?: string;
  firstName?: string;
  items: CartItem[];
  expiresAt: string;
  updatedAt: string;
};

type AddApparelInput = {
  product: Product;
  quantity?: number;
  unitPrice: number;
  selectedSize?: string;
  selectedColor?: string;
  selectedVariant?: string;
  printifyVariantId?: string;
  imageUrl?: string;
};

type CartContextValue = {
  sessionId: string;
  items: CartItem[];
  email: string;
  firstName: string;
  isOpen: boolean;
  notice: string;
  lastSyncedCart?: SavedCart;
  itemCount: number;
  subtotal: number;
  hasDismissedReminder: boolean;
  openCart: () => void;
  closeCart: () => void;
  dismissReminder: () => void;
  addApparel: (input: AddApparelInput) => void;
  addDigital: (product: DigitalProduct, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: (type?: CartProductType) => void;
  setCustomer: (data: { email?: string; firstName?: string }) => void;
  checkoutApparel: () => Promise<void>;
  checkoutDigital: (item?: CartItem) => Promise<void>;
  markConverted: (completedOrderId?: string) => Promise<void>;
  restoreFromSavedCart: (cart: SavedCart) => void;
  getItemKey: (item: CartItem) => string;
};

const CartContext = createContext<CartContextValue | null>(null);

function createSessionId() {
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `bl-cart-${random}`;
}

function readStoredCart(): StoredCart {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "null") as StoredCart | null;
    if (parsed?.sessionId && parsed.expiresAt && Date.now() < Date.parse(parsed.expiresAt)) return parsed;
  } catch {
    // Ignore broken storage and start fresh.
  }
  return {
    sessionId: createSessionId(),
    items: [],
    expiresAt: new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getItemKey(item: CartItem) {
  return [item.productType, item.productId, item.selectedVariant || item.printifyVariantId || item.selectedSize || "default"].join(":");
}

function toCheckoutItems(items: CartItem[]) {
  return items.map(item => ({
    productId: item.productId,
    name: `${item.name}${item.selectedSize ? ` (${item.selectedSize})` : ""}`,
    size: item.selectedVariant || item.selectedSize || "",
    variantId: item.printifyVariantId || item.selectedVariant || "",
    priceUSD: item.unitPrice,
    quantity: item.quantity,
    image: item.imageUrl && /^https?:\/\//i.test(item.imageUrl) ? item.imageUrl : undefined,
  }));
}

function toSyncItems(items: CartItem[]): CartSyncItem[] {
  return items.map(item => ({
    productType: item.productType,
    productId: item.productId,
    quantity: item.quantity,
    selectedSize: item.selectedSize || "",
    selectedColor: item.selectedColor || "",
    selectedVariant: item.selectedVariant || "",
    printifyVariantId: item.printifyVariantId || "",
  }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredCart>(() => readStoredCart());
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [lastSyncedCart, setLastSyncedCart] = useState<SavedCart | undefined>();
  const [hasDismissedReminder, setHasDismissedReminder] = useState(() => localStorage.getItem(CART_DISMISSED_KEY) === stored.sessionId);

  const subtotal = stored.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const itemCount = stored.items.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const next: StoredCart = {
      ...stored,
      expiresAt: new Date(Date.now() + CART_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
  }, [stored]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(id);
  }, [notice]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      publicApi.syncCart({
        sessionId: stored.sessionId,
        customerEmail: stored.email || "",
        customerFirstName: stored.firstName || "",
        items: toSyncItems(stored.items),
      }).then(result => setLastSyncedCart(result.cart)).catch(() => undefined);
    }, 550);
    return () => window.clearTimeout(id);
  }, [stored.sessionId, stored.email, stored.firstName, JSON.stringify(toSyncItems(stored.items))]);

  const setCustomer = (data: { email?: string; firstName?: string }) => {
    setStored(current => ({ ...current, email: data.email ?? current.email, firstName: data.firstName ?? current.firstName }));
  };

  const mergeItem = (item: CartItem) => {
    setStored(current => {
      const key = getItemKey(item);
      const existing = current.items.find(entry => getItemKey(entry) === key);
      const items = existing
        ? current.items.map(entry => getItemKey(entry) === key ? { ...entry, quantity: Math.min(99, entry.quantity + item.quantity) } : entry)
        : [...current.items, item];
      return { ...current, items };
    });
    setNotice(`${item.name} added to cart.`);
  };

  const addApparel = (input: AddApparelInput) => {
    mergeItem({
      productType: "apparel",
      productId: input.product.id,
      name: input.product.name,
      imageUrl: input.imageUrl || input.product.imageUrl,
      quantity: Math.max(1, input.quantity || 1),
      unitPrice: input.unitPrice,
      selectedSize: input.selectedSize,
      selectedColor: input.selectedColor,
      selectedVariant: input.selectedVariant || input.selectedSize,
      printifyVariantId: input.printifyVariantId,
      printifyProductId: input.product.printifyProductId || "",
    });
  };

  const addDigital = (product: DigitalProduct, quantity = 1) => {
    mergeItem({
      productType: "digital",
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      quantity: Math.max(1, quantity),
      unitPrice: Number.parseFloat(product.price),
      selectedVariant: product.productType,
    });
  };

  const updateQuantity = (key: string, quantity: number) => {
    setStored(current => ({
      ...current,
      items: current.items.map(item => getItemKey(item) === key ? { ...item, quantity: Math.max(1, Math.min(99, quantity)) } : item),
    }));
  };

  const removeItem = (key: string) => {
    setStored(current => ({ ...current, items: current.items.filter(item => getItemKey(item) !== key) }));
  };

  const clearCart = (type?: CartProductType) => {
    setStored(current => ({ ...current, items: type ? current.items.filter(item => item.productType !== type) : [] }));
  };

  const checkoutApparel = async () => {
    const apparel = stored.items.filter(item => item.productType === "apparel");
    if (!apparel.length) return;
    const { url } = await publicApi.createCheckout(toCheckoutItems(apparel), "usd", stored.email);
    window.location.assign(url);
  };

  const checkoutDigital = async (item?: CartItem) => {
    const target = item || stored.items.find(entry => entry.productType === "digital");
    if (!target) return;
    const { url } = await publicApi.createDigitalCheckout(target.productId, stored.email);
    window.location.assign(url);
  };

  const markConverted = async (completedOrderId?: string) => {
    await publicApi.markCartConverted({ sessionId: stored.sessionId, completedOrderId }).catch(() => undefined);
  };

  const restoreFromSavedCart = (cart: SavedCart) => {
    setStored(current => ({
      ...current,
      sessionId: cart.sessionId || current.sessionId,
      email: cart.customerEmail || current.email,
      firstName: cart.customerFirstName || current.firstName,
      items: cart.items.map(item => ({
        productType: item.productType,
        productId: item.productId,
        name: item.productName,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        selectedSize: item.selectedSize,
        selectedColor: item.selectedColor,
        selectedVariant: item.selectedVariant,
        printifyVariantId: item.printifyVariantId,
      })),
    }));
    setNotice("Your saved Build Level cart has been restored.");
    setIsOpen(true);
  };

  const value = useMemo<CartContextValue>(() => ({
    sessionId: stored.sessionId,
    items: stored.items,
    email: stored.email || "",
    firstName: stored.firstName || "",
    isOpen,
    notice,
    lastSyncedCart,
    itemCount,
    subtotal,
    hasDismissedReminder,
    openCart: () => setIsOpen(true),
    closeCart: () => setIsOpen(false),
    dismissReminder: () => {
      localStorage.setItem(CART_DISMISSED_KEY, stored.sessionId);
      setHasDismissedReminder(true);
    },
    addApparel,
    addDigital,
    updateQuantity,
    removeItem,
    clearCart,
    setCustomer,
    checkoutApparel,
    checkoutDigital,
    markConverted,
    restoreFromSavedCart,
    getItemKey,
  }), [stored, isOpen, notice, lastSyncedCart, itemCount, subtotal, hasDismissedReminder]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
