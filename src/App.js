import React, { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

/* ── Auth config ── */
const AUTH = {
  clientId:     "4d3079c9-3d7d-4745-b1fc-6660b3ce4328",
  authorizeUrl: "https://login.microsoftonline.com/8cc21f62-9336-49b9-b462-1e693eee1cde/oauth2/v2.0/authorize",
  tokenUrl:     "https://login.microsoftonline.com/8cc21f62-9336-49b9-b462-1e693eee1cde/oauth2/v2.0/token",
  scope: "https://api.powerplatform.com/.default openid profile offline_access",
  get redirectUri() { return window.location.origin; },
};

/* ── Copilot Studio config ── */
const BOT_BASE = "https://default8cc21f62933649b9b4621e693eee1c.de.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/cr916_agentFo7wC6";
const API_VER  = "2022-03-01-preview";

/* ── PKCE helpers ── */
function randomBase64url(len = 48) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function sha256Base64url(str) {
  const data   = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/* ── Session storage keys ── */
const K_VERIFIER = "pkce_verifier";
const K_STATE    = "pkce_state";
const K_TOKEN    = "chat_token";
const K_CONV     = "chat_conv";

/* ─────────────────────────
   Login screen
───────────────────────── */
function LoginScreen({ error }) {
  const handleLogin = async () => {
    const verifier  = randomBase64url(48);
    const challenge = await sha256Base64url(verifier);
    const state     = randomBase64url(16);
    sessionStorage.setItem(K_VERIFIER, verifier);
    sessionStorage.setItem(K_STATE,    state);

    const params = new URLSearchParams({
      client_id:             AUTH.clientId,
      response_type:         "code",
      redirect_uri:          AUTH.redirectUri,
      scope:                 AUTH.scope,
      code_challenge:        challenge,
      code_challenge_method: "S256",
      state,
      prompt:                "select_account",
    });
    window.location.href = AUTH.authorizeUrl + "?" + params.toString();
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card-header">
          <div className="logo-circle"><CopilotIcon size={32} /></div>
          <h1>Copilot Studio</h1>
          <p>Sign in with your Microsoft account to start chatting</p>
        </div>
        {error && <div className="error-banner"><strong>Error:</strong> {error}</div>}
        <button className="signin-btn" onClick={handleLogin}>
          <MsIcon /> Sign in with Microsoft
        </button>
        <p className="login-hint">
          Uses OAuth 2.0 + PKCE — your credentials never touch this app.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────
   Chat screen
───────────────────────── */
function ChatScreen({ token, conversationId, onSignOut }) {
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState("");
  const [sending,  setSending]  = useState(false);
  const watermarkRef = useRef(null);
  const pollingRef   = useRef(null);
  const messagesEnd  = useRef(null);

  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Trigger bot welcome message
  useEffect(() => {
    fetch(BOT_BASE + "/conversations/" + conversationId + "/activities?api-version=" + API_VER, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "event", name: "startConversation", from: { id: "user", role: "user" } }),
    }).catch(() => {});
  }, [token, conversationId]); // eslint-disable-line

  const poll = useCallback(async () => {
    try {
      const qs  = watermarkRef.current != null ? "&watermark=" + watermarkRef.current : "";
      const res = await fetch(BOT_BASE + "/conversations/" + conversationId + "/activities?api-version=" + API_VER + qs, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.watermark != null) watermarkRef.current = data.watermark;
      const bots = (data.activities || []).filter(a => a.type === "message" && a.from?.role !== "user");
      if (bots.length) {
        setMessages(prev => [
          ...prev.filter(m => !m.typing),
          ...bots.map(a => ({ id: a.id || Math.random().toString(36), role: "bot", text: a.text || "", time: now() })),
        ]);
        setSending(false);
      }
    } catch (_) {}
  }, [token, conversationId]); // eslint-disable-line

  useEffect(() => {
    pollingRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollingRef.current);
  }, [poll]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages(prev => [
      ...prev,
      { id: Date.now().toString(), role: "user", text, time: now() },
      { id: "typing", role: "bot", typing: true, time: "" },
    ]);
    try {
      await fetch(BOT_BASE + "/conversations/" + conversationId + "/activities?api-version=" + API_VER, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "message", text, from: { id: "user", role: "user" } }),
      });
    } catch (_) {
      setSending(false);
      setMessages(prev => prev.filter(m => !m.typing));
    }
  };

  return (
    <div className="chat-screen">
      <header className="chat-header">
        <div className="chat-header-left">
          <div className="header-avatar"><CopilotIcon size={20} /></div>
          <div>
            <h2>Copilot Agent</h2>
            <span className="status-dot" /><span className="status-text">Online</span>
          </div>
        </div>
        <button className="signout-btn" onClick={onSignOut}><SignOutIcon /> Sign out</button>
      </header>

      <div className="messages-area">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <p>Start the conversation below</p>
          </div>
        )}
        {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}
        <div ref={messagesEnd} />
      </div>

      <form className="input-area" onSubmit={handleSend}>
        <input
          type="text" value={input} onChange={e => setInput(e.target.value)}
          placeholder="Type a message…" disabled={sending} autoComplete="off"
        />
        <button className="send-btn" type="submit" disabled={sending || !input.trim()}>
          <SendIcon />
        </button>
      </form>
    </div>
  );
}

