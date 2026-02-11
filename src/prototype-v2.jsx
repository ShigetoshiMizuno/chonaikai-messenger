import { useState, useEffect } from "react";

// ============================================
// 町内会メッセンジャー v2
// 電話番号 + WebAuthn (Face ID / 指紋) 認証
// ============================================

const SESSION_KEY = "chonaikai-v2:session";
const ADMIN_PIN = "1234";

// ---- API Helper ----
const api = {
  async get(path) {
    const res = await fetch(path);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  },
  async del(path) {
    const res = await fetch(path, { method: "DELETE" });
    return res.json();
  },
};

// ---- Utilities ----
function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}
function formatPhone(p) {
  const d = p.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return p;
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const PRIORITY = {
  urgent: { label: "緊急", color: "#dc2626", bg: "#fef2f2", icon: "🚨" },
  important: { label: "重要", color: "#ea580c", bg: "#fff7ed", icon: "⚠️" },
  normal: { label: "通常", color: "#2563eb", bg: "#eff6ff", icon: "📢" },
  info: { label: "お知らせ", color: "#059669", bg: "#ecfdf5", icon: "ℹ️" },
};
const CATEGORIES = [
  { id: "general", label: "一般", icon: "📋" },
  { id: "event", label: "行事", icon: "🎌" },
  { id: "disaster", label: "防災", icon: "🛡️" },
  { id: "garbage", label: "ゴミ・清掃", icon: "🧹" },
  { id: "safety", label: "防犯", icon: "🔒" },
  { id: "other", label: "その他", icon: "📎" },
];

// ============================================
// WebAuthn Helpers (simulated for demo)
// ============================================
// Real WebAuthn requires a server. Here we simulate
// the flow to demonstrate UX. In production, replace
// with actual navigator.credentials.create/get calls.

function checkWebAuthnSupport() {
  return !!(window.PublicKeyCredential);
}

async function simulateWebAuthnRegister(phone, name) {
  // In production:
  // 1. Server sends challenge
  // 2. navigator.credentials.create({publicKey: {...}})
  // 3. Send attestation to server
  // 4. Server stores public key

  // Simulated: check if real WebAuthn is available
  const supported = checkWebAuthnSupport();

  if (supported) {
    try {
      // Attempt real WebAuthn registration
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const userId = new TextEncoder().encode(phone);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "町内会メッセンジャー", id: location.hostname },
          user: { id: userId, name: phone, displayName: name },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "required",
          },
          timeout: 60000,
        },
      });

      return {
        success: true,
        credentialId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
        method: "webauthn",
      };
    } catch (e) {
      console.log("WebAuthn failed, using simulation:", e.message);
    }
  }

  // Fallback: simulate biometric prompt
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        credentialId: "sim_" + generateId(),
        method: "simulated",
      });
    }, 1500);
  });
}

async function simulateWebAuthnLogin(phone) {
  const supported = checkWebAuthnSupport();

  if (supported) {
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: location.hostname,
          userVerification: "required",
          timeout: 60000,
        },
      });

      return {
        success: true,
        credentialId: btoa(String.fromCharCode(...new Uint8Array(assertion.rawId))),
        method: "webauthn",
      };
    } catch (e) {
      console.log("WebAuthn login failed:", e.message);
    }
  }

  return new Promise((resolve) => {
    setTimeout(() => resolve({ success: true, method: "simulated" }), 1200);
  });
}

// ============================================
// Components
// ============================================

function Badge({ children, color = "#2563eb", bg = "#eff6ff" }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600,
      color, background: bg, border: `1px solid ${color}22`, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// ---- Biometric Animation ----
function BiometricOverlay({ type, onComplete }) {
  const [phase, setPhase] = useState("scanning");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("success"), 1500);
    const t2 = setTimeout(() => onComplete?.(), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 3000, backdropFilter: "blur(8px)",
    }}>
      <div style={{ textAlign: "center", color: "#fff" }}>
        <div style={{
          width: 120, height: 120, borderRadius: "50%", margin: "0 auto 24px",
          border: phase === "success" ? "4px solid #22c55e" : "4px solid rgba(255,255,255,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: phase === "success" ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
          transition: "all 0.4s",
          animation: phase === "scanning" ? "bioPulse 1.2s infinite" : "none",
        }}>
          <span style={{ fontSize: 52 }}>
            {phase === "success" ? "✓" : type === "face" ? "👤" : "👆"}
          </span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          {phase === "success" ? "認証完了" : type === "face" ? "Face IDで認証中..." : "指紋を認証中..."}
        </div>
        <div style={{ fontSize: 13, opacity: 0.6 }}>
          {phase === "success" ? "" : "デバイスの認証をお待ちください"}
        </div>
      </div>
      <style>{`@keyframes bioPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); } 50% { box-shadow: 0 0 0 20px rgba(59,130,246,0); } }`}</style>
    </div>
  );
}

