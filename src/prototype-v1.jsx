import { useState, useEffect, useCallback, useRef } from "react";

// ============================================
// 町内会メッセージ配布プラットフォーム
// Device-based read tracking (no login required)
// ============================================

const STORAGE_KEYS = {
  MESSAGES: "chonaikai:messages",
  DEVICE_ID: "chonaikai:device-id",
  DEVICE_NAME: "chonaikai:device-name",
  ADMIN_KEY: "chonaikai:admin-key",
  READS_PREFIX: "chonaikai:reads:",
  DEVICES_LIST: "chonaikai:devices-list",
};

const ADMIN_PIN = "1234"; // デモ用PIN

// ---- Utility ----
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDate(iso) {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${mins}`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

// Priority config
const PRIORITY_CONFIG = {
  urgent: { label: "緊急", color: "#dc2626", bg: "#fef2f2", icon: "🚨" },
  important: { label: "重要", color: "#ea580c", bg: "#fff7ed", icon: "⚠️" },
  normal: { label: "通常", color: "#2563eb", bg: "#eff6ff", icon: "📢" },
  info: { label: "お知らせ", color: "#059669", bg: "#ecfdf5", icon: "ℹ️" },
};

// Category config
const CATEGORIES = [
  { id: "general", label: "一般", icon: "📋" },
  { id: "event", label: "行事", icon: "🎌" },
  { id: "disaster", label: "防災", icon: "🛡️" },
  { id: "garbage", label: "ゴミ・清掃", icon: "🧹" },
  { id: "safety", label: "防犯", icon: "🔒" },
  { id: "other", label: "その他", icon: "📎" },
];

// ---- Storage helpers ----
async function storageGet(key, shared = false) {
  try {
    const result = await window.storage.get(key, shared);
    return result ? JSON.parse(result.value) : null;
  } catch {
    return null;
  }
}

async function storageSet(key, value, shared = false) {
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Components
// ============================================

// ---- Badge ----
function Badge({ children, color = "#2563eb", bg = "#eff6ff" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 10px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
        border: `1px solid ${color}22`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ---- Icon Button ----
function IconBtn({ onClick, children, title, active, size = 36 }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        border: "none",
        background: active ? "#1a3a5c" : "transparent",
        color: active ? "#fff" : "#4a6a8a",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.5,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ---- Empty State ----
function EmptyState({ icon, title, subtitle }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 20px",
        color: "#8aa4bd",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, opacity: 0.7 }}>{subtitle}</div>
    </div>
  );
}

// ---- Message Card (Member View) ----
function MessageCard({ msg, isRead, onRead }) {
  const [expanded, setExpanded] = useState(false);
  const pri = PRIORITY_CONFIG[msg.priority] || PRIORITY_CONFIG.normal;
  const cat = CATEGORIES.find((c) => c.id === msg.category) || CATEGORIES[0];

  const handleExpand = () => {
    setExpanded(!expanded);
    if (!isRead) onRead(msg.id);
  };

  return (
    <div
      onClick={handleExpand}
      style={{
        background: isRead ? "#ffffff" : "#f0f7ff",
        borderRadius: 14,
        padding: "16px 18px",
        marginBottom: 10,
        cursor: "pointer",
        border: isRead ? "1px solid #e2e8f0" : `2px solid ${pri.color}44`,
        borderLeft: `4px solid ${pri.color}`,
        transition: "all 0.2s",
        position: "relative",
      }}
    >
      {!isRead && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: pri.color,
            boxShadow: `0 0 6px ${pri.color}66`,
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <Badge color={pri.color} bg={pri.bg}>
          {pri.icon} {pri.label}
        </Badge>
        <Badge color="#6b7280" bg="#f3f4f6">
          {cat.icon} {cat.label}
        </Badge>
        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>
          {timeAgo(msg.createdAt)}
        </span>
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#1e293b",
          marginBottom: 6,
          fontFamily: "'Noto Sans JP', sans-serif",
        }}
      >
        {msg.title}
      </div>
      {expanded ? (
        <div
          style={{
            fontSize: 14,
            color: "#475569",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            marginTop: 10,
            padding: "12px 14px",
            background: "#f8fafc",
            borderRadius: 10,
            fontFamily: "'Noto Sans JP', sans-serif",
          }}
        >
          {msg.body}
          {msg.attachmentName && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                background: "#e2e8f0",
                borderRadius: 8,
                fontSize: 13,
                color: "#475569",
              }}
            >
              📎 {msg.attachmentName}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            fontSize: 13,
            color: "#94a3b8",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {msg.body.slice(0, 60)}
          {msg.body.length > 60 ? "…" : ""}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          {formatDate(msg.createdAt)} 配信
        </span>
        <span
          style={{
            fontSize: 11,
            color: isRead ? "#22c55e" : "#94a3b8",
            fontWeight: 600,
          }}
        >
          {isRead ? "✓ 既読" : "未読"}
        </span>
      </div>
    </div>
  );
}

// ---- Admin Message Row ----
function AdminMessageRow({ msg, readCount, totalDevices, onDelete }) {
  const pri = PRIORITY_CONFIG[msg.priority] || PRIORITY_CONFIG.normal;
  const cat = CATEGORIES.find((c) => c.id === msg.category) || CATEGORIES[0];
  const pct =
    totalDevices > 0 ? Math.round((readCount / totalDevices) * 100) : 0;

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        padding: "14px 18px",
        marginBottom: 10,
        border: "1px solid #e2e8f0",
        borderLeft: `4px solid ${pri.color}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <Badge color={pri.color} bg={pri.bg}>
          {pri.icon} {pri.label}
        </Badge>
        <Badge color="#6b7280" bg="#f3f4f6">
          {cat.icon} {cat.label}
        </Badge>
        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>
          {formatDate(msg.createdAt)}
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#1e293b",
          marginBottom: 4,
        }}
      >
        {msg.title}
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#64748b",
          marginBottom: 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {msg.body.slice(0, 80)}
      </div>
      {/* Read progress */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div
          style={{
            flex: 1,
            height: 6,
            background: "#e2e8f0",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background:
                pct === 100
                  ? "#22c55e"
                  : pct > 50
                    ? "#3b82f6"
                    : "#f59e0b",
              borderRadius: 3,
              transition: "width 0.5s",
            }}
          />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>
          {readCount}/{totalDevices} ({pct}%)
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 6,
        }}
      >
        <button
          onClick={() => onDelete(msg.id)}
          style={{
            padding: "4px 14px",
            borderRadius: 8,
            border: "1px solid #fecaca",
            background: "#fff",
            color: "#dc2626",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          削除
        </button>
      </div>
    </div>
  );
}

