"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Paintbrush,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "./auth-provider";

const highlights = [
  {
    icon: Search,
    title: "Semantic search",
    description: "Find the right paint faster.",
  },
  {
    icon: ShieldCheck,
    title: "Guided selling",
    description: "Narrow options with simple prompts.",
  },
  {
    icon: Sparkles,
    title: "Alternatives",
    description: "Show replacements when needed.",
  },
];

export default function LoginPanel() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("user@gmail.com");
  const [password, setPassword] = useState("123456");
  const [role, setRole] = useState("user");

  const handleLogin = (event) => {
    event.preventDefault();
    const resolvedEmail = role === "admin" ? "admin@gmail.com" : email;
    const nextUser = login(resolvedEmail);
    router.push(nextUser.role === "admin" ? "/admin" : "/dashboard");
  };

  return (
    <div className="auth-stage">
      <section className="auth-hero">
        <div className="auth-badge">
          <Paintbrush size={16} />
          Akzo Product Assistant
        </div>

        <div className="auth-copy">
          <p className="auth-eyebrow">Coatings commerce</p>
          <h1>Help customers reach the right product faster.</h1>
        </div>

        <div className="auth-feature-grid">
          {highlights.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="auth-feature-tile">
                <div className="auth-feature-icon">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="auth-feature-title">{item.title}</p>
                  <p className="auth-feature-text">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="auth-card glass-panel">
        <div className="auth-card-head">
          <div className="auth-card-icon">
            <Paintbrush size={22} />
          </div>
          <div>
            <p className="auth-card-label">Sign in</p>
            <h2>Open the assistant</h2>
          </div>
        </div>

        <div className="auth-role-switch" aria-label="Choose workspace role">
          <button
            type="button"
            onClick={() => {
              setRole("user");
              setEmail("user@gmail.com");
              setPassword("123456");
            }}
            className={`auth-role-option ${role === "user" ? "auth-role-option-active" : ""}`}
          >
            User
          </button>
          <button
            type="button"
            onClick={() => {
              setRole("admin");
              setEmail("admin@gmail.com");
              setPassword("123456");
            }}
            className={`auth-role-option ${role === "admin" ? "auth-role-option-active" : ""}`}
          >
            Admin
          </button>
        </div>

        <form onSubmit={handleLogin} className="auth-form">
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="auth-input"
              disabled={role === "admin"}
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="auth-input"
            />
          </label>

          <button className="auth-submit" type="submit">
            Login
            <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </div>
  );
}