// ---- Registration Screen ----
function RegisterScreen({ onRegister, onAdminLogin }) {
  const [step, setStep] = useState("phone"); // phone → name → biometric → done
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [showBiometric, setShowBiometric] = useState(false);
  const [error, setError] = useState("");
  const [webauthnSupported] = useState(checkWebAuthnSupport());

  const phoneValid = phone.replace(/\D/g, "").length >= 10;

  const handlePhoneNext = () => {
    if (!phoneValid) { setError("電話番号を正しく入力してください"); return; }
    setError("");
    setStep("name");
  };

  const handleNameNext = () => {
    if (!name.trim()) { setError("お名前を入力してください"); return; }
    setError("");
    setStep("biometric");
  };

  const handleBiometricRegister = async () => {
    setShowBiometric(true);
    const result = await simulateWebAuthnRegister(phone, name);
    if (result.success) {
      setTimeout(() => {
        setShowBiometric(false);
        onRegister({
          phone: phone.replace(/\D/g, ""),
          name: name.trim(),
          credentialId: result.credentialId,
          method: result.method,
        });
      }, 500);
    }
  };

  const inputBase = {
    width: "100%", padding: "14px 16px", borderRadius: 14,
    border: "2px solid #e2e8f0", fontSize: 16, outline: "none",
    boxSizing: "border-box", fontFamily: "'Noto Sans JP', sans-serif",
    textAlign: "center", transition: "border-color 0.2s",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0c1929 0%, #1a3352 40%, #234567 70%, #0c1929 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      `}</style>

      {showBiometric && <BiometricOverlay type="face" onComplete={() => {}} />}

      <div style={{
        animation: "fadeUp 0.5s ease", maxWidth: 420, width: "100%",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 56, marginBottom: 12,
            animation: "float 3s ease-in-out infinite",
            filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.3))",
          }}>🏘️</div>
          <h1 style={{
            color: "#fff", fontSize: 24, fontWeight: 900, margin: 0,
            fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: 1,
          }}>町内会メッセンジャー</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 6 }}>
            パスワード不要・生体認証でかんたん参加
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "#fff", borderRadius: 24, padding: "32px 28px",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        }}>
          {/* Progress Steps */}
          <div style={{
            display: "flex", gap: 8, marginBottom: 28, justifyContent: "center",
          }}>
            {[
              { id: "phone", label: "電話番号", num: "1" },
              { id: "name", label: "お名前", num: "2" },
              { id: "biometric", label: "生体認証", num: "3" },
            ].map((s, i) => {
              const active = s.id === step;
              const done = (step === "name" && i === 0) || (step === "biometric" && i < 2);
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: done ? "#22c55e" : active ? "#2563eb" : "#e2e8f0",
                    color: done || active ? "#fff" : "#94a3b8",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700, transition: "all 0.3s",
                  }}>{done ? "✓" : s.num}</div>
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: active ? "#1e293b" : "#94a3b8",
                  }}>{s.label}</span>
                  {i < 2 && <div style={{
                    width: 20, height: 2,
                    background: done ? "#22c55e" : "#e2e8f0",
                  }} />}
                </div>
              );
            })}
          </div>

          {/* Step: Phone */}
          {step === "phone" && (
            <div style={{ animation: "fadeUp 0.3s ease" }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#475569", display: "block", marginBottom: 8 }}>
                📱 電話番号
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="090-1234-5678"
                style={{ ...inputBase, fontSize: 22, letterSpacing: 2, marginBottom: 6 }}
                onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                onBlur={(e) => e.target.style.borderColor = "#e2e8f0"}
                onKeyDown={(e) => e.key === "Enter" && handlePhoneNext()}
              />
              <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginBottom: 20 }}>
                この番号が会員IDになります（SMSは送信しません）
              </p>
              {error && <p style={{ color: "#ef4444", fontSize: 12, textAlign: "center", marginBottom: 12 }}>{error}</p>}
              <button
                onClick={handlePhoneNext}
                disabled={!phoneValid}
                style={{
                  width: "100%", padding: 16, borderRadius: 14, border: "none",
                  background: phoneValid ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "#e2e8f0",
                  color: phoneValid ? "#fff" : "#94a3b8", fontSize: 16, fontWeight: 700,
                  cursor: phoneValid ? "pointer" : "not-allowed",
                  boxShadow: phoneValid ? "0 6px 24px rgba(37,99,235,0.3)" : "none",
                  fontFamily: "'Noto Sans JP', sans-serif",
                }}
              >次へ →</button>
            </div>
          )}

          {/* Step: Name */}
          {step === "name" && (
            <div style={{ animation: "fadeUp 0.3s ease" }}>
              <div style={{
                textAlign: "center", marginBottom: 16, padding: "8px 14px",
                background: "#f0f7ff", borderRadius: 10,
              }}>
                <span style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600 }}>
                  📱 {formatPhone(phone)}
                </span>
              </div>
              <label style={{ fontSize: 13, fontWeight: 700, color: "#475569", display: "block", marginBottom: 8 }}>
                👤 お名前（管理者に表示されます）
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 山田太郎（3丁目）"
                style={{ ...inputBase, marginBottom: 20 }}
                onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                onBlur={(e) => e.target.style.borderColor = "#e2e8f0"}
                onKeyDown={(e) => e.key === "Enter" && handleNameNext()}
              />
              {error && <p style={{ color: "#ef4444", fontSize: 12, textAlign: "center", marginBottom: 12 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setStep("phone"); setError(""); }}
                  style={{ flex: 1, padding: 14, borderRadius: 14, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                  ← 戻る
                </button>
                <button onClick={handleNameNext} disabled={!name.trim()}
                  style={{
                    flex: 2, padding: 14, borderRadius: 14, border: "none",
                    background: name.trim() ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "#e2e8f0",
                    color: name.trim() ? "#fff" : "#94a3b8", fontSize: 15, fontWeight: 700,
                    cursor: name.trim() ? "pointer" : "not-allowed",
                    fontFamily: "'Noto Sans JP', sans-serif",
                  }}>次へ →</button>
              </div>
            </div>
          )}

          {/* Step: Biometric */}
          {step === "biometric" && (
            <div style={{ animation: "fadeUp 0.3s ease", textAlign: "center" }}>
              <div style={{
                textAlign: "center", marginBottom: 20, padding: "10px 14px",
                background: "#f0f7ff", borderRadius: 10,
              }}>
                <div style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600 }}>
                  📱 {formatPhone(phone)}
                </div>
                <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
                  👤 {name}
                </div>
              </div>

              <div style={{
                width: 100, height: 100, borderRadius: "50%", margin: "0 auto 20px",
                background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "3px solid #bfdbfe",
              }}>
                <span style={{ fontSize: 44 }}>
                  {webauthnSupported ? "🔐" : "👆"}
                </span>
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>
                生体認証を登録
              </h3>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 6, lineHeight: 1.6 }}>
                Face ID・指紋認証でログインできるようになります。
                <br />パスワードは不要です。
              </p>

              {webauthnSupported ? (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  color: "#059669", background: "#ecfdf5", marginBottom: 20,
                }}>
                  ✓ この端末は生体認証に対応しています
                </div>
              ) : (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  color: "#f59e0b", background: "#fffbeb", marginBottom: 20,
                }}>
                  ⚠ デモモードで動作します
                </div>
              )}

              <button
                onClick={handleBiometricRegister}
                style={{
                  width: "100%", padding: 16, borderRadius: 14, border: "none",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
                  boxShadow: "0 6px 24px rgba(37,99,235,0.3)", marginBottom: 10,
                  fontFamily: "'Noto Sans JP', sans-serif",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {webauthnSupported ? "🔐 Face ID / 指紋で登録" : "👆 生体認証で登録（デモ）"}
              </button>

              <button onClick={() => { setStep("name"); setError(""); }}
                style={{
                  width: "100%", padding: 12, borderRadius: 14, border: "1px solid #e2e8f0",
                  background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>← 戻る</button>
            </div>
          )}
        </div>

        {/* Admin link */}
        <button onClick={onAdminLogin}
          style={{
            display: "block", margin: "24px auto 0", padding: "8px 20px",
            borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)",
            fontSize: 12, cursor: "pointer", backdropFilter: "blur(4px)",
          }}>🔐 管理者ログイン</button>
      </div>
    </div>
  );
}

