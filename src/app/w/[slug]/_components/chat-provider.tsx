'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CustomerInput, ReplyBlock } from '@/modules/conversations/model';

/**
 * Client-side chat state: the message list, the conversation id + token (kept in localStorage so a
 * visitor can continue after a reload), sending, and polling for staff replies.
 * All decisions happen on the server; this component only sends inputs and renders results.
 */
export interface ChatMessage {
  id: string;
  author: 'CUSTOMER' | 'ASSISTANT' | 'STAFF' | 'SYSTEM';
  authorName: string | null;
  body: string;
  blocks: ReplyBlock[];
  createdAt: string;
  pending?: boolean;
  failed?: string;
}

interface ChatContextValue {
  isOpen: boolean;
  open: (initial?: { input: CustomerInput; label: string }) => void;
  close: () => void;
  messages: ChatMessage[];
  send: (input: CustomerInput, label: string) => Promise<void>;
  sending: boolean;
  assistantActive: boolean;
  manageUrl: string | null;
  notice: string | null;
  restart: () => void;
  businessName: string;
  timeZone: string;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside <ChatProvider>');
  return value;
}

interface Stored {
  conversationId: string;
  token: string;
}

const storageKey = (slug: string) => `relay-chat:${slug}`;

function readStored(slug: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function writeStored(slug: string, value: Stored | null) {
  try {
    if (value) window.localStorage.setItem(storageKey(slug), JSON.stringify(value));
    else window.localStorage.removeItem(storageKey(slug));
  } catch {
    // Private browsing or blocked storage: the chat still works, it just won't survive a reload.
  }
}

export function ChatProvider({
  slug,
  businessName,
  timeZone,
  welcome,
  formToken,
  children,
}: {
  slug: string;
  businessName: string;
  timeZone: string;
  welcome: { body: string; blocks: ReplyBlock[] };
  formToken: string;
  children: React.ReactNode;
}) {
  const welcomeMessage = useMemo<ChatMessage>(
    () => ({
      id: 'welcome',
      author: 'ASSISTANT',
      authorName: null,
      body: welcome.body,
      blocks: welcome.blocks,
      createdAt: new Date().toISOString(),
    }),
    [welcome],
  );
  const [isOpen, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [sending, setSending] = useState(false);
  const [assistantActive, setAssistantActive] = useState(true);
  const [manageUrl, setManageUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const conversation = useRef<Stored | null>(null);
  const loaded = useRef(false);

  const merge = useCallback((incoming: ChatMessage[], replaceAll = false) => {
    setMessages((current) => {
      // Pending messages stay until their own request finishes; `send` removes them explicitly.
      const base = replaceAll ? current.filter((m) => m.pending) : current;
      const byId = new Map(base.map((m) => [m.id, m]));
      for (const message of incoming) byId.set(message.id, message);
      const merged = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return merged.length ? merged : current;
    });
  }, []);

  const resetConversation = useCallback(
    (message: string | null) => {
      conversation.current = null;
      writeStored(slug, null);
      setMessages([welcomeMessage]);
      setAssistantActive(true);
      setManageUrl(null);
      setNotice(message);
    },
    [slug, welcomeMessage],
  );

  // Resume a stored conversation the first time the chat opens.
  useEffect(() => {
    if (!isOpen || loaded.current) return;
    loaded.current = true;
    const stored = readStored(slug);
    if (!stored) return;
    conversation.current = stored;
    fetch(`/api/public/${slug}/chat/${stored.conversationId}`, {
      headers: { 'x-relay-conversation-token': stored.token },
    })
      .then(async (response) => {
        if (response.status === 404) return resetConversation(null);
        if (!response.ok) return;
        const data = (await response.json()) as { messages: ChatMessage[]; assistantActive: boolean };
        merge(data.messages, true);
        setAssistantActive(data.assistantActive);
      })
      .catch(() => {});
  }, [isOpen, slug, merge, resetConversation]);

  // Poll for replies from staff while the chat is open.
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      const current = conversation.current;
      if (!current || document.hidden) return;
      const last = [...messagesRef.current]
        .reverse()
        .find((m) => !m.pending && !m.failed && m.id !== 'welcome');
      fetch(`/api/public/${slug}/chat/${current.conversationId}${last ? `?after=${last.id}` : ''}`, {
        headers: { 'x-relay-conversation-token': current.token },
      })
        .then(async (response) => {
          if (!response.ok) return;
          const data = (await response.json()) as { messages: ChatMessage[]; assistantActive: boolean };
          if (data.messages.length) merge(data.messages);
          setAssistantActive(data.assistantActive);
        })
        .catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isOpen, slug, merge]);

  const send = useCallback(
    async (input: CustomerInput, label: string) => {
      if (sending) return;
      setSending(true);
      setNotice(null);
      const temp: ChatMessage = {
        id: `pending-${Date.now()}`,
        author: 'CUSTOMER',
        authorName: null,
        body: label,
        blocks: [],
        createdAt: new Date().toISOString(),
        pending: true,
      };
      setMessages((list) => [...list, temp]);

      try {
        const current = conversation.current;
        const response = await fetch(`/api/public/${slug}/chat`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(current ? { 'x-relay-conversation-token': current.token } : {}),
          },
          body: JSON.stringify({
            conversationId: current?.conversationId ?? null,
            input,
            formToken,
            website: '',
          }),
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          const message: string = data?.error?.message ?? 'The message could not be sent. Please try again.';
          if (response.status === 404 && current) {
            resetConversation('That conversation has ended. You can start a new one below.');
            return;
          }
          setMessages((list) =>
            list.map((m) => (m.id === temp.id ? { ...m, pending: false, failed: message } : m)),
          );
          return;
        }

        if (data.token) {
          conversation.current = { conversationId: data.conversationId, token: data.token };
          writeStored(slug, conversation.current);
        }
        setMessages((list) => list.filter((m) => m.id !== temp.id));
        merge(data.messages, !current);
        setAssistantActive(data.assistantActive);
        if (data.manageUrl) setManageUrl(data.manageUrl);
      } catch {
        setMessages((list) =>
          list.map((m) =>
            m.id === temp.id
              ? { ...m, pending: false, failed: 'No connection. Check your internet and try again.' }
              : m,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [sending, slug, formToken, merge, resetConversation],
  );

  const pendingInitial = useRef<{ input: CustomerInput; label: string } | null>(null);
  const open = useCallback((initial?: { input: CustomerInput; label: string }) => {
    setOpen(true);
    if (initial) pendingInitial.current = initial;
  }, []);

  // Send a preset input (e.g. "Book this service") once the panel is open and loaded.
  useEffect(() => {
    if (!isOpen || !pendingInitial.current || sending) return;
    const initial = pendingInitial.current;
    pendingInitial.current = null;
    const timer = window.setTimeout(() => void send(initial.input, initial.label), 150);
    return () => window.clearTimeout(timer);
  }, [isOpen, send, sending]);

  const value: ChatContextValue = {
    isOpen,
    open,
    close: () => setOpen(false),
    messages,
    send,
    sending,
    assistantActive,
    manageUrl,
    notice,
    restart: () => resetConversation(null),
    businessName,
    timeZone,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function OpenChatButton({
  children,
  className,
  input,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  input?: CustomerInput;
  label?: string;
}) {
  const { open } = useChat();
  return (
    <button
      type="button"
      className={className}
      onClick={() => open(input && label ? { input, label } : undefined)}
      aria-haspopup="dialog"
    >
      {children}
    </button>
  );
}
