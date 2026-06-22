import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

const BASE_URL =
  'https://default8cc21f62933649b9b4621e693eee1c.de.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/cr916_agentFo7wC6';
const API_VERSION = '2022-03-01-preview';

function TokenScreen({ onConnect }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!token.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/conversations?api-version=${API_VERSION}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      const data = await res.json();
      onConnect(token.trim(), data.conversationId);
    } catch (err) {
      setError(err.message || 'Failed to connect. Check your token and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="token-screen">
      <div className="token-card">
        <div className="token-card-header">
          <div className="logo-circle">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M16 4C9.373 4 4 9.373 4 16s5.373 12 12 12 12-5.373 12-12S22.627 4 16 4z" fill="url(#g1)" />
              <path d="M11 16.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="g1" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1>Copilot Studio</h1>
          <p>Enter your Azure AD Bearer token to start chatting</p>
        </div>

        <form onSubmit={handleConnect} className="token-form">
          <div className="input-group">
            <label htmlFor="token">Bearer Token</label>
            <textarea
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Bearer token here..."
              rows={4}
              spellCheck={false}
            />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button type="submit" className="connect-btn" disabled={loading || !token.trim()}>
            {loading ? (
              <>
                <span className="spinner" /> Connecting…
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Connect
              </>
            )}
          </button>
        </form>

        <p className="token-hint">
          You can get a token via the Power Platform CLI or Azure CLI:<br />
          <code>az account get-access-token --resource https://api.powerplatform.com</code>
        </p>
      </div>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`message-row ${isUser ? 'user' : 'bot'}`}>
      {!isUser && (
        <div className="avatar bot-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="url(#ga)" />
            <path d="M8 12.5l2.5 2.5 5.5-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="ga" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#6366f1" />
                <stop offset="1" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      )}
      <div className="bubble-wrap">
        <div className={`bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
          {msg.typing ? (
            <span className="typing-dots">
              <span /><span /><span />
            </span>
          ) : (
            <span>{msg.text}</span>
          )}
        </div>
        <span className="timestamp">{msg.time}</span>
      </div>
      {isUser && (
        <div className="avatar user-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      )}
    </div>
  );
}

function ChatScreen({ token, conversationId, onDisconnect }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const watermarkRef = useRef(null);
  const pollingRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const now = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const pollActivities = useCallback(async () => {
    try {
      const url = `${BASE_URL}/conversations/${conversationId}/activities?api-version=${API_VERSION}${
        watermarkRef.current != null ? `&watermark=${watermarkRef.current}` : ''
      }`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.watermark != null) watermarkRef.current = data.watermark;
      const botMessages = (data.activities || []).filter(
        (a) => a.type === 'message' && a.from?.role !== 'user'
      );
      if (botMessages.length > 0) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => !m.typing);
          const newMsgs = botMessages.map((a) => ({
            id: a.id || Math.random().toString(36),
            role: 'bot',
            text: a.text || '',
            time: now(),
          }));
          return [...filtered, ...newMsgs];
        });
        setSending(false);
      }
    } catch (_) {}
  }, [token, conversationId]);

  useEffect(() => {
    pollingRef.current = setInterval(pollActivities, 1500);
    return () => clearInterval(pollingRef.current);
  }, [pollActivities]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const userMsg = { id: Date.now().toString(), role: 'user', text, time: now() };
    const typingMsg = { id: 'typing', role: 'bot', typing: true, time: '' };
    setMessages((prev) => [...prev, userMsg, typingMsg]);

    try {
      await fetch(`${BASE_URL}/conversations/${conversationId}/activities?api-version=${API_VERSION}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'message',
          text,
          from: { id: 'user', role: 'user' },
        }),
      });
    } catch (_) {
      setSending(false);
      setMessages((prev) => prev.filter((m) => !m.typing));
    }
  };

  return (
    <div className="chat-screen">
      <header className="chat-header">
        <div className="chat-header-left">
          <div className="header-avatar">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <path d="M16 4C9.373 4 4 9.373 4 16s5.373 12 12 12 12-5.373 12-12S22.627 4 16 4z" fill="url(#gh)" />
              <path d="M11 16.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="gh" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h2>Copilot Agent</h2>
            <span className="status-dot" /> <span className="status-text">Online</span>
          </div>
        </div>
        <button className="disconnect-btn" onClick={onDisconnect} title="Disconnect">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Disconnect
        </button>
      </header>

      <div className="messages-area">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <p>Start the conversation below</p>
          </div>
        )}
        {messages.map((msg) => (
          <Message key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form className="input-area" onSubmit={sendMessage}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={sending}
          autoComplete="off"
        />
        <button type="submit" className="send-btn" disabled={sending || !input.trim()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('token'); // 'token' | 'chat'
  const [token, setToken] = useState('');
  const [conversationId, setConversationId] = useState('');

  const handleConnect = (tok, convId) => {
    setToken(tok);
    setConversationId(convId);
    setScreen('chat');
  };

  const handleDisconnect = () => {
    setToken('');
    setConversationId('');
    setScreen('token');
  };

  return screen === 'chat' ? (
    <ChatScreen token={token} conversationId={conversationId} onDisconnect={handleDisconnect} />
  ) : (
    <TokenScreen onConnect={handleConnect} />
  );
}