// ---- Login Screen (returning user) ----
function LoginScreen({ user, onLogin, onNewUser }) {
  const [showBiometric, setShowBiometric] = useState(false);

  const handleLogin = async () => {
    setShowBiometric(true);
    const result = await simulateWebAuthnLogin(user.phone);
    if (result.success) {
      setTimeout(() => {
        setShowBiometric(false);
        onLogin(user);
      }, 300);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0c1929 0%, #1a3352 40%, #234567 70%, #0c1929 100%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {showBiometric && <BiometricOverlay type="face" />}

      <div style={{ animation: "fadeUp 0.5s ease", maxWidth: 400, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🏘️</div>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 900, marginBottom: 24, fontFamily: "'Noto Sans JP', sans-serif" }}>
          おかえりなさい
        </h1>

        <div style={{
          background: "#fff", borderRadius: 24, padding: "32px 28px",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: "50%", margin: "0 auto 16px",
            background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 28, fontWeight: 800,
          }}>{user.name.charAt(0)}</div>

          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b", marginBottom: 4 }}>
            {user.name}
          </div>
          <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
            📱 {formatPhone(user.phone)}
          </div>

          <button onClick={handleLogin} style={{
            width: "100%", padding: 16, borderRadius: 14, border: "none",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 6px 24px rgba(37,99,235,0.3)", marginBottom: 12,
            fontFamily: "'Noto Sans JP', sans-serif",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>🔐 Face ID / 指紋でログイン</button>

          <button onClick={onNewUser} style={{
            width: "100%", padding: 12, borderRadius: 14, border: "1px solid #e2e8f0",
            background: "#fff", color: "#64748b", fontSize: 13, cursor: "pointer",
          }}>別のアカウントで登録</button>
        </div>
      </div>
    </div>
  );
}

// ---- Admin Login ----
function AdminLoginScreen({ onLogin, onBack }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  const go = () => {
    if (pin === ADMIN_PIN) onLogin();
    else { setErr(true); setTimeout(() => setErr(false), 2000); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "linear-gradient(160deg, #0c1929 0%, #1a3352 40%, #234567 70%, #0c1929 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16,
    }}>
      <div style={{ background: "#fff", borderRadius: 24, padding: "36px 28px", width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800, color: "#1e293b" }}>管理者ログイン</h2>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          PINを入力してください<br />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>（デモ: 1234）</span>
        </p>
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN"
          maxLength={8} style={{
            width: "100%", padding: 14, borderRadius: 12, border: err ? "2px solid #ef4444" : "2px solid #e2e8f0",
            fontSize: 24, textAlign: "center", letterSpacing: 8, outline: "none", boxSizing: "border-box", marginBottom: 8,
          }} onKeyDown={(e) => e.key === "Enter" && go()} />
        {err && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 12px" }}>PINが正しくありません</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onBack} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>戻る</button>
          <button onClick={go} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>ログイン</button>
        </div>
      </div>
    </div>
  );
}

// ---- Message Card ----
function MessageCard({ msg, isRead, onRead }) {
  const [open, setOpen] = useState(false);
  const pri = PRIORITY[msg.priority] || PRIORITY.normal;
  const cat = CATEGORIES.find(c => c.id === msg.category) || CATEGORIES[0];

  return (
    <div onClick={() => { setOpen(!open); if (!isRead) onRead(msg.id); }}
      style={{
        background: isRead ? "#fff" : "#f0f7ff", borderRadius: 14, padding: "16px 18px",
        marginBottom: 10, cursor: "pointer", border: isRead ? "1px solid #e2e8f0" : `2px solid ${pri.color}33`,
        borderLeft: `4px solid ${pri.color}`, transition: "all 0.2s", position: "relative",
      }}>
      {!isRead && <div style={{ position: "absolute", top: 12, right: 14, width: 10, height: 10, borderRadius: "50%", background: pri.color, boxShadow: `0 0 6px ${pri.color}66` }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Badge color={pri.color} bg={pri.bg}>{pri.icon} {pri.label}</Badge>
        <Badge color="#6b7280" bg="#f3f4f6">{cat.icon} {cat.label}</Badge>
        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>{timeAgo(msg.createdAt)}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 6, fontFamily: "'Noto Sans JP', sans-serif" }}>{msg.title}</div>
      {open ? (
        <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.7, whiteSpace: "pre-wrap", marginTop: 10, padding: "12px 14px", background: "#f8fafc", borderRadius: 10 }}>{msg.body}</div>
      ) : (
        <div style={{ fontSize: 13, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {msg.body.slice(0, 60)}{msg.body.length > 60 ? "…" : ""}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>{formatDate(msg.createdAt)}</span>
        <span style={{ fontSize: 11, color: isRead ? "#22c55e" : "#94a3b8", fontWeight: 600 }}>{isRead ? "✓ 既読" : "未読"}</span>
      </div>
    </div>
  );
}

// ---- Compose Modal ----
function ComposeModal({ onSend, onClose }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("general");

  const inp = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #cbd5e1", fontSize: 14, fontFamily: "'Noto Sans JP', sans-serif", outline: "none", boxSizing: "border-box" };
  const ok = title.trim() && body.trim();

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e293b" }}>📝 新規メッセージ</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6, display: "block" }}>重要度</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {Object.entries(PRIORITY).map(([k, v]) => (
            <button key={k} onClick={() => setPriority(k)} style={{
              padding: "6px 14px", borderRadius: 20, border: priority === k ? `2px solid ${v.color}` : "2px solid #e2e8f0",
              background: priority === k ? v.bg : "#fff", color: priority === k ? v.color : "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{v.icon} {v.label}</button>
          ))}
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6, display: "block" }}>カテゴリ</label>
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{
              padding: "6px 12px", borderRadius: 20, border: category === c.id ? "2px solid #2563eb" : "2px solid #e2e8f0",
              background: category === c.id ? "#eff6ff" : "#fff", color: category === c.id ? "#2563eb" : "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{c.icon} {c.label}</button>
          ))}
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6, display: "block" }}>件名</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 7月度 町内清掃のお知らせ" style={{ ...inp, marginBottom: 16 }} />

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6, display: "block" }}>本文</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="メッセージ内容..." rows={6} style={{ ...inp, resize: "vertical", marginBottom: 20, lineHeight: 1.7 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>キャンセル</button>
          <button onClick={() => ok && onSend({ title: title.trim(), body: body.trim(), priority, category })} disabled={!ok}
            style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: ok ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "#cbd5e1", color: "#fff", fontSize: 14, fontWeight: 700, cursor: ok ? "pointer" : "not-allowed" }}>
            📤 配信する
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main App
// ============================================
export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [savedUser, setSavedUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [messages, setMessages] = useState([]);
  const [readMap, setReadMap] = useState({});
  const [users, setUsers] = useState([]);
  const [showCompose, setShowCompose] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [adminTab, setAdminTab] = useState("messages");
  const [forceNewUser, setForceNewUser] = useState(false);

  // ---- Init ----
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) setSavedUser(JSON.parse(raw));
      } catch {}

      try {
        const data = await api.get("/api/messages");
        setMessages(data.messages || []);
        setReadMap(data.readMap || {});
        setUsers(data.members || []);
      } catch (e) {
        console.error("Failed to load data:", e);
      }
      setLoading(false);
    })();
  }, []);

  // ---- Polling ----
  useEffect(() => {
    if (!currentUser && !isAdmin) return;
    const iv = setInterval(async () => {
      try {
        const data = await api.get("/api/messages");
        setMessages(data.messages || []);
        setReadMap(data.readMap || {});
        setUsers(data.members || []);
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, [currentUser, isAdmin]);

  // ---- Register ----
  const handleRegister = async (data) => {
    const user = await api.post("/api/auth/register", {
      phone: data.phone,
      name: data.name,
      credentialId: data.credentialId,
      method: data.method,
    });
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    setCurrentUser(user);
    setSavedUser(user);
    setForceNewUser(false);
    // Refresh member list
    const members = await api.get("/api/members");
    setUsers(members);
  };

  // ---- Login (returning) ----
  const handleLogin = async (user) => {
    setCurrentUser(user);
  };

  // ---- Read ----
  const handleRead = async (msgId) => {
    const list = readMap[msgId] || [];
    if (!list.find(r => r.phone === currentUser.phone)) {
      await api.post(`/api/messages/${msgId}/read`, { phone: currentUser.phone });
      const updated = [...list, { phone: currentUser.phone, name: currentUser.name, readAt: new Date().toISOString() }];
      setReadMap(prev => ({ ...prev, [msgId]: updated }));
    }
  };

  // ---- Send ----
  const handleSend = async (data) => {
    const msg = await api.post("/api/messages", data);
    setMessages(prev => [msg, ...prev]);
    setReadMap(prev => ({ ...prev, [msg.id]: [] }));
    setShowCompose(false);
  };

  // ---- Delete ----
  const handleDelete = async (id) => {
    await api.del(`/api/messages/${id}`);
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "linear-gradient(160deg, #0c1929, #1a3352, #0c1929)", color: "#fff" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏘️</div>
          <div style={{ fontSize: 16, opacity: 0.8 }}>読み込み中...</div>
        </div>
      </div>
    );
  }

  // ---- Auth screens ----
  if (!currentUser && !isAdmin) {
    if (showAdminLogin) {
      return <AdminLoginScreen onLogin={() => { setIsAdmin(true); setShowAdminLogin(false); }} onBack={() => setShowAdminLogin(false)} />;
    }
    if (savedUser && !forceNewUser) {
      return <LoginScreen user={savedUser} onLogin={handleLogin} onNewUser={() => setForceNewUser(true)} />;
    }
    return <RegisterScreen onRegister={handleRegister} onAdminLogin={() => setShowAdminLogin(true)} />;
  }

  // ---- Main Screen ----
  const filtered = filterCat === "all" ? messages : messages.filter(m => m.category === filterCat);
  const unread = currentUser ? messages.filter(m => !(readMap[m.id] || []).find(r => r.phone === currentUser?.phone)).length : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", fontFamily: "'Noto Sans JP', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <header style={{
        background: "linear-gradient(135deg, #1e3a5f, #0f172a)", color: "#fff",
        padding: "16px 20px", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 600, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🏘️</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>町内会メッセンジャー</div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                {isAdmin ? "👑 管理者モード" : `👤 ${currentUser?.name} ・ 📱 ${formatPhone(currentUser?.phone || "")}`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isAdmin && unread > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", borderRadius: 99, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{unread}件</span>
            )}
            <button onClick={() => { localStorage.removeItem(SESSION_KEY); setCurrentUser(null); setIsAdmin(false); setSavedUser(null); setForceNewUser(false); }}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, cursor: "pointer" }}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 16px" }}>
        {/* Admin Tabs */}
        {isAdmin && (
          <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#e2e8f0", borderRadius: 12, padding: 4 }}>
            {[{ id: "messages", l: "📨 メッセージ" }, { id: "stats", l: "📊 配信状況" }, { id: "members", l: "👥 会員" }].map(t => (
              <button key={t.id} onClick={() => setAdminTab(t.id)} style={{
                flex: 1, padding: 10, borderRadius: 10, border: "none",
                background: adminTab === t.id ? "#fff" : "transparent",
                color: adminTab === t.id ? "#1e293b" : "#64748b",
                fontSize: 13, fontWeight: adminTab === t.id ? 700 : 500, cursor: "pointer",
              }}>{t.l}</button>
            ))}
          </div>
        )}

        {/* Category Filter */}
        {(!isAdmin || adminTab === "messages") && (
          <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
            <button onClick={() => setFilterCat("all")} style={{
              padding: "6px 14px", borderRadius: 20, border: filterCat === "all" ? "2px solid #1e3a5f" : "1px solid #e2e8f0",
              background: filterCat === "all" ? "#1e3a5f" : "#fff", color: filterCat === "all" ? "#fff" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            }}>すべて</button>
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setFilterCat(c.id)} style={{
                padding: "6px 14px", borderRadius: 20, border: filterCat === c.id ? "2px solid #1e3a5f" : "1px solid #e2e8f0",
                background: filterCat === c.id ? "#1e3a5f" : "#fff", color: filterCat === c.id ? "#fff" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              }}>{c.icon} {c.label}</button>
            ))}
          </div>
        )}

        {/* Admin: Stats */}
        {isAdmin && adminTab === "stats" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[
                { v: messages.length, l: "配信数", c: "#2563eb" },
                { v: users.length, l: "登録会員", c: "#059669" },
                { v: messages.length > 0 ? Math.round(messages.reduce((s, m) => s + (readMap[m.id] || []).length, 0) / (messages.length * Math.max(users.length, 1)) * 100) : 0, l: "平均既読率", c: "#f59e0b", suffix: "%" },
                { v: messages.filter(m => m.priority === "urgent").length, l: "緊急配信", c: "#dc2626" },
              ].map((d, i) => (
                <div key={i} style={{ background: "#fff", borderRadius: 14, padding: 18, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: d.c }}>{d.v}{d.suffix || ""}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{d.l}</div>
                </div>
              ))}
            </div>
            {messages.map(msg => {
              const reads = readMap[msg.id] || [];
              const pri = PRIORITY[msg.priority] || PRIORITY.normal;
              const pct = users.length > 0 ? Math.round(reads.length / users.length * 100) : 0;
              return (
                <div key={msg.id} style={{ background: "#fff", borderRadius: 14, padding: "14px 18px", marginBottom: 10, border: "1px solid #e2e8f0", borderLeft: `4px solid ${pri.color}` }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>{pri.icon} {msg.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1, height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#22c55e" : pct > 50 ? "#3b82f6" : "#f59e0b", borderRadius: 3, transition: "width 0.5s" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{reads.length}/{users.length} ({pct}%)</span>
                  </div>
                  {/* Who read / who didn't */}
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#64748b" }}>
                    <div>✓ 既読: {reads.map(r => r.name).join(", ") || "なし"}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
                    ✗ 未読: {users.filter(u => !reads.find(r => r.phone === u.phone)).map(u => u.name).join(", ") || "なし"}
                  </div>
                  <div style={{ textAlign: "right", marginTop: 8 }}>
                    <button onClick={() => handleDelete(msg.id)} style={{ padding: "4px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 12, cursor: "pointer" }}>削除</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Admin: Members */}
        {isAdmin && adminTab === "members" && (
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#475569", marginBottom: 12 }}>登録会員 ({users.length}名)</h3>
            {users.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div>まだ登録会員がいません</div>
              </div>
            ) : users.map((u, i) => (
              <div key={u.id} style={{
                background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 8, border: "1px solid #e2e8f0",
                display: "flex", alignItems: "center", gap: 12, animation: `slideIn 0.2s ease ${i * 0.05}s both`,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700,
                }}>{u.name.charAt(0)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>📱 {formatPhone(u.phone)}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{u.method === "webauthn" ? "🔐 WebAuthn認証済" : "👆 生体認証済(デモ)"}</span>
                    <span>・{formatDate(u.registeredAt)}</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>
                    {messages.filter(m => (readMap[m.id] || []).find(r => r.phone === u.phone)).length}/{messages.length}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>既読</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        {(!isAdmin || adminTab === "messages") && (
          filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#8aa4bd" }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📭</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>メッセージはありません</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>{isAdmin ? "右下のボタンから作成できます" : "新しいお知らせを待ちましょう"}</div>
            </div>
          ) : filtered.map((msg, i) => {
            const reads = readMap[msg.id] || [];
            const isRead = currentUser ? reads.some(r => r.phone === currentUser.phone) : false;
            return (
              <div key={msg.id} style={{ animation: `slideIn 0.2s ease ${i * 0.05}s both` }}>
                <MessageCard msg={msg} isRead={isRead || isAdmin} onRead={handleRead} />
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      {isAdmin && (
        <button onClick={() => setShowCompose(true)} style={{
          position: "fixed", bottom: 24, right: 24, width: 60, height: 60, borderRadius: 18, border: "none",
          background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", fontSize: 26, cursor: "pointer",
          boxShadow: "0 8px 30px rgba(37,99,235,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }}>✏️</button>
      )}

      {showCompose && <ComposeModal onSend={handleSend} onClose={() => setShowCompose(false)} />}
    </div>
  );
}