// ---- Compose Message Modal ----
function ComposeModal({ onSend, onClose }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("general");

  const handleSend = () => {
    if (!title.trim() || !body.trim()) return;
    onSend({ title: title.trim(), body: body.trim(), priority, category });
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1.5px solid #cbd5e1",
    fontSize: 14,
    fontFamily: "'Noto Sans JP', sans-serif",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          padding: "28px 24px",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: "#1e293b",
            }}
          >
            📝 新規メッセージ作成
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              color: "#94a3b8",
            }}
          >
            ✕
          </button>
        </div>

        {/* Priority selector */}
        <label
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#64748b",
            marginBottom: 6,
            display: "block",
          }}
        >
          重要度
        </label>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {Object.entries(PRIORITY_CONFIG).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setPriority(key)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border:
                  priority === key
                    ? `2px solid ${val.color}`
                    : "2px solid #e2e8f0",
                background: priority === key ? val.bg : "#fff",
                color: priority === key ? val.color : "#64748b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {val.icon} {val.label}
            </button>
          ))}
        </div>

        {/* Category selector */}
        <label
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#64748b",
            marginBottom: 6,
            display: "block",
          }}
        >
          カテゴリ
        </label>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                border:
                  category === cat.id
                    ? "2px solid #2563eb"
                    : "2px solid #e2e8f0",
                background: category === cat.id ? "#eff6ff" : "#fff",
                color: category === cat.id ? "#2563eb" : "#64748b",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        <label
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#64748b",
            marginBottom: 6,
            display: "block",
          }}
        >
          件名
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 7月度 町内清掃のお知らせ"
          style={{ ...inputStyle, marginBottom: 16 }}
          onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
          onBlur={(e) => (e.target.style.borderColor = "#cbd5e1")}
        />

        <label
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#64748b",
            marginBottom: 6,
            display: "block",
          }}
        >
          本文
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="メッセージ内容を入力してください..."
          rows={6}
          style={{
            ...inputStyle,
            resize: "vertical",
            marginBottom: 20,
            lineHeight: 1.7,
          }}
          onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
          onBlur={(e) => (e.target.style.borderColor = "#cbd5e1")}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 22px",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSend}
            disabled={!title.trim() || !body.trim()}
            style={{
              padding: "10px 28px",
              borderRadius: 10,
              border: "none",
              background:
                title.trim() && body.trim()
                  ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                  : "#cbd5e1",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: title.trim() && body.trim() ? "pointer" : "not-allowed",
              boxShadow:
                title.trim() && body.trim()
                  ? "0 4px 12px rgba(37,99,235,0.3)"
                  : "none",
            }}
          >
            📤 配信する
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Device Registration Modal ----
function DeviceRegModal({ onRegister, deviceId }) {
  const [name, setName] = useState("");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background:
          "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: "36px 28px",
          width: "100%",
          maxWidth: 400,
          textAlign: "center",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🏘️</div>
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 22,
            fontWeight: 800,
            color: "#1e293b",
            fontFamily: "'Noto Sans JP', sans-serif",
          }}
        >
          町内会メッセンジャー
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "#64748b",
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          お名前を登録すると、メッセージの
          <br />
          既読状況が管理者に通知されます。
        </p>

        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            marginBottom: 16,
            padding: "8px 12px",
            background: "#f1f5f9",
            borderRadius: 10,
            fontFamily: "monospace",
          }}
        >
          端末ID: {deviceId?.slice(0, 16)}...
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 山田太郎（3丁目）"
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: 12,
            border: "2px solid #e2e8f0",
            fontSize: 15,
            fontFamily: "'Noto Sans JP', sans-serif",
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 20,
            textAlign: "center",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
          onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onRegister(name.trim());
          }}
        />

        <button
          onClick={() => name.trim() && onRegister(name.trim())}
          disabled={!name.trim()}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 12,
            border: "none",
            background: name.trim()
              ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
              : "#cbd5e1",
            color: "#fff",
            fontSize: 16,
            fontWeight: 700,
            cursor: name.trim() ? "pointer" : "not-allowed",
            boxShadow: name.trim()
              ? "0 6px 20px rgba(37,99,235,0.3)"
              : "none",
            fontFamily: "'Noto Sans JP', sans-serif",
          }}
        >
          参加する
        </button>

        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 16 }}>
          ※ ログイン不要・この端末で自動認識されます
        </p>
      </div>
    </div>
  );
}

