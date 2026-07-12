"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  CircleAlert,
  GitBranch,
  Home,
  Layers3,
  LogOut,
  MessageCircle,
  SearchX,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useCart } from "../../components/cart-provider";
import { ProtectedRoute, useAuth } from "../../components/auth-provider";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

function MetricCard({ label, value, detail, Icon }) {
  return (
    <div className="metric-card p-5">
      <div className="h-10 w-10 rounded-lg bg-slate-950 text-white grid place-items-center mb-4">
        <Icon size={18} />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-black text-slate-950 mt-2">{value}</p>
      <p className="text-xs text-slate-500 mt-2">{detail}</p>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <section className="glass-panel rounded-lg p-5">
      <h3 className="text-xl font-bold text-slate-950">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyState({ text }) {
  return <p className="text-sm text-slate-500">{text}</p>;
}

export default function AdminPage() {
  const router = useRouter();
  const path = usePathname();
  const { cartCount } = useCart();
  const { logout } = useAuth();
  const [adminData, setAdminData] = useState({
    analytics: null,
    discoverability: null,
    governance: null,
    usecase: null,
    graph: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadAdminData() {
      try {
        const endpoints = [
          `${API_BASE}/admin/analytics`,
          `${API_BASE}/admin/discoverability`,
          `${API_BASE}/admin/governance`,
          `${API_BASE}/admin/usecase-status`,
          `${API_BASE}/admin/knowledge-graph`,
        ];

        const responses = await Promise.all(endpoints.map((url) => fetch(url)));
        const payloads = await Promise.all(
          responses.map(async (response) => {
            if (!response.ok) {
              throw new Error("admin fetch failed");
            }
            return response.json();
          })
        );

        if (mounted) {
          setAdminData({
            analytics: payloads[0],
            discoverability: payloads[1],
            governance: payloads[2],
            usecase: payloads[3],
            graph: payloads[4],
          });
        }
      } catch {
        if (mounted) {
          setAdminData({
            analytics: null,
            discoverability: null,
            governance: null,
            usecase: null,
            graph: null,
          });
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadAdminData();
    return () => {
      mounted = false;
    };
  }, []);

  const analytics = adminData.analytics || {};
  const discoverability = adminData.discoverability || {};
  const governance = adminData.governance || {};
  const usecaseItems = adminData.usecase?.items || [];
  const graph = adminData.graph || {};
  const overview = analytics.overview || {};
  const feedback = analytics.feedback_breakdown || {};
  const discoveryOverview = discoverability.overview || {};
  const governanceOverview = governance.overview || {};

  return (
    <ProtectedRoute allowRoles={["admin"]}>
      <div className="app-shell flex h-screen">
      <aside className="left-rail w-72 text-white p-5 flex flex-col">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-11 w-11 rounded-lg bg-white/12 grid place-items-center">
            <Bot size={22} />
          </div>
          <h1 className="text-lg font-bold">Akzo Product Assistant</h1>
        </div>

        <nav className="flex flex-col gap-2">
          <button
            onClick={() => router.push("/dashboard")}
            className={`nav-button ${path === "/dashboard" ? "nav-button-active" : ""}`}
          >
            <Home size={18} />
            Home
          </button>
          <button
            onClick={() => router.push("/admin")}
            className={`nav-button ${path === "/admin" ? "nav-button-active" : ""}`}
          >
            <BarChart3 size={18} />
            Admin
          </button>
          <button
            onClick={() => router.push("/chat")}
            className={`nav-button ${path === "/chat" ? "nav-button-active" : ""}`}
          >
            <MessageCircle size={18} />
            Ask Assistant
          </button>
          <button
            onClick={() => router.push("/cart")}
            className={`nav-button ${path === "/cart" ? "nav-button-active" : ""}`}
          >
            <ShoppingCart size={18} />
            Cart
            <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white">
              {cartCount}
            </span>
          </button>
        </nav>

        <div className="mt-auto rounded-lg border border-white/10 bg-white/8 p-4">
          <p className="text-sm font-semibold">Judge view</p>
          <p className="text-xs text-white/55 mt-1">
            Shows discoverability, governance gaps, guided graph coverage, and live search quality.
          </p>
          <button
            onClick={() => {
              logout();
              router.push("/");
            }}
            className="mt-4 nav-button justify-center bg-red-500/90 hover:bg-red-500"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto p-7">
        <div className="mb-7">
          <p className="pill bg-teal-50 text-teal-700 border border-teal-100 mb-3">
            <BarChart3 size={15} />
            Observability and analytics
          </p>
          <h2 className="text-4xl font-black text-slate-950">Admin Insights</h2>
          <p className="text-slate-600 mt-2 max-w-3xl">
            A judge-ready snapshot of search quality, AI discoverability, knowledge-graph guidance,
            content governance, and replacement effectiveness.
          </p>
        </div>

        {loading ? (
          <div className="glass-panel rounded-lg p-8 text-slate-500">Loading analytics...</div>
        ) : (
          <>
            <section className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mb-7">
              <MetricCard
                label="Total searches"
                value={overview.total_searches || 0}
                detail="All recorded product searches"
                Icon={TrendingUp}
              />
              <MetricCard
                label="No-result searches"
                value={overview.no_result_searches || 0}
                detail="Queries that returned no products"
                Icon={SearchX}
              />
              <MetricCard
                label="Discovery score"
                value={discoveryOverview.discovery_score || 0}
                detail="Higher means stronger product findability"
                Icon={Sparkles}
              />
              <MetricCard
                label="Selection rate"
                value={`${discoveryOverview.selection_rate || 0}%`}
                detail="Searches that led to product choice or cart action"
                Icon={ShieldCheck}
              />
            </section>

            <section className="grid xl:grid-cols-2 gap-5 mb-7">
              <SectionCard title="Top queries">
                {(analytics.top_queries || []).length ? (
                  <div className="space-y-3">
                    {analytics.top_queries.map((item) => (
                      <div key={item.query} className="metric-card p-4 flex items-center justify-between gap-3">
                        <p className="text-sm text-slate-700">{item.query}</p>
                        <span className="pill bg-slate-100 text-slate-700 border border-slate-200">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No query analytics yet." />
                )}
              </SectionCard>

              <SectionCard title="Failed queries with playbooks">
                {(discoverability.remediation_playbooks || []).length ? (
                  <div className="space-y-3">
                    {discoverability.remediation_playbooks.map((item) => (
                      <div key={item.query} className="metric-card p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-800">{item.query}</p>
                          <span className="pill bg-red-50 text-red-700 border border-red-100">
                            {item.count}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">{item.action}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No remediation playbooks generated yet." />
                )}
              </SectionCard>
            </section>

            <section className="grid xl:grid-cols-2 gap-5 mb-7">
              <SectionCard title="Low-findability products">
                {(discoverability.low_findability_products || []).length ? (
                  <div className="space-y-3">
                    {discoverability.low_findability_products.map((item) => (
                      <div key={item.sku} className="metric-card p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                            <p className="text-xs text-slate-500">{item.sku} • {item.surface} • {item.usage}</p>
                          </div>
                          <span className="pill bg-amber-50 text-amber-700 border border-amber-100">
                            <CircleAlert size={13} />
                            Attention
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">{item.action}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Every SKU has seen some engagement so far." />
                )}
              </SectionCard>

              <SectionCard title="Use-case completion status">
                {usecaseItems.length ? (
                  <div className="space-y-3">
                    {usecaseItems.map((item) => (
                      <div key={item.use_case_item} className="metric-card p-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.use_case_item}</p>
                          <p className="text-xs text-slate-500 mt-1">{item.detail}</p>
                        </div>
                        <span className="pill bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Use-case status report is unavailable." />
                )}
              </SectionCard>
            </section>

            <section className="grid xl:grid-cols-2 gap-5 mb-7">
              <SectionCard title="Content governance and assortment signals">
                <div className="grid md:grid-cols-2 gap-3 mb-4">
                  <div className="metric-card p-4">
                    <p className="text-sm text-slate-500">Catalog size</p>
                    <p className="text-2xl font-black text-slate-950 mt-2">{governanceOverview.catalog_size || 0}</p>
                  </div>
                  <div className="metric-card p-4">
                    <p className="text-sm text-slate-500">Generated summaries</p>
                    <p className="text-2xl font-black text-slate-950 mt-2">{governanceOverview.products_with_generated_summary || 0}</p>
                  </div>
                </div>
                {(governance.assortment_signals || []).length ? (
                  <div className="space-y-3">
                    {governance.assortment_signals.map((item) => (
                      <div key={`${item.sku}-${item.signal}`} className="metric-card p-4">
                        <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No assortment alerts right now." />
                )}
              </SectionCard>

              <SectionCard title="Knowledge graph coverage">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="metric-card p-4">
                    <p className="text-sm text-slate-500">Graph density hint</p>
                    <p className="text-2xl font-black text-slate-950 mt-2">{graph.graph_density_hint || 0}</p>
                  </div>
                  <div className="metric-card p-4">
                    <p className="text-sm text-slate-500">Problem signals</p>
                    <p className="text-2xl font-black text-slate-950 mt-2">
                      {Object.keys(graph.problem_signals || {}).length}
                    </p>
                  </div>
                </div>
                {(graph.sample_paths || []).length ? (
                  <div className="space-y-3">
                    {graph.sample_paths.map((item) => (
                      <div key={item.sku} className="metric-card p-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2">
                          <GitBranch size={14} />
                          {item.sku}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.path.map((step) => (
                            <span key={`${item.sku}-${step.step}`} className="pill bg-white border border-slate-200 text-slate-700">
                              {step.step}: {step.value}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Knowledge graph samples are not available." />
                )}
              </SectionCard>
            </section>

            <section className="grid xl:grid-cols-2 gap-5 mb-7">
              <SectionCard title="Top selected products">
                {(analytics.top_selected_products || []).length ? (
                  <div className="space-y-3">
                    {analytics.top_selected_products.map((item) => (
                      <div key={item.sku} className="metric-card p-4 flex items-center justify-between gap-3">
                        <p className="text-sm text-slate-700">{item.sku}</p>
                        <span className="pill bg-emerald-50 text-emerald-700 border border-emerald-100">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No product selections yet." />
                )}
              </SectionCard>

              <SectionCard title="Feedback breakdown">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Positive", feedback.positive || 0],
                    ["Negative", feedback.negative || 0],
                    ["Views", feedback.view || 0],
                    ["Selects", feedback.select || 0],
                    ["Add to cart", feedback.add_to_cart || 0],
                    ["Alternatives shown", overview.alternative_searches || 0],
                  ].map(([label, value]) => (
                    <div key={label} className="metric-card p-4">
                      <p className="text-sm text-slate-500">{label}</p>
                      <p className="text-2xl font-black text-slate-950 mt-2">{value}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </section>

            <SectionCard title="Recent activity">
              {(analytics.daily_activity || []).length ? (
                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {analytics.daily_activity.map((item) => (
                    <div key={item.date} className="metric-card p-4">
                      <p className="text-sm font-semibold text-slate-800">{item.date}</p>
                      <p className="text-xs text-slate-500 mt-2">Searches: {item.searches}</p>
                      <p className="text-xs text-slate-500">No results: {item.no_results}</p>
                      <p className="text-xs text-slate-500">Selects: {item.selects}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="No recent activity data yet." />
              )}
            </SectionCard>
          </>
        )}
      </main>
      </div>
    </ProtectedRoute>
  );
}
