"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  GitBranch,
  Home,
  LogOut,
  MessageCircle,
  Mic,
  PackageSearch,
  Paintbrush,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { useCart } from "../../components/cart-provider";
import { ProtectedRoute, useAuth } from "../../components/auth-provider";

const examples = [
  "Paint for an outdoor metal gate",
  "Washable paint for bedroom walls",
  "Coating for wooden balcony furniture",
  "Garage floor coating",
];

export default function Dashboard() {
  const router = useRouter();
  const path = usePathname();
  const { cartCount } = useCart();
  const { user, isAdmin, logout } = useAuth();
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
          <p className="text-sm font-semibold">Need help choosing?</p>
          <p className="text-xs text-white/55 mt-1">
            Tell the assistant your surface and whether it is indoor or outdoor.
          </p>
          <button onClick={handleLogout} className="mt-4 nav-button justify-center bg-red-500/90 hover:bg-red-500">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto p-7">
        <section className="glass-panel rounded-lg p-8 mb-6">
          <div className="grid xl:grid-cols-[1fr_360px] gap-8 items-center">
            <div>
              <p className="pill bg-teal-50 text-teal-700 border border-teal-100 mb-4">
                <Paintbrush size={15} />
                {isAdmin ? "Admin workspace" : "Customer workspace"}
              </p>
              <h2 className="text-4xl font-black text-slate-950">
                Find the right paint or coating in a few questions.
              </h2>
              <p className="text-slate-600 mt-4 max-w-2xl">
                Describe what you are painting. The assistant can suggest suitable products,
                compare options, show alternatives, and add items to cart.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => router.push("/chat")} className="rounded-lg bg-[#14213d] text-white px-5 py-3 font-semibold flex items-center gap-2 shadow-lg shadow-slate-300 hover:bg-[#1f3155]">
                  <MessageCircle size={18} />
                  Start Product Search
                </button>
                {isAdmin ? (
                  <button onClick={() => router.push("/admin")} className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold flex items-center gap-2 text-slate-800 hover:bg-slate-50">
                    <BarChart3 size={18} />
                    Open Admin View
                  </button>
                ) : null}
              </div>
            </div>

            <div className="metric-card p-5">
              <h3 className="font-bold text-slate-950 mb-3">What you can ask</h3>
              <div className="space-y-2">
                {examples.map((example) => (
                  <button
                    key={example}
                    onClick={() => router.push(`/chat?prompt=${encodeURIComponent(example)}`)}
                    className="w-full text-left rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-blue-200 hover:bg-blue-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            [PackageSearch, "Semantic matches", "Recommendations use embeddings, attributes, and behavior signals."],
            [ShieldCheck, "Alternatives and replacements", "See replacement products when the original choice is unavailable."],
            [GitBranch, "Guided product paths", "Each recommendation now carries a guided-fit path for surface, usage, problem, and finish."],
            [Mic, "Voice search", "Use the microphone in chat to speak your product requirement."],
            [BrainCircuit, "Knowledge graph", "Judge view exposes catalog relationships, problem signals, and guided-selling coverage."],
            [BarChart3, "Discoverability analytics", "Track failed queries, low-findability SKUs, remediation playbooks, and selection quality."],
            [ShoppingCart, "Cart flow", "Products selected in chat can be added to a demo cart and reviewed before checkout."],
            [Paintbrush, "Generated content", "Each SKU includes product summaries, review highlights, social signals, and generated Q&A."],
          ].map(([Icon, title, text]) => (
            <div key={title} className="metric-card p-5">
              <div className="h-10 w-10 rounded-lg bg-slate-950 text-white grid place-items-center mb-4">
                <Icon size={18} />
              </div>
              <h3 className="font-bold text-slate-950">{title}</h3>
              <p className="text-sm text-slate-500 mt-2">{text}</p>
            </div>
          ))}
        </section>
      </main>
      </div>
    </ProtectedRoute>
  );
}
