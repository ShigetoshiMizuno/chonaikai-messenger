import { useState, useEffect, useRef } from "react";

// ============================================
// 町内会メッセンジャー v2
// 電話番号 + 干支（えと）認証
// ============================================

const SESSION_KEY = "chonaikai-v2:session";

// ---- 干支定義 ----
const ZODIAC_SIGNS = [
  { key: "rat", emoji: "🐭", label: "子" },
  { key: "ox", emoji: "🐮", label: "丑" },
  { key: "tiger", emoji: "🐯", label: "寅" },
  { key: "rabbit", emoji: "🐰", label: "卯" },
  { key: "dragon", emoji: "🐲", label: "辰" },
  { key: "snake", emoji: "🐍", label: "巳" },
  { key: "horse", emoji: "🐴", label: "午" },
  { key: "sheep", emoji: "🐏", label: "未" },
  { key: "monkey", emoji: "🐵", label: "申" },
  { key: "rooster", emoji: "🐔", label: "酉" },
  { key: "dog", emoji: "🐶", label: "戌" },
  { key: "boar", emoji: "🐗", label: "亥" },
];

// ---- API Helper (with JWT token management) ----
const api = {
  _token: null,
  _onSessionExpired: null,
  setToken(t) { this._token = t; },
  getToken() { return this._token; },
  onSessionExpired(cb) { this._onSessionExpired = cb; },
  _headers() {
    const h = { "Content-Type": "application/json" };
    if (this._token) h["Authorization"] = `Bearer ${this._token}`;
    return h;
  },
  async _handleResponse(res) {
    if (res.status === 401 && this._token) {
      this._token = null;
      localStorage.removeItem(SESSION_KEY);
      if (this._onSessionExpired) this._onSessionExpired();
      return { error: "session_expired" };
    }
    return res.json();
  },
  async get(path) {
    const res = await fetch(path, { headers: this._headers() });
    return this._handleResponse(res);
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    return this._handleResponse(res);
  },
  async patch(path, body) {
    const res = await fetch(path, {
      method: "PATCH",
      headers: this._headers(),
      body: JSON.stringify(body),
    });
    return this._handleResponse(res);
  },
  async del(path) {
    const res = await fetch(path, { method: "DELETE", headers: this._headers() });
    return this._handleResponse(res);
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

// ---- Push notification helpers ----
function canUsePush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function getPushState() {
  if (!canUsePush()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) return "subscribed";
    }
  } catch {}
  return "unsubscribed";
}

// ---- Push notification subscription ----
async function subscribeToPush() {
  try {
    if (!canUsePush()) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const { key } = await api.get("/api/push/vapidPublicKey");
    if (!key) return false;

    // Convert VAPID key to Uint8Array
    const urlBase64ToUint8Array = (base64String) => {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = atob(base64);
      return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
    };

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    await api.post("/api/push/subscribe", { subscription: subscription.toJSON() });
    console.log("Push subscription registered");
    return true;
  } catch (e) {
    console.log("Push subscription failed:", e.message);
    return false;
  }
}

// ============================================
// Components
// ============================================

// ---- Session Expired Screen ----
function SessionExpiredScreen({ userName, onReLogin }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";
  const sleepEmoji = hour < 6 || hour >= 22 ? "🌙" : "💤";

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #0c1929, #1a3352, #0c1929)",
      fontFamily: "'Noto Sans JP', sans-serif", padding: 20,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800&display=swap');
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div style={{
        background: "#fff", borderRadius: 24, padding: "40px 28px", maxWidth: 360,
        width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        animation: "fadeIn 0.6s ease-out",
      }}>
        <div style={{ fontSize: 64, marginBottom: 8, animation: "float 3s ease-in-out infinite" }}>
          🏘️{sleepEmoji}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>
          あらら、お久しぶり！
        </div>
        <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.8, marginBottom: 8 }}>
          {userName && <><span style={{ fontWeight: 700, color: "#334155" }}>{userName}さん</span>、{greeting}！<br /></>}
          しばらくお留守だったので<br />
          セキュリティのために<br />
          もう一度確認させてくださいね
        </div>
        <div style={{ fontSize: 40, margin: "16px 0" }}>🙏</div>
        <div style={{
          fontSize: 12, color: "#94a3b8", marginBottom: 20,
          background: "#f8fafc", borderRadius: 10, padding: "8px 12px",
        }}>
          安全のため、定期的に本人確認をしています。<br />すぐ終わりますのでご安心ください！
        </div>
        <button onClick={onReLogin} style={{
          width: "100%", padding: "16px", borderRadius: 16, border: "none",
          background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff",
          fontSize: 16, fontWeight: 800, cursor: "pointer",
          boxShadow: "0 4px 14px rgba(37,99,235,0.4)",
          transition: "transform 0.15s",
        }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
          onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
        >
          もういっかいログイン
        </button>
      </div>
    </div>
  );
}

