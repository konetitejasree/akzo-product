"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  HelpCircle,
  Home,
  Layers3,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  PackageCheck,
  Route,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useCart } from "../../components/cart-provider";
import { ProtectedRoute, useAuth } from "../../components/auth-provider";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const CHAT_STORAGE_KEY_PREFIX = "akzo-product-chat-state-v1";

const suggestions = [
  "paint for metal outdoor rust",
  "replacement for rust primer",
  "washable paint for bedroom wall",
  "coating for wooden balcony furniture",
];

export default function ChatPage() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [expandedProducts, setExpandedProducts] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("One moment...");
  const mediaRecorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);
  const recordingStopTimerRef = useRef(null);
  const liveTranscriptRef = useRef("");
  const bottomRef = useRef(null);

  const router = useRouter();
  const path = usePathname();
  const { addItem, cartCount } = useCart();
  const { user, isAdmin, logout } = useAuth();
  const chatStorageKey = useMemo(
    () =>
      user?.email
        ? `${CHAT_STORAGE_KEY_PREFIX}-${user.role}-${user.email}`
        : null,
    [user]
  );

  useEffect(() => {
    const speechApiSupported =
      typeof window !== "undefined" &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const recorderSupported =
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof window.MediaRecorder !== "undefined";

    setTimeout(() => setVoiceSupported(speechApiSupported || recorderSupported), 0);

    return () => {
      if (recordingStopTimerRef.current) {
        clearTimeout(recordingStopTimerRef.current);
      }
      recognitionRef.current?.stop?.();
      mediaRecorderRef.current?.stop?.();
      mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !chatStorageKey) return;

    try {
      const saved = window.localStorage.getItem(chatStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setMessages(Array.isArray(parsed.messages) ? parsed.messages : []);
        setExpandedProducts(
          parsed.expandedProducts && typeof parsed.expandedProducts === "object"
            ? parsed.expandedProducts
            : {}
        );
        setQuery(typeof parsed.query === "string" ? parsed.query : "");
      } else {
        setMessages([]);
        setExpandedProducts({});
        setQuery("");
      }
    } catch {
      window.localStorage.removeItem(chatStorageKey);
    } finally {
      setHydrated(true);
    }
  }, [chatStorageKey]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined" || !chatStorageKey) return;

    window.localStorage.setItem(
      chatStorageKey,
      JSON.stringify({
        messages,
        query,
        expandedProducts,
      })
    );
  }, [chatStorageKey, expandedProducts, hydrated, messages, query]);

  useEffect(() => {
    const prompt = new URLSearchParams(window.location.search).get("prompt");
    if (prompt) {
      setTimeout(() => setQuery(prompt), 0);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const recordFeedback = async (eventType, sku, sourceQuery, metadata = {}) => {
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          sku,
          query: sourceQuery,
          metadata,
        }),
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleProductView = async (product, sourceQuery) => {
    const nextExpanded = !expandedProducts[product.sku];
    setExpandedProducts((current) => ({
      ...current,
      [product.sku]: nextExpanded,
    }));
    const recorded = await recordFeedback("view", product.sku, sourceQuery, {
      product_name: product.name,
    });
    setToast(
      recorded
        ? `${product.name} details ${nextExpanded ? "opened" : "hidden"}.`
        : `${nextExpanded ? "Opened" : "Hidden"} ${product.name} details.`
    );
  };

  const handleFeedbackAction = async (eventType, product, sourceQuery) => {
    const recorded = await recordFeedback(eventType, product.sku, sourceQuery, {
      product_name: product.name,
    });
    if (recorded) {
      setToast(
        eventType === "positive"
          ? `Thanks, positive feedback saved for ${product.name}.`
          : `Thanks, feedback saved for ${product.name}.`
      );
    } else {
      setToast("Feedback could not be recorded right now.");
    }
  };

  const handleAddToCart = (product, sourceQuery) => {
    addItem(product);
    setToast(`${product.name} added to cart.`);
    recordFeedback("add_to_cart", product.sku, sourceQuery, {
      product_name: product.name,
      source: "button",
    });
  };

  const handleLogout = () => {
    recognitionRef.current?.stop?.();
    mediaRecorderRef.current?.stop?.();
    mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    setMessages([]);
    setQuery("");
    setListening(false);
    setVoiceBusy(false);
    setExpandedProducts({});
    if (typeof window !== "undefined" && chatStorageKey) {
      window.localStorage.removeItem(chatStorageKey);
    }
    logout();
    router.push("/");
  };

  const handleSend = async (overrideQuery) => {
    const trimmedQuery = (overrideQuery ?? query).trim();
    if (!trimmedQuery || loading) return;

    const userMsg = { type: "user", text: trimmedQuery };
    const updatedMessages = [...messages, userMsg];
    const normalizedQuery = trimmedQuery.toLowerCase();
    const genericResponseRequest =
      /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no)$/i.test(trimmedQuery) ||
      normalizedQuery.includes("add to cart") ||
      normalizedQuery.includes("into cart") ||
      normalizedQuery.includes("available");

    setMessages(updatedMessages);
    setQuery("");
    setLoadingLabel(genericResponseRequest ? "One moment..." : "Searching catalog...");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedQuery,
          history: updatedMessages,
        }),
      });

      if (!res.ok) {
        throw new Error("search failed");
      }

      const data = await res.json();
      const intents = data.intent?.intents || [];
      const returnedCartItems = Array.isArray(data.cart_items) && data.cart_items.length
        ? data.cart_items
        : data.cart_item?.sku
        ? [data.cart_item]
        : [];

      if (intents.includes("add_to_cart") && returnedCartItems.length) {
        returnedCartItems.forEach((item) => addItem(item));
        setToast(
          returnedCartItems.length === 1
            ? `${returnedCartItems[0].name} added to cart.`
            : `${returnedCartItems.length} items added to cart.`
        );
      }

      setMessages((prev) => [
        ...prev,
        {
          type: "bot",
          text: data.response,
          steps: data.steps || [],
          reason: data.reason,
          nextQuestion: data.next_question,
          products: data.products || [],
          intent: data.intent || {},
          sourceQuery: trimmedQuery,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          type: "bot",
          text: "I'm having a little trouble right now. Please try that again in a moment.",
          products: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const uploadVoiceClip = async (blob) => {
    const mimeType = blob?.type || "";
    const extension = mimeType.includes("mp4")
      ? "m4a"
      : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("wav")
      ? "wav"
      : "webm";

    const formData = new FormData();
    formData.append("audio", blob, `voice-search.${extension}`);

    const res = await fetch(`${API_BASE}/voice-search`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "Voice transcription failed");
    }

    const transcript = (data.text || "").trim();
    if (transcript) {
      setQuery(transcript);
      await handleSend(transcript);
    }
  };

  const clearRecordingStopTimer = () => {
    if (!recordingStopTimerRef.current) return;
    clearTimeout(recordingStopTimerRef.current);
    recordingStopTimerRef.current = null;
  };

  const getPreferredRecorderMimeType = () => {
    if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
      return "";
    }

    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];

    return (
      candidates.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || ""
    );
  };

  const startBrowserSpeechRecognition = async () => {
    const SpeechRecognition =
      typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      return false;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    liveTranscriptRef.current = "";
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setListening(true);
      setVoiceBusy(false);
      setQuery("");
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const piece = event.results[index][0].transcript || "";
        if (event.results[index].isFinal) {
          finalTranscript += `${piece} `;
        } else {
          interimTranscript += `${piece} `;
        }
      }
      const cleaned = `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, " ").trim();
      liveTranscriptRef.current = cleaned;
      setQuery(cleaned);
    };

    recognition.onerror = async () => {
      recognitionRef.current = null;
      setListening(false);
      setVoiceBusy(false);
      liveTranscriptRef.current = "";
      setQuery("");
      await startRecordedVoiceFallback();
    };

    recognition.onend = async () => {
      recognitionRef.current = null;
      setListening(false);
      const transcript = liveTranscriptRef.current.trim();
      liveTranscriptRef.current = "";

      if (!transcript) {
        setVoiceBusy(false);
        setQuery("");
        return;
      }

      setVoiceBusy(true);
      try {
        await handleSend(transcript);
      } finally {
        setVoiceBusy(false);
      }
    };

    recognition.start();
    return true;
  };

  const startRecordedVoiceFallback = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getPreferredRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.onstart = () => {
        setListening(true);
        setVoiceBusy(false);
        setQuery("");
        clearRecordingStopTimer();
        recordingStopTimerRef.current = window.setTimeout(() => {
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
        }, 4500);
      };
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        clearRecordingStopTimer();
        setListening(false);
        setVoiceBusy(false);
        mediaRecorderRef.current = null;
        mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };
      recorder.onstop = async () => {
        clearRecordingStopTimer();
        setListening(false);
        setVoiceBusy(true);

        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;

        try {
          if (!blob.size) {
            throw new Error("No audio captured");
          }
          await uploadVoiceClip(blob);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              type: "bot",
              text: "I couldn't catch that voice message clearly. Please try again or type your query.",
              products: [],
            },
          ]);
        } finally {
          setVoiceBusy(false);
        }
      };

      recorder.start();
    } catch {
      setVoiceSupported(false);
    }
  };

  const toggleVoice = async () => {
    if (!voiceSupported || voiceBusy) return;

    if (listening) {
      recognitionRef.current?.stop?.();
      mediaRecorderRef.current?.stop?.();
      return;
    }

    const startedWithBrowserRecognition = await startBrowserSpeechRecognition();
    if (!startedWithBrowserRecognition) {
      await startRecordedVoiceFallback();
    }
  };

  return (
    <ProtectedRoute allowRoles={["user", "admin"]}>
      <div className="app-shell flex h-screen overflow-hidden">
      <aside className="left-rail w-72 h-screen shrink-0 overflow-y-auto text-white p-4 xl:p-5 flex flex-col">
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
          {isAdmin && (
            <button
              onClick={() => router.push("/admin")}
              className={`nav-button ${path === "/admin" ? "nav-button-active" : ""}`}
            >
              <BarChart3 size={18} />
              Admin
            </button>
          )}
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

        <div className="mt-8 space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">Try prompts</p>
          {suggestions.map((item) => (
            <button
              key={item}
              onClick={() => handleSend(item)}
              className="w-full text-left rounded-lg border border-white/10 bg-white/8 p-3 text-sm text-white/75 hover:bg-white/14"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-auto rounded-lg border border-white/10 bg-white/8 p-4">
          <p className="text-sm font-semibold">Tip</p>
          <p className="text-xs text-white/55 mt-1">
            Best results come from adding the surface and indoor or outdoor use.
          </p>
          <button
            onClick={handleLogout}
            className="mt-4 nav-button justify-center bg-red-500/90 hover:bg-red-500"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden p-4 xl:p-5">
        <header className="hero-panel glass-panel rounded-lg p-4 mb-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h2 className="text-[1.9rem] leading-tight font-black text-slate-950">Akzo Product Assistant</h2>
            <div className="hero-chip-row">
              <span className="hero-chip">
                <Search size={14} />
                Semantic search
              </span>
              <span className="hero-chip">
                <Layers3 size={14} />
                Alternatives and replacements
              </span>
              <span className="hero-chip">
                <Mic size={14} />
                Voice input
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button
                onClick={() => router.push("/admin")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <BarChart3 size={17} />
                Admin insights
              </button>
            )}
            <button
              onClick={() => router.push("/cart")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <ShoppingCart size={17} />
              Cart ({cartCount})
            </button>
          </div>
        </header>

        {toast && (
          <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {toast}
          </div>
        )}

        <section className="chat-scroll flex-1 min-h-0 glass-panel rounded-lg overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="h-full min-h-[240px] grid place-items-center">
              <div className="max-w-5xl text-center">
                <div className="mx-auto h-12 w-12 rounded-lg bg-[#14213d] text-white grid place-items-center shadow-lg">
                  <MessageCircle size={22} />
                </div>
                <h3 className="mt-4 text-[2rem] leading-tight font-black text-slate-950">
                  Tell me what you are trying to paint
                </h3>
                <div className="quick-prompt-grid">
                  <button
                    onClick={() => handleSend(suggestions[0])}
                    className="quick-prompt-card"
                  >
                    <p className="quick-prompt-title">Outdoor metal</p>
                    <p className="quick-prompt-text">
                      Find a rust-resistant option for gates, grills, or exposed metal.
                    </p>
                  </button>
                  <button
                    onClick={() => handleSend(suggestions[2])}
                    className="quick-prompt-card"
                  >
                    <p className="quick-prompt-title">Interior wall</p>
                    <p className="quick-prompt-text">
                      Search washable bedroom and living-room wall paints quickly.
                    </p>
                  </button>
                  <button
                    onClick={() => handleSend(suggestions[3])}
                    className="quick-prompt-card"
                  >
                    <p className="quick-prompt-title">Outdoor wood</p>
                    <p className="quick-prompt-text">
                      Compare finishes for balcony furniture, decks, and other wood surfaces.
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div key={index} className="space-y-3">
              <div
                className={`max-w-[78%] px-4 py-3 rounded-lg text-sm shadow-sm ${
                  msg.type === "user"
                    ? "bg-[#14213d] text-white ml-auto"
                    : "bg-white text-slate-800 border border-slate-200"
                }`}
              >
                {msg.text}
              </div>

              {msg.type === "bot" && msg.products?.length > 0 && (
                <div className="grid xl:grid-cols-2 gap-4">
                  {msg.products.map((product) => {
                    const isExpanded = Boolean(expandedProducts[product.sku]);
                    const validBundles = Array.isArray(product.bundles)
                      ? product.bundles.filter((bundle) => bundle?.sku && bundle?.name)
                      : [];
                    const validAlternatives = Array.isArray(product.alternatives)
                      ? product.alternatives.filter((alt) => alt?.sku && alt?.name)
                      : [];
                    const validQa = Array.isArray(product.qa)
                      ? product.qa.filter((item) => item?.question && item?.answer)
                      : [];
                    return (
                      <article
                        key={product.sku}
                        className="metric-card p-5 space-y-4 hover:shadow-xl"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              {product.best && (
                                <span className="pill bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  <PackageCheck size={14} />
                                  Recommended
                                </span>
                              )}
                              {product.status === "unavailable" && (
                                <span className="pill bg-red-50 text-red-700 border border-red-100">
                                  Unavailable
                                </span>
                              )}
                            </div>
                            <h3 className="font-black text-xl text-slate-950 mt-3">
                              {product.name}
                            </h3>
                            <p className="text-xs text-slate-500">SKU: {product.sku}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-slate-950">Rs. {product.price}</p>
                            <p className="text-xs text-slate-500">
                              {product.uom} | Stock {product.stock}
                            </p>
                          </div>
                        </div>

                        <p className="text-sm leading-6 text-slate-600">{product.summary}</p>

                        <div className="flex flex-wrap gap-2 text-xs">
                          {[product.surface, product.usage, product.finish, product.color].map((item, itemIndex) => (
                            <span
                              key={`${product.sku}-tag-${itemIndex}-${item}`}
                              className="pill bg-white border border-slate-200 text-slate-700"
                            >
                              {item}
                            </span>
                          ))}
                          <span className="pill bg-amber-50 text-amber-700 border border-amber-100">
                            <Star size={13} />
                            {product.rating}
                          </span>
                        </div>

                        <p className="text-sm text-slate-500">{product.insight}</p>

                        {product.guided_path?.length > 0 && (
                          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-blue-800 mb-2">
                              <Route size={14} />
                              Why this product matches
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {product.guided_path.map((step, stepIndex) => (
                                <span
                                  key={`${product.sku}-guided-${stepIndex}-${step.step}-${step.value}`}
                                  className="pill bg-white border border-blue-100 text-blue-700"
                                >
                                  {step.step}: {step.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {(product.review_summary || product.social_signal_summary) && (
                          <div className="grid gap-3 md:grid-cols-2">
                            {product.review_summary && (
                              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
                                <p className="font-semibold text-slate-900 mb-1">Review summary</p>
                                <p>{product.review_summary}</p>
                              </div>
                            )}
                            {product.social_signal_summary && (
                              <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">
                                <p className="font-semibold mb-1">Trusted signals</p>
                                <p>{product.social_signal_summary}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {product.replacement && (
                          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-sm text-orange-900">
                            Replacement: {product.replacement.name} is available with {" "}
                            {product.replacement.stock} in stock.
                          </div>
                        )}

                        {validBundles.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2">
                              <Layers3 size={14} />
                              Companion products
                            </div>
                            <div className="grid gap-2">
                              {validBundles.map((bundle, bundleIndex) => (
                                <div key={`${product.sku}-bundle-${bundleIndex}-${bundle.sku}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-slate-800">{bundle.name}</p>
                                    <span className="text-xs font-semibold text-slate-600">Rs. {bundle.price}</span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">{bundle.reason}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {validAlternatives.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2">
                              <Layers3 size={14} />
                              Alternatives
                            </div>
                            <div className="grid gap-2">
                              {validAlternatives.map((alt, altIndex) => (
                                <div key={`${product.sku}-alt-${altIndex}-${alt.sku}`} className="rounded-lg border border-slate-200 bg-white p-3">
                                  <p className="text-sm font-semibold text-slate-800">{alt.name}</p>
                                  <p className="text-xs text-slate-500">{alt.reason}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {validQa.length > 0 && (
                          <details open={isExpanded} className="rounded-lg border border-slate-200 bg-white p-3">
                            <summary className="cursor-pointer text-sm text-slate-800 font-bold">
                              Generated product Q&A
                            </summary>
                            <div className="mt-3 space-y-3">
                              {validQa.map((item, qaIndex) => (
                                <div key={`${product.sku}-qa-${qaIndex}-${item.question}`} className="text-sm text-slate-600">
                                  <p className="font-semibold text-slate-900">{item.question}</p>
                                  <p>{item.answer}</p>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            onClick={() => handleProductView(product, msg.sourceQuery)}
                            className="px-4 py-2 rounded-lg bg-[#14213d] text-white text-sm font-semibold hover:bg-[#1f3155]"
                          >
                            {isExpanded ? "Hide details" : "View details"}
                          </button>
                          <button
                            onClick={() => handleAddToCart(product, msg.sourceQuery)}
                            disabled={product.status === "unavailable"}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white"
                          >
                            <ShoppingCart size={15} />
                            {product.status === "unavailable" ? "Unavailable" : "Add to cart"}
                          </button>
                          <button
                            onClick={() => handleFeedbackAction("positive", product, msg.sourceQuery)}
                            className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-emerald-50"
                            aria-label="Helpful recommendation"
                          >
                            <ThumbsUp size={15} />
                          </button>
                          <button
                            onClick={() => handleFeedbackAction("negative", product, msg.sourceQuery)}
                            className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-red-50"
                            aria-label="Not helpful recommendation"
                          >
                            <ThumbsDown size={15} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {msg.type === "bot" && msg.nextQuestion && (
                <div className="flex items-center gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 w-fit">
                  <HelpCircle size={16} />
                  {msg.nextQuestion}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-700 grid place-items-center">
                <Sparkles size={17} />
              </div>
              {loadingLabel}
            </div>
          )}
          <div ref={bottomRef} />
        </section>

        <div className="mt-4 glass-panel rounded-lg p-3 flex items-center gap-3">
          <button
            onClick={toggleVoice}
            disabled={!voiceSupported || voiceBusy}
            className={`h-11 w-11 rounded-lg grid place-items-center border ${
              listening
                ? "voice-pulse bg-[#f9735b] text-white border-[#f9735b]"
                : "bg-white text-slate-700 border-slate-200 hover:bg-orange-50"
            } disabled:opacity-45`}
            aria-label={listening ? "Stop voice search" : "Start voice search"}
            title={voiceSupported ? "Voice search" : "Voice search is not supported in this browser"}
          >
            {listening ? <MicOff size={19} /> : <Mic size={19} />}
          </button>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSend();
            }}
            placeholder={
              listening
                ? "Speak now... your words will appear here"
                : voiceBusy
                ? "Processing your voice request..."
                : "Ask for a product, alternative, surface, problem, or usage..."
            }
            className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-3 outline-none text-sm text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />

          <button
            onClick={() => handleSend()}
            disabled={loading}
            className="inline-flex items-center gap-2 bg-[#14213d] text-white px-5 py-3 rounded-lg text-sm font-semibold hover:bg-[#1f3155] disabled:opacity-60"
          >
            <Send size={16} />
            Send
          </button>
        </div>
      </main>
      </div>
    </ProtectedRoute>
  );
}