// ---- Admin Login ----
function AdminLogin({ onLogin, onBack }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const handleLogin = () => {
    if (pin === ADMIN_PIN) {
      onLogin();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background:
          "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 24,
          padding: "36px 28px",
          width: "100%",
          maxWidth: 360,
          textAlign: "center",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 20,
            fontWeight: 800,
            color: "#1e293b",
          }}
        >
          管理者ログイン
        </h2>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
          管理者PINを入力してください
          <br />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>
            （デモ用: 1234）
          </span>
        </p>

        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          maxLength={8}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: 12,
            border: error ? "2px solid #ef4444" : "2px solid #e2e8f0",
            fontSize: 24,
            textAlign: "center",
            letterSpacing: 8,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 8,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLogin();
          }}
        />
        {error && (
          <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 12px" }}>
            PINが正しくありません
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 16,
          }}
        >
          <button
            onClick={onBack}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#64748b",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            戻る
          </button>
          <button
            onClick={handleLogin}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ログイン
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main App
// ============================================
export default function ChonaikaiMessenger() {
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState(null);
  const [deviceName, setDeviceName] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [messages, setMessages] = useState([]);
  const [readMap, setReadMap] = useState({});
  const [devices, setDevices] = useState([]);
  const [showCompose, setShowCompose] = useState(false);
  const [adminReadCounts, setAdminReadCounts] = useState({});
  const [filterCategory, setFilterCategory] = useState("all");
  const [tab, setTab] = useState("messages"); // messages | stats
  const pollingRef = useRef(null);

  // ---- Init: load device ID or generate ----
  useEffect(() => {
    async function init() {
      let did = await storageGet(STORAGE_KEYS.DEVICE_ID);
      if (!did) {
        did =
          "dev_" +
          generateId() +
          "_" +
          Math.random().toString(36).slice(2, 10);
        await storageSet(STORAGE_KEYS.DEVICE_ID, did);
      }
      setDeviceId(did);

      const dname = await storageGet(STORAGE_KEYS.DEVICE_NAME);
      if (dname) {
        setDeviceName(dname);
        setIsRegistered(true);

        // Register in shared devices list
        const devList = (await storageGet(STORAGE_KEYS.DEVICES_LIST, true)) || [];
        if (!devList.find((d) => d.id === did)) {
          devList.push({
            id: did,
            name: dname,
            registeredAt: new Date().toISOString(),
          });
          await storageSet(STORAGE_KEYS.DEVICES_LIST, devList, true);
        }
      }

      // Load messages
      const msgs = (await storageGet(STORAGE_KEYS.MESSAGES, true)) || [];
      setMessages(msgs);

      // Load read status
      const reads = {};
      for (const msg of msgs) {
        const readList =
          (await storageGet(STORAGE_KEYS.READS_PREFIX + msg.id, true)) || [];
        reads[msg.id] = readList;
      }
      setReadMap(reads);

      // Load devices
      const devList =
        (await storageGet(STORAGE_KEYS.DEVICES_LIST, true)) || [];
      setDevices(devList);

      setLoading(false);
    }
    init();
  }, []);

  // ---- Polling for new messages ----
  useEffect(() => {
    if (!isRegistered && !isAdmin) return;

    const poll = async () => {
      const msgs = (await storageGet(STORAGE_KEYS.MESSAGES, true)) || [];
      setMessages(msgs);

      const reads = {};
      for (const msg of msgs) {
        const readList =
          (await storageGet(STORAGE_KEYS.READS_PREFIX + msg.id, true)) || [];
        reads[msg.id] = readList;
      }
      setReadMap(reads);

      const devList =
        (await storageGet(STORAGE_KEYS.DEVICES_LIST, true)) || [];
      setDevices(devList);
    };

    pollingRef.current = setInterval(poll, 5000);
    return () => clearInterval(pollingRef.current);
  }, [isRegistered, isAdmin]);

  // ---- Register device ----
  const handleRegister = async (name) => {
    await storageSet(STORAGE_KEYS.DEVICE_NAME, name);
    setDeviceName(name);
    setIsRegistered(true);

    const devList =
      (await storageGet(STORAGE_KEYS.DEVICES_LIST, true)) || [];
    if (!devList.find((d) => d.id === deviceId)) {
      devList.push({
        id: deviceId,
        name,
        registeredAt: new Date().toISOString(),
      });
      await storageSet(STORAGE_KEYS.DEVICES_LIST, devList, true);
    }
    setDevices(devList);
  };

  // ---- Mark as read ----
  const handleRead = async (msgId) => {
    const readList =
      (await storageGet(STORAGE_KEYS.READS_PREFIX + msgId, true)) || [];
    if (!readList.find((r) => r.deviceId === deviceId)) {
      readList.push({
        deviceId,
        name: deviceName,
        readAt: new Date().toISOString(),
      });
      await storageSet(STORAGE_KEYS.READS_PREFIX + msgId, readList, true);
      setReadMap((prev) => ({ ...prev, [msgId]: readList }));
    }
  };

  // ---- Send message (admin) ----
  const handleSendMessage = async (msgData) => {
    const msg = {
      id: generateId(),
      ...msgData,
      createdAt: new Date().toISOString(),
      authorDeviceId: deviceId,
    };
    const msgs = [msg, ...messages];
    await storageSet(STORAGE_KEYS.MESSAGES, msgs, true);
    await storageSet(STORAGE_KEYS.READS_PREFIX + msg.id, [], true);
    setMessages(msgs);
    setReadMap((prev) => ({ ...prev, [msg.id]: [] }));
    setShowCompose(false);
  };

  // ---- Delete message (admin) ----
  const handleDeleteMessage = async (msgId) => {
    const msgs = messages.filter((m) => m.id !== msgId);
    await storageSet(STORAGE_KEYS.MESSAGES, msgs, true);
    setMessages(msgs);
  };

  // ---- Filtered messages ----
  const filteredMessages =
    filterCategory === "all"
      ? messages
      : messages.filter((m) => m.category === filterCategory);

  // ---- Unread count ----
  const unreadCount = messages.filter((m) => {
    const reads = readMap[m.id] || [];
    return !reads.find((r) => r.deviceId === deviceId);
  }).length;

  // ---- Loading ----
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background:
            "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
          color: "#fff",
          fontFamily: "'Noto Sans JP', sans-serif",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 48,
              marginBottom: 16,
              animation: "pulse 1.5s infinite",
            }}
          >
            🏘️
          </div>
          <div style={{ fontSize: 16, opacity: 0.8 }}>読み込み中...</div>
        </div>
      </div>
    );
  }

  // ---- Not registered ----
  if (!isRegistered && !isAdmin) {
    if (showAdminLogin) {
      return (
        <AdminLogin
          onLogin={() => {
            setIsAdmin(true);
            setShowAdminLogin(false);
            setIsRegistered(true);
            setDeviceName("管理者");
          }}
          onBack={() => setShowAdminLogin(false)}
        />
      );
    }
    return (
      <>
        <DeviceRegModal onRegister={handleRegister} deviceId={deviceId} />
        <button
          onClick={() => setShowAdminLogin(true)}
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 2001,
            padding: "8px 16px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.5)",
            fontSize: 12,
            cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}
        >
          🔐 管理者
        </button>
      </>
    );
  }

  // ---- Main UI ----
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        fontFamily: "'Noto Sans JP', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <header
        style={{
          background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
          color: "#fff",
          padding: "16px 20px",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 600,
            margin: "0 auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>🏘️</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>
                町内会メッセンジャー
              </div>
              <div style={{ fontSize: 11, opacity: 0.6 }}>
                {isAdmin ? "👑 管理者モード" : `👤 ${deviceName}`}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!isAdmin && unreadCount > 0 && (
              <span
                style={{
                  background: "#ef4444",
                  color: "#fff",
                  borderRadius: 99,
                  padding: "2px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {unreadCount}件 未読
              </span>
            )}
            {isAdmin ? (
              <IconBtn
                onClick={() => {
                  setIsAdmin(false);
                  setIsRegistered(false);
                  setDeviceName(null);
                }}
                title="ログアウト"
              >
                🚪
              </IconBtn>
            ) : (
              <IconBtn
                onClick={() => {
                  setIsRegistered(false);
                  setDeviceName(null);
                  setShowAdminLogin(true);
                }}
                title="管理者切替"
              >
                🔐
              </IconBtn>
            )}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 16px" }}>
        {/* Admin Tabs */}
        {isAdmin && (
          <div
            style={{
              display: "flex",
              gap: 4,
              marginBottom: 16,
              background: "#e2e8f0",
              borderRadius: 12,
              padding: 4,
            }}
          >
            {[
              { id: "messages", label: "📨 メッセージ" },
              { id: "stats", label: "📊 配信状況" },
              { id: "members", label: "👥 登録端末" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: 10,
                  border: "none",
                  background: tab === t.id ? "#fff" : "transparent",
                  color: tab === t.id ? "#1e293b" : "#64748b",
                  fontSize: 13,
                  fontWeight: tab === t.id ? 700 : 500,
                  cursor: "pointer",
                  boxShadow:
                    tab === t.id ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Category Filter */}
        {(!isAdmin || tab === "messages") && (
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 14,
              overflowX: "auto",
              paddingBottom: 4,
            }}
          >
            <button
              onClick={() => setFilterCategory("all")}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border:
                  filterCategory === "all"
                    ? "2px solid #1e3a5f"
                    : "1px solid #e2e8f0",
                background: filterCategory === "all" ? "#1e3a5f" : "#fff",
                color: filterCategory === "all" ? "#fff" : "#64748b",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              すべて
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border:
                    filterCategory === cat.id
                      ? "2px solid #1e3a5f"
                      : "1px solid #e2e8f0",
                  background: filterCategory === cat.id ? "#1e3a5f" : "#fff",
                  color: filterCategory === cat.id ? "#fff" : "#64748b",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {isAdmin && tab === "stats" ? (
          // ---- Stats Dashboard ----
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 18,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 800, color: "#2563eb" }}>
                  {messages.length}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  配信メッセージ
                </div>
              </div>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 18,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 800, color: "#059669" }}>
                  {devices.length}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>登録端末</div>
              </div>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 18,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b" }}>
                  {messages.length > 0
                    ? Math.round(
                        (messages.reduce((sum, m) => {
                          return sum + ((readMap[m.id] || []).length);
                        }, 0) /
                          (messages.length * Math.max(devices.length, 1))) *
                          100
                      )
                    : 0}
                  %
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  平均既読率
                </div>
              </div>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 18,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 800, color: "#dc2626" }}>
                  {messages.filter((m) => m.priority === "urgent").length}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>緊急配信</div>
              </div>
            </div>

            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#475569",
                marginBottom: 12,
              }}
            >
              配信別 既読状況
            </h3>
            {messages.map((msg) => {
              const reads = readMap[msg.id] || [];
              return (
                <AdminMessageRow
                  key={msg.id}
                  msg={msg}
                  readCount={reads.length}
                  totalDevices={devices.length}
                  onDelete={handleDeleteMessage}
                />
              );
            })}
          </div>
        ) : isAdmin && tab === "members" ? (
          // ---- Members List ----
          <div>
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#475569",
                marginBottom: 12,
              }}
            >
              登録端末一覧 ({devices.length}件)
            </h3>
            {devices.length === 0 ? (
              <EmptyState
                icon="👥"
                title="登録端末なし"
                subtitle="住民がアクセスすると自動登録されます"
              />
            ) : (
              devices.map((dev, i) => (
                <div
                  key={dev.id}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: "12px 16px",
                    marginBottom: 8,
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    animation: `slideIn 0.2s ease ${i * 0.05}s both`,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background:
                        "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    {dev.name?.charAt(0) || "?"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1e293b",
                      }}
                    >
                      {dev.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>
                      端末: {dev.id.slice(0, 20)}... ・ 登録:{" "}
                      {formatDate(dev.registeredAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#059669",
                      }}
                    >
                      {
                        messages.filter((m) =>
                          (readMap[m.id] || []).find(
                            (r) => r.deviceId === dev.id
                          )
                        ).length
                      }
                      /{messages.length}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>既読</div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          // ---- Messages List (member or admin) ----
          <div>
            {filteredMessages.length === 0 ? (
              <EmptyState
                icon="📭"
                title="メッセージはありません"
                subtitle={
                  isAdmin
                    ? "右下のボタンから新規メッセージを作成できます"
                    : "新しいお知らせがあるとここに表示されます"
                }
              />
            ) : (
              filteredMessages.map((msg, i) => {
                const reads = readMap[msg.id] || [];
                const isRead = reads.some((r) => r.deviceId === deviceId);

                if (isAdmin) {
                  return (
                    <AdminMessageRow
                      key={msg.id}
                      msg={msg}
                      readCount={reads.length}
                      totalDevices={devices.length}
                      onDelete={handleDeleteMessage}
                    />
                  );
                }

                return (
                  <div
                    key={msg.id}
                    style={{
                      animation: `slideIn 0.2s ease ${i * 0.05}s both`,
                    }}
                  >
                    <MessageCard
                      msg={msg}
                      isRead={isRead}
                      onRead={handleRead}
                    />
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* FAB - Compose (Admin only) */}
      {isAdmin && (
        <button
          onClick={() => setShowCompose(true)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 60,
            height: 60,
            borderRadius: 18,
            border: "none",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "#fff",
            fontSize: 26,
            cursor: "pointer",
            boxShadow: "0 8px 30px rgba(37,99,235,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            transition: "transform 0.15s",
          }}
          onMouseEnter={(e) => (e.target.style.transform = "scale(1.08)")}
          onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
        >
          ✏️
        </button>
      )}

      {/* Compose Modal */}
      {showCompose && (
        <ComposeModal
          onSend={handleSendMessage}
          onClose={() => setShowCompose(false)}
        />
      )}
    </div>
  );
}