function Badge({ children, color = "#2563eb", bg = "#eff6ff" }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600,
      color, background: bg, border: `1px solid ${color}22`, whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// ---- Zodiac Grid Selector ----
function ZodiacGrid({ selected, onSelect, disabled }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10,
    }}>
      {ZODIAC_SIGNS.map((z) => (
        <button
          key={z.key}
          onClick={() => !disabled && onSelect(z.key)}
          disabled={disabled}
          style={{
            padding: "14px 4px", borderRadius: 14,
            border: selected === z.key ? "3px solid #2563eb" : "2px solid #e2e8f0",
            background: selected === z.key ? "#eff6ff" : "#fff",
            cursor: disabled ? "not-allowed" : "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            transition: "all 0.15s",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <span style={{ fontSize: 32 }}>{z.emoji}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: selected === z.key ? "#2563eb" : "#475569" }}>
            {z.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---- Auth Screen (phone + zodiac) ----
function AuthScreen({ onLogin }) {
  const [step, setStep] = useState("phone"); // phone → zodiac
  const [phone, setPhone] = useState("");
  const [zodiac, setZodiac] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const phoneValid = phone.replace(/\D/g, "").length >= 10;

  const handlePhoneNext = () => {
    if (!phoneValid) { setError("電話番号を正しく入力してください"); return; }
    setError("");
    setStep("zodiac");
  };

  const handleZodiacSelect = async (key) => {
    setZodiac(key);
    setLoading(true);
    setError("");

    try {
      const result = await api.post("/api/auth/login", {
        phone: phone.replace(/\D/g, ""),
        zodiac: key,
      });

      if (result.error) {
        setError(result.error);
        setZodiac(null);
        setLoading(false);
        return;
      }

      // Success
      api.setToken(result.token);
      const session = { ...result.user, token: result.token };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      onLogin(result.user, result.token);
    } catch (e) {
      setError("通信エラーが発生しました。もう一度お試しください。");
      setZodiac(null);
      setLoading(false);
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

      <div style={{ animation: "fadeUp 0.5s ease", maxWidth: 420, width: "100%" }}>
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
            電話番号と干支でかんたんログイン
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
              { id: "zodiac", label: "干支", num: "2" },
            ].map((s, i) => {
              const active = s.id === step;
              const done = step === "zodiac" && i === 0;
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
                  {i < 1 && <div style={{
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
                管理者に登録された電話番号を入力してください
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

          {/* Step: Zodiac */}
          {step === "zodiac" && (
            <div style={{ animation: "fadeUp 0.3s ease" }}>
              <div style={{
                textAlign: "center", marginBottom: 16, padding: "8px 14px",
                background: "#f0f7ff", borderRadius: 10,
              }}>
                <span style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600 }}>
                  📱 {formatPhone(phone)}
                </span>
              </div>
              <label style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", display: "block", marginBottom: 16, textAlign: "center" }}>
                あなたの干支を選んでください
              </label>

              {error && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginBottom: 12, fontWeight: 600 }}>{error}</p>}

              <ZodiacGrid selected={zodiac} onSelect={handleZodiacSelect} disabled={loading} />

              {loading && (
                <div style={{ textAlign: "center", marginTop: 16, color: "#64748b", fontSize: 14 }}>
                  認証中...
                </div>
              )}

              <button onClick={() => { setStep("phone"); setError(""); setZodiac(null); }}
                style={{
                  width: "100%", padding: 12, borderRadius: 14, border: "1px solid #e2e8f0",
                  background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  marginTop: 16,
                }}>← 戻る</button>
            </div>
          )}
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

// ---- Add Member Modal ----
function AddMemberModal({ onAdd, onClose }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [zodiac, setZodiac] = useState(null);
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const phoneValid = phone.replace(/\D/g, "").length >= 10;
  const ok = phoneValid && name.trim() && zodiac;

  const handleSubmit = async () => {
    if (!ok) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.post("/api/admin/members", {
        phone: phone.replace(/\D/g, ""),
        name: name.trim(),
        zodiac,
        role,
      });
      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      onAdd(result);
    } catch {
      setError("通信エラーが発生しました");
      setLoading(false);
    }
  };

  const inp = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #cbd5e1", fontSize: 14, fontFamily: "'Noto Sans JP', sans-serif", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e293b" }}>👤 会員追加</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6, display: "block" }}>📱 電話番号</label>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="090-1234-5678" style={{ ...inp, marginBottom: 14 }} />

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6, display: "block" }}>👤 名前</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山田太郎（3丁目）" style={{ ...inp, marginBottom: 14 }} />

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6, display: "block" }}>役割</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[{ v: "member", l: "一般会員" }, { v: "admin", l: "管理者" }].map(r => (
            <button key={r.v} onClick={() => setRole(r.v)} style={{
              padding: "6px 16px", borderRadius: 20,
              border: role === r.v ? "2px solid #2563eb" : "2px solid #e2e8f0",
              background: role === r.v ? "#eff6ff" : "#fff",
              color: role === r.v ? "#2563eb" : "#64748b",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>{r.l}</button>
          ))}
        </div>

        <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 10, display: "block" }}>干支</label>
        <ZodiacGrid selected={zodiac} onSelect={setZodiac} disabled={loading} />

        {error && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center", marginTop: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>キャンセル</button>
          <button onClick={handleSubmit} disabled={!ok || loading}
            style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: ok && !loading ? "linear-gradient(135deg, #2563eb, #1d4ed8)" : "#cbd5e1", color: "#fff", fontSize: 14, fontWeight: 700, cursor: ok && !loading ? "pointer" : "not-allowed" }}>
            {loading ? "登録中..." : "登録する"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- CSV Import Modal ----
function CsvImportModal({ onImport, onClose }) {
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const ZODIAC_JP_MAP = {
    '子': 'rat', '丑': 'ox', '寅': 'tiger', '卯': 'rabbit',
    '辰': 'dragon', '巳': 'snake', '午': 'horse', '未': 'sheep',
    '申': 'monkey', '酉': 'rooster', '戌': 'dog', '亥': 'boar',
    'ねずみ': 'rat', 'うし': 'ox', 'とら': 'tiger', 'うさぎ': 'rabbit',
    'たつ': 'dragon', 'へび': 'snake', 'うま': 'horse', 'ひつじ': 'sheep',
    'さる': 'monkey', 'とり': 'rooster', 'いぬ': 'dog', 'いのしし': 'boar',
  };

  const zodiacKeys = ZODIAC_SIGNS.map(z => z.key);

  const parseCsv = (text) => {
    const lines = text.trim().split("\n").filter(l => l.trim());
    const rows = [];
    for (const line of lines) {
      const parts = line.split(",").map(s => s.trim());
      if (parts.length < 3) continue;
      // Skip header row
      if (parts[0] === '電話番号' || parts[0].toLowerCase() === 'phone') continue;
      const phone = parts[0];
      const name = parts[1];
      let zodiac = parts[2].toLowerCase();
      // Japanese zodiac support
      if (!zodiacKeys.includes(zodiac)) {
        zodiac = ZODIAC_JP_MAP[parts[2]] || zodiac;
      }
      rows.push({ phone, name, zodiac });
    }
    return rows;
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buf = ev.target?.result;
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      } catch {
        text = new TextDecoder("shift_jis").decode(buf);
      }
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      setCsvText(text);
      setPreview(parseCsv(text));
      setError("");
      setResult(null);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleParse = () => {
    if (!csvText.trim()) { setError("CSVデータを入力してください"); return; }
    const rows = parseCsv(csvText);
    if (rows.length === 0) { setError("有効な行が見つかりません"); return; }
    setPreview(rows);
    setError("");
  };

  const handleImport = async () => {
    if (!preview || preview.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/api/admin/members/import", { rows: preview });
      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setResult(res);
      setLoading(false);
      if (res.success > 0) onImport();
    } catch {
      setError("通信エラーが発生しました");
      setLoading(false);
    }
  };

  const inp = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #cbd5e1", fontSize: 14, fontFamily: "'Noto Sans JP', sans-serif", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1e293b" }}>📄 CSV一括登録</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.6 }}>
          CSVフォーマット: <code>電話番号,名前,干支</code><br />
          干支は英語キー(rat,ox...)または日本語(子,丑...)に対応<br />
          <a href="/sample-members.csv" download style={{ color: "#2563eb", textDecoration: "underline" }}>サンプルCSVをダウンロード</a>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        <button onClick={() => fileRef.current?.click()} style={{
          width: "100%", padding: 12, borderRadius: 10, border: "2px dashed #cbd5e1",
          background: "#f8fafc", color: "#64748b", fontSize: 14, cursor: "pointer", marginBottom: 12,
        }}>📁 CSVファイルを選択</button>

        <textarea
          value={csvText}
          onChange={(e) => { setCsvText(e.target.value); setPreview(null); setResult(null); }}
          placeholder={"09012345678,山田太郎,辰\n09098765432,佐藤花子,子"}
          rows={5}
          style={{ ...inp, resize: "vertical", marginBottom: 12, lineHeight: 1.7, fontFamily: "monospace" }}
        />

        {!preview && (
          <button onClick={handleParse} style={{
            width: "100%", padding: 10, borderRadius: 10, border: "none",
            background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 12,
          }}>プレビュー</button>
        )}

        {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {preview && preview.length > 0 && !result && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 8 }}>
              プレビュー ({preview.length}件)
            </div>
            <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>電話番号</th>
                    <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>名前</th>
                    <th style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>干支</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => {
                    const z = ZODIAC_SIGNS.find(z => z.key === r.zodiac);
                    return (
                      <tr key={i}>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>{r.phone}</td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>{r.name}</td>
                        <td style={{ padding: "6px 10px", borderBottom: "1px solid #f1f5f9" }}>
                          {z ? `${z.emoji} ${z.label}` : <span style={{ color: "#ef4444" }}>?{r.zodiac}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={handleImport} disabled={loading} style={{
              width: "100%", padding: 12, borderRadius: 10, border: "none",
              background: loading ? "#cbd5e1" : "linear-gradient(135deg, #059669, #047857)",
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", marginTop: 12,
            }}>{loading ? "インポート中..." : `${preview.length}件をインポート`}</button>
          </div>
        )}

        {result && (
          <div style={{
            padding: 16, borderRadius: 10, marginBottom: 16,
            background: result.errors.length === 0 ? "#ecfdf5" : "#fffbeb",
            border: result.errors.length === 0 ? "1px solid #86efac" : "1px solid #fde68a",
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
              インポート結果
            </div>
            <div style={{ fontSize: 13, color: "#059669" }}>成功: {result.success}件</div>
            {result.errors.length > 0 && (
              <div style={{ fontSize: 13, color: "#dc2626", marginTop: 4 }}>
                エラー: {result.errors.length}件
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, marginTop: 2 }}>・{e.phone}: {e.error}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={onClose} style={{
          width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e2e8f0",
          background: "#fff", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>閉じる</button>
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
  const [messages, setMessages] = useState([]);
  const [readMap, setReadMap] = useState({});
  const [users, setUsers] = useState([]);
  const [showCompose, setShowCompose] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [adminTab, setAdminTab] = useState("messages");
  const [pushState, setPushState] = useState("unknown"); // unknown|unsupported|unsubscribed|subscribed|denied
  const [sessionExpired, setSessionExpired] = useState(false);
  const [expiredUserName, setExpiredUserName] = useState("");

  const isAdmin = currentUser?.role === "admin";

  // ---- Listen for session expiration ----
  useEffect(() => {
    api.onSessionExpired(() => {
      setExpiredUserName(currentUser?.name || "");
      setCurrentUser(null);
      setSessionExpired(true);
    });
  }, [currentUser]);

  // ---- Init: auto-login with saved token ----
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.token) {
            // Verify token with server
            const result = await api.post("/api/auth/verify", { token: parsed.token });
            if (result.error === "session_expired" || result.error === "Invalid token") {
              // Token expired — show cute re-login screen
              setExpiredUserName(parsed.name || "");
              setSessionExpired(true);
              localStorage.removeItem(SESSION_KEY);
            } else if (result.token && result.user) {
              api.setToken(result.token);
              const session = { ...result.user, token: result.token };
              localStorage.setItem(SESSION_KEY, JSON.stringify(session));
              setCurrentUser(result.user);
              // Register SW for push reception but don't request permission (needs user gesture on iOS)
              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.register("/sw.js").catch(() => {});
              }
              getPushState().then(setPushState);
            }
          }
        }
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
    if (!currentUser) return;
    const iv = setInterval(async () => {
      try {
        const data = await api.get("/api/messages");
        setMessages(data.messages || []);
        setReadMap(data.readMap || {});
        setUsers(data.members || []);
      } catch {}
    }, 5000);
    return () => clearInterval(iv);
  }, [currentUser]);

  // ---- Login ----
  const handleLogin = (user, token) => {
    api.setToken(token);
    setCurrentUser(user);
    subscribeToPush().then(ok => setPushState(ok ? "subscribed" : "unsubscribed"));
    // Refresh data
    api.get("/api/messages").then(data => {
      setMessages(data.messages || []);
      setReadMap(data.readMap || {});
      setUsers(data.members || []);
    }).catch(() => {});
  };

  // ---- Logout ----
  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    api.setToken(null);
    setCurrentUser(null);
  };

  // ---- Read ----
  const handleRead = async (msgId) => {
    const list = readMap[msgId] || [];
    if (!list.find(r => r.phone === currentUser.phone)) {
      await api.post(`/api/messages/${msgId}/read`, {});
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

  // ---- Refresh members after add/import ----
  const refreshMembers = async () => {
    try {
      const data = await api.get("/api/messages");
      setUsers(data.members || []);
    } catch {}
  };

  // ---- Delete member ----
  const handleDeleteMember = async (id) => {
    await api.del(`/api/admin/members/${id}`);
    setUsers(prev => prev.filter(m => m.id !== id));
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

  // ---- Session expired screen ----
  if (sessionExpired && !currentUser) {
    return <SessionExpiredScreen userName={expiredUserName} onReLogin={() => setSessionExpired(false)} />;
  }

  // ---- Auth screen ----
  if (!currentUser) {
    return <AuthScreen onLogin={handleLogin} />;
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
                {isAdmin ? `👑 管理者 ${currentUser?.name}` : `👤 ${currentUser?.name} ・ 📱 ${formatPhone(currentUser?.phone || "")}`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isAdmin && unread > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", borderRadius: 99, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{unread}件</span>
            )}
            <button onClick={handleLogout}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 12, cursor: "pointer" }}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 16px" }}>
        {/* Push notification banner */}
        {pushState === "unsubscribed" && (
          <div style={{
            background: "linear-gradient(135deg, #fef3c7, #fde68a)", borderRadius: 12,
            padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center",
            gap: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}>
            <span style={{ fontSize: 24 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>通知が届きません</div>
              <div style={{ fontSize: 11, color: "#a16207", marginTop: 2 }}>タップして通知を有効にしてください</div>
            </div>
            <button onClick={async () => {
              const ok = await subscribeToPush();
              setPushState(ok ? "subscribed" : (Notification.permission === "denied" ? "denied" : "unsubscribed"));
            }} style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "#d97706", color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
            }}>有効にする</button>
          </div>
        )}
        {pushState === "denied" && (
          <div style={{
            background: "#fef2f2", borderRadius: 12, padding: "12px 16px", marginBottom: 12,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>🔕</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#991b1b" }}>通知がブロックされています</div>
              <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 2 }}>端末の設定から通知を許可してください</div>
            </div>
          </div>
        )}

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#475569" }}>登録会員 ({users.length}名)</h3>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setShowCsvImport(true)} style={{
                  padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0",
                  background: "#fff", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>📄 CSV一括登録</button>
                <button onClick={() => setShowAddMember(true)} style={{
                  padding: "6px 12px", borderRadius: 8, border: "none",
                  background: "#2563eb", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>+ 会員追加</button>
              </div>
            </div>
            {users.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div>まだ登録会員がいません</div>
                <div style={{ fontSize: 13, marginTop: 8 }}>「会員追加」または「CSV一括登録」で追加してください</div>
              </div>
            ) : users.map((u, i) => {
              const zodiacInfo = ZODIAC_SIGNS.find(z => z.key === u.zodiac);
              return (
                <div key={u.id} style={{
                  background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 8, border: "1px solid #e2e8f0",
                  display: "flex", alignItems: "center", gap: 12, animation: `slideIn 0.2s ease ${i * 0.05}s both`,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: u.role === "admin" ? "linear-gradient(135deg, #f59e0b, #d97706)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700,
                  }}>{u.role === "admin" ? "👑" : u.name.charAt(0)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
                      {u.name}
                      {u.role === "admin" && <span style={{ fontSize: 10, color: "#d97706", marginLeft: 6, fontWeight: 600 }}>管理者</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>📱 {formatPhone(u.phone)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
                      {zodiacInfo && <span>{zodiacInfo.emoji} {zodiacInfo.label}</span>}
                      <span>・{formatDate(u.registeredAt)}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#059669" }}>
                        {messages.filter(m => (readMap[m.id] || []).find(r => r.phone === u.phone)).length}/{messages.length}
                      </span>
                      <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 2 }}>既読</span>
                    </div>
                    {u.phone !== currentUser?.phone && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={async () => {
                          const newRole = u.role === "admin" ? "member" : "admin";
                          if (!confirm(`${u.name} を${newRole === "admin" ? "管理者に昇格" : "一般会員に変更"}しますか？`)) return;
                          await api.patch(`/api/members/${u.id}/role`, { role: newRole });
                          setUsers(prev => prev.map(m => m.id === u.id ? { ...m, role: newRole } : m));
                        }} style={{
                          padding: "3px 8px", borderRadius: 6, border: "1px solid #e2e8f0",
                          background: u.role === "admin" ? "#fef3c7" : "#f0f9ff",
                          color: u.role === "admin" ? "#92400e" : "#1e40af",
                          fontSize: 10, cursor: "pointer", fontWeight: 600,
                        }}>{u.role === "admin" ? "権限解除" : "管理者に"}</button>
                        <button onClick={() => {
                          if (!confirm(`${u.name} を削除しますか？`)) return;
                          handleDeleteMember(u.id);
                        }} style={{
                          padding: "3px 8px", borderRadius: 6, border: "1px solid #fecaca",
                          background: "#fff", color: "#dc2626",
                          fontSize: 10, cursor: "pointer", fontWeight: 600,
                        }}>削除</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
      {showAddMember && <AddMemberModal onAdd={(m) => { setShowAddMember(false); refreshMembers(); }} onClose={() => setShowAddMember(false)} />}
      {showCsvImport && <CsvImportModal onImport={refreshMembers} onClose={() => setShowCsvImport(false)} />}
    </div>
  );
}