/* ─────────────────────────
   Message bubble
───────────────────────── */
function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={"message-row " + (isUser ? "user" : "bot")}>
      {!isUser && <div className="avatar bot-avatar"><CopilotIcon size={14} /></div>}
      <div className="bubble-wrap">
        <div className={"bubble " + (isUser ? "user-bubble" : "bot-bubble")}>
          {msg.typing
            ? <span className="typing-dots"><span /><span /><span /></span>
            : <span>{msg.text}</span>}
        </div>
        {!msg.typing && <span className="timestamp">{msg.time}</span>}
      </div>
      {isUser && <div className="avatar user-avatar"><UserIcon /></div>}
    </div>
  );
}

/* ─────────────────────────
   Root — OAuth callback handler
───────────────────────── */
export default function App() {
  const [screen,         setScreen]         = useState("loading");
  const [authError,      setAuthError]      = useState("");
  const [token,          setToken]          = useState("");
  const [conversationId, setConversationId] = useState("");

  useEffect(() => {
    (async () => {
      const params  = new URLSearchParams(window.location.search);
      const code    = params.get("code");
      const state   = params.get("state");
      const errDesc = params.get("error_description");

      if (errDesc) {
        window.history.replaceState({}, "", window.location.pathname);
        setAuthError(decodeURIComponent(errDesc));
        setScreen("login");
        return;
      }

      if (code) {
        const savedState   = sessionStorage.getItem(K_STATE);
        const codeVerifier = sessionStorage.getItem(K_VERIFIER);
        sessionStorage.removeItem(K_STATE);
        sessionStorage.removeItem(K_VERIFIER);
        window.history.replaceState({}, "", window.location.pathname);

        if (state !== savedState) {
          setAuthError("State mismatch — possible CSRF. Please try again.");
          setScreen("login");
          return;
        }

        try {
          /* Exchange code for tokens */
          const body = new URLSearchParams({
            client_id:     AUTH.clientId,
            grant_type:    "authorization_code",
            code,
            redirect_uri:  AUTH.redirectUri,
            scope:         AUTH.scope,
            code_verifier: codeVerifier,
          });
          const tokenRes  = await fetch(AUTH.tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
          const tokenData = await tokenRes.json();
          if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

          const accessToken = tokenData.access_token;

          /* Start bot conversation — capture final URL after any redirects */
          const convRes = await fetch(BOT_BASE + "/conversations?api-version=" + API_VER, {
            method:  "POST",
            headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
            body: JSON.stringify({ locale: "en-US" }),
          });
          const convText = await convRes.text();
          if (!convRes.ok) {
            let detail = convText;
            try { detail = JSON.stringify(JSON.parse(convText), null, 2); } catch (_) {}
            throw new Error("Bot " + convRes.status + " — " + detail);
          }
          const convData = JSON.parse(convText);

          // The conversation response returns a Direct Line token — use THIS for all
          // subsequent activity calls, not the original OAuth bearer token.
          const dlToken = convData.token || accessToken;

          sessionStorage.setItem(K_TOKEN, dlToken);
          sessionStorage.setItem(K_CONV,  convData.conversationId);
          setToken(dlToken);
          setConversationId(convData.conversationId);
          setScreen("chat");
        } catch (err) {
          setAuthError(err.message);
          setScreen("login");
        }
        return;
      }

      /* Resume existing session */
      const savedToken = sessionStorage.getItem(K_TOKEN);
      const savedConv  = sessionStorage.getItem(K_CONV);
      if (savedToken && savedConv) {
        setToken(savedToken);
        setConversationId(savedConv);
        setScreen("chat");
        return;
      }

      setScreen("login");
    })();
  }, []);

  const handleSignOut = () => {
    sessionStorage.removeItem(K_TOKEN);
    sessionStorage.removeItem(K_CONV);
    setToken("");
    setConversationId("");
    setScreen("login");
  };

  if (screen === "loading") return <div className="loading-screen"><span className="spinner large" /></div>;
  if (screen === "chat")    return <ChatScreen token={token} conversationId={conversationId} onSignOut={handleSignOut} />;
  return <LoginScreen error={authError} />;
}

/* ─────────────────────────
   SVG icons
───────────────────────── */
function CopilotIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 4C9.373 4 4 9.373 4 16s5.373 12 12 12 12-5.373 12-12S22.627 4 16 4z" fill="url(#cg)" />
      <path d="M11 16.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="cg" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" /><stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
function MsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022" />
      <rect x="11" y="1"  width="9" height="9" fill="#7fba00" />
      <rect x="1"  y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

