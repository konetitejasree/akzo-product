"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  Home,
  LogOut,
  MessageCircle,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useCart } from "../../components/cart-provider";
import { ProtectedRoute, useAuth } from "../../components/auth-provider";

export default function CartPage() {
  const router = useRouter();
  const path = usePathname();
  const { items, cartCount, cartTotal, updateQuantity, removeItem, clearCart } = useCart();
  const { isAdmin, logout } = useAuth();
  const handleLogout = () => {
    logout();
    router.push("/");
  };

  return (
    <ProtectedRoute allowRoles={["user", "admin"]}>
      <div className="app-shell flex h-screen">
      <aside className="left-rail w-72 text-white p-5 flex flex-col">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-lg bg-white/12 grid place-items-center">
            <Bot size={22} />
          </div>
          <h1 className="text-lg font-bold">Akzo Product Assistant</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <button onClick={() => router.push("/dashboard")} className={`nav-button ${path === "/dashboard" ? "nav-button-active" : ""}`}>
            <Home size={18} />
            Home
          </button>
          {isAdmin && (
            <button onClick={() => router.push("/admin")} className={`nav-button ${path === "/admin" ? "nav-button-active" : ""}`}>
              <BarChart3 size={18} />
              Admin
            </button>
          )}
          <button onClick={() => router.push("/chat")} className={`nav-button ${path === "/chat" ? "nav-button-active" : ""}`}>
            <MessageCircle size={18} />
            Ask Assistant
          </button>
          <button onClick={() => router.push("/cart")} className={`nav-button ${path === "/cart" ? "nav-button-active" : ""}`}>
            <ShoppingCart size={18} />
            Cart
            <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white">{cartCount}</span>
          </button>
        </nav>

        <div className="mt-auto rounded-lg border border-white/10 bg-white/8 p-4">
          <p className="text-sm font-semibold">Cart ready</p>
          <p className="text-xs text-white/55 mt-1">
            Items you add from chat are stored here for the demo session.
          </p>
          <button onClick={handleLogout} className="mt-4 nav-button justify-center bg-red-500/90 hover:bg-red-500">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto p-7">
        <section className="glass-panel rounded-lg p-8 mb-6 flex items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black text-slate-950">Your Cart</h2>
            <p className="text-slate-500 mt-2">
              Review the products selected through Akzo Product Assistant.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/chat")} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              Continue shopping
            </button>
            <button onClick={clearCart} disabled={!items.length} className="rounded-lg bg-[#14213d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1f3155] disabled:opacity-50">
              Clear cart
            </button>
          </div>
        </section>

        {!items.length ? (
          <section className="metric-card p-10 text-center">
            <div className="mx-auto h-14 w-14 rounded-lg bg-slate-950 text-white grid place-items-center">
              <ShoppingCart size={24} />
            </div>
            <h3 className="mt-5 text-2xl font-black text-slate-950">Your cart is empty</h3>
            <p className="mt-2 text-slate-500">
              Add products from the chat experience and they will show up here.
            </p>
            <button onClick={() => router.push("/chat")} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#14213d] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1f3155]">
              <MessageCircle size={16} />
              Open chat
            </button>
          </section>
        ) : (
          <section className="grid xl:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-4">
              {items.map((item) => (
                <article key={item.sku} className="metric-card p-5">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
                    <div>
                      <h3 className="text-xl font-black text-slate-950">{item.name}</h3>
                      <p className="text-xs text-slate-500 mt-1">SKU: {item.sku}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {[item.surface, item.usage, item.finish, item.color].filter(Boolean).map((tag) => (
                          <span key={tag} className="pill bg-white border border-slate-200 text-slate-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-black text-slate-950">Rs. {item.price}</p>
                      <p className="text-xs text-slate-500">{item.uom}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
                      <button onClick={() => updateQuantity(item.sku, item.quantity - 1)} className="px-3 py-2 text-slate-700 hover:bg-slate-50" aria-label="Decrease quantity">
                        <Minus size={15} />
                      </button>
                      <span className="px-4 py-2 text-sm font-semibold text-slate-900">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.sku, item.quantity + 1)} className="px-3 py-2 text-slate-700 hover:bg-slate-50" aria-label="Increase quantity">
                        <Plus size={15} />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-slate-700">
                        Line total: Rs. {item.price * item.quantity}
                      </p>
                      <button onClick={() => removeItem(item.sku)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">
                        <Trash2 size={15} />
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <aside className="metric-card p-5 h-fit">
              <h3 className="text-lg font-black text-slate-950">Order Summary</h3>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Items</span>
                  <span className="font-semibold text-slate-900">{cartCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">Rs. {cartTotal}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Demo shipping</span>
                  <span className="font-semibold text-slate-900">Free</span>
                </div>
              </div>
              <div className="mt-5 rounded-lg bg-slate-950 px-4 py-4 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">Total</span>
                  <span className="text-xl font-black">Rs. {cartTotal}</span>
                </div>
              </div>
              <button className="mt-5 w-full rounded-lg bg-[#14213d] px-4 py-3 text-sm font-semibold text-white hover:bg-[#1f3155]">
                Proceed to checkout
              </button>
              <p className="mt-3 text-xs text-slate-500">
                Demo cart for the hackathon flow. Items remain in your browser until cleared.
              </p>
            </aside>
          </section>
        )}
      </main>
      </div>
    </ProtectedRoute>
  );
}
