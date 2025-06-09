'use client';

import { useState, useRef, useEffect } from 'react';
import { useUser } from '@auth0/nextjs-auth0/client';
import { supabase, type Message, type Session } from '@/lib/supabase';
import { generateText, generateImage } from '@/lib/gemini';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  const { user, error: authError, isLoading: authLoading } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [selectedModel, setSelectedModel] = useState<'text' | 'image'>('text');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Fetch all sessions for the user (on load)
  const fetchSessions = async () => {
    try {
      const { data: sessionsData, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', user?.sub)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (sessionsData && sessionsData.length > 0) {
        setSessions(sessionsData);
        setCurrentSession(sessionsData[0]); // most recent session
        fetchMessages(sessionsData[0].session_id);
      } else {
        // No sessions, create one for new user
        await createNewSession();
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setError('Failed to load chat sessions');
    }
  };

  // Create a new session for the user
  const createNewSession = async () => {
    try {
      const { error } = await supabase
        .from('users')
        .insert([
          {
            user_id: user?.sub,
          },
        ])
        .select()
        .single();
      if (error) throw error;
      // After creating, re-fetch all sessions to update sidebar and set current
      await fetchSessions();
      // Close sidebar on mobile after creating new session
      setIsSidebarOpen(false);
    } catch (error) {
      console.error('Error creating session:', error);
      setError('Failed to create new chat');
    }
  };

  // Fetch all messages for a session
  const fetchMessages = async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }
      
      // Convert sessions data to Message format for UI
      const convertedMessages: Message[] = (data || []).flatMap(session => [
        {
          id: `user-${session.id}`,
          user_id: user?.sub || '',
          session_id: sessionId,
          role: 'user' as const,
          content: session.query,
          query: session.query,
          datatext: session.query,
          created_at: session.created_at,
        },
        ...(session.datatext && session.datatext !== session.query ? [{
          id: `assistant-${session.id}`,
          user_id: user?.sub || '',
          session_id: sessionId,
          role: 'assistant' as const,
          content: session.datatext,
          query: session.query,
          datatext: session.datatext,
          created_at: session.created_at,
        }] : [])
      ]);
      
      setMessages(convertedMessages);
    } catch (error) {
      console.error('Error in fetchMessages:', error);
      setError('Failed to load messages');
    }
  };

  // Send a message (insert into sessions, update datatext after Gemini responds)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentSession) return;

    setError(null);
    setIsLoading(true);

    // 1. Fetch previous messages for this session (for Gemini history)
    let history: Message[] = [];
    try {
      const { data: historyData } = await supabase
        .from('sessions')
        .select('*')
        .eq('session_id', currentSession.session_id)
        .order('created_at', { ascending: true });
      
      if (historyData) history = historyData;
    } catch (err) {
      console.error('Error in history fetch:', err);
      history = [];
    }

    // 2. Add user message and loading assistant message to UI (local only)
    const userMessageUI: Message = {
      id: crypto.randomUUID(),
      user_id: user?.sub || '',
      session_id: currentSession.session_id,
      role: 'user',
      content: input,
      query: input,
      datatext: input,
      created_at: new Date().toISOString(),
    };
    const loadingAssistantUI: Message = {
      id: 'loading-' + crypto.randomUUID() + '-' + Date.now(),
      user_id: user?.sub || '',
      session_id: currentSession.session_id,
      role: 'assistant',
      content: '...',
      datatext: '...',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessageUI, loadingAssistantUI]);
    const currentInput = input;
    setInput('');

    try {
      // 3. Call Gemini with previous history for this session
      const response = await generateText(currentInput, history);

      // 4. Update the UI: replace the loading assistant message with the real response
      setMessages(prev =>
        prev.map(msg =>
          msg.id === loadingAssistantUI.id
            ? { ...msg, content: response, datatext: response }
            : msg
        )
      );

      // 5. Insert a single row into Supabase sessions table
      const { error } = await supabase
        .from('sessions')
        .insert([{
          session_id: currentSession.session_id, // Use session_id from users table
          query: currentInput,
          datatext: response,
          created_at: new Date().toISOString(),
        }])
        .select();

      if (error) {
        console.error('Supabase insertion error:', error);
        throw error;
      }
      
    } catch (err) {
      console.error('Error in handleSendMessage:', err);
      setError('Failed to send message');
      // Remove the loading message on error
      setMessages(prev => prev.filter(msg => msg.id !== loadingAssistantUI.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!input.trim() || !currentSession) return;

    const currentInput = input;
    setInput('');
    setIsGeneratingImage(true);
    setError(null);

    // Add user message to UI
    const userMessage: Message = {
      id: crypto.randomUUID(),
      user_id: user?.sub || '',
      session_id: currentSession.session_id,
      role: 'user',
      content: currentInput,
      query: currentInput,
      datatext: currentInput,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Fetch history for image generation
      const { data: historyData } = await supabase
        .from('sessions')
        .select('*')
        .eq('session_id', currentSession.session_id)
        .order('created_at', { ascending: true });

      const imageResponse = await generateImage(currentInput, historyData || []);
      
      // Add assistant message to UI
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        user_id: user?.sub || '',
        session_id: currentSession.session_id,
        role: 'assistant',
        content: imageResponse,
        query: currentInput,
        datatext: imageResponse,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Insert into database
      const { error } = await supabase
        .from('sessions')
        .insert([{
          session_id: currentSession.session_id,
          query: currentInput,
          datatext: imageResponse,
          created_at: new Date().toISOString(),
        }]);

      if (error) {
        console.error('Error inserting image session:', error);
        throw error;
      }

    } catch (error) {
      console.error('Error generating image:', error);
      setError('Failed to generate image');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSessionSelect = (session: Session) => {
    setCurrentSession(session);
    fetchMessages(session.session_id);
    setIsSidebarOpen(false); // Close sidebar on mobile after selection
  };

  // Ensure sessions are fetched on page load or when user changes
  useEffect(() => {
    if (user) fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const sidebar = document.getElementById('sidebar');
      const hamburger = document.getElementById('hamburger-btn');
      
      if (isSidebarOpen && sidebar && !sidebar.contains(event.target as Node) && 
          hamburger && !hamburger.contains(event.target as Node)) {
        setIsSidebarOpen(false);
      }
    };

    if (isSidebarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSidebarOpen]);

  if (authLoading) {
    return (
      <div className="d-flex align-items-center justify-content-center vh-100 bg-light">
        <div className="spinner-border text-primary" role="status"></div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="d-flex align-items-center justify-content-center vh-100 bg-light">
        <div className="text-danger text-center">
          <h2 className="h4 mb-2">Authentication Error</h2>
          <p>{authError.message}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center vh-100 bg-light p-4">
        <div className="text-center w-100" style={{ maxWidth: 400 }}>
          <h1 className="display-5 fw-bold mb-3">Welcome to AI Chat</h1>
          <p className="text-secondary mb-4">Experience the power of AI conversation</p>
          <Link
            href="/api/auth/login"
            className="btn btn-primary btn-lg w-100"
          >
            Get Started
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid vh-100 d-flex flex-row bg-light p-0 position-relative">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="position-fixed w-100 h-100 bg-dark bg-opacity-50 d-lg-none"
          style={{ zIndex: 1040 }}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        id="sidebar"
        className={`bg-dark text-white p-3 d-flex flex-column ${
          isSidebarOpen ? 'position-fixed' : 'd-none d-lg-flex position-lg-relative'
        }`}
        style={{ 
          width: 280, 
          minHeight: '100vh',
          zIndex: 1050,
          left: isSidebarOpen ? 0 : undefined,
          transition: 'left 0.3s ease-in-out'
        }}
      >
        {/* Mobile close button */}
        <button
          className="btn btn-outline-light align-self-end mb-2 d-lg-none"
          onClick={() => setIsSidebarOpen(false)}
          style={{ width: 'auto' }}
        >
          ✕
        </button>

        <button
          onClick={createNewSession}
          className="btn btn-outline-light w-100 mb-3 d-flex flex-column align-items-center py-3"
        >
          <span className="display-4">+</span>
          <span>New Chat</span>
        </button>

        <div className="flex-grow-1 overflow-auto mb-3">
          {Array.from(new Map(sessions.map(s => [s.session_id, s])).values()).map((session, idx, arr) => (
            <button
              key={session.session_id}
              onClick={() => handleSessionSelect(session)}
              className={`btn w-100 text-start mb-2 p-3 ${
                session.session_id === currentSession?.session_id ? 'btn-primary' : 'btn-outline-secondary'
              }`}
            >
              <div className="text-truncate fw-bold">Session {arr.length - idx}</div>
              <div className="small text-muted">{new Date(session.created_at).toLocaleDateString()}</div>
            </button>
          ))}
        </div>

        <div className="mt-auto">
          <div className="d-flex align-items-center mb-3 p-2 border rounded">
            {user.picture ? (
              <div style={{ width: 40, height: 40, position: 'relative' }} className="me-3">
                <Image
                  src={user.picture}
                  alt={user.name || 'User'}
                  className="rounded-circle"
                  fill
                  sizes="40px"
                  style={{ objectFit: 'cover' }}
                  unoptimized
                />
              </div>
            ) : (
              <div 
                className="rounded-circle bg-primary d-flex align-items-center justify-content-center me-3"
                style={{ width: 40, height: 40 }}
              >
                <span className="text-white fw-bold">
                  {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
            )}
            <div className="flex-grow-1 min-w-0">
              <div className="fw-bold text-truncate">{user.name || user.email}</div>
              <div className="small text-muted text-truncate">{user.email}</div>
            </div>
          </div>
          <Link href="/api/auth/logout" className="btn btn-outline-light w-100">
            Sign Out
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-grow-1 d-flex flex-column h-100" style={{ minWidth: 0 }}>
        {/* Header */}
        <header className="bg-white border-bottom p-3 d-flex align-items-center justify-content-between sticky-top">
          {/* Mobile hamburger menu */}
          <button
            id="hamburger-btn"
            className="btn btn-outline-secondary d-lg-none me-2"
            onClick={() => setIsSidebarOpen(true)}
            style={{ minWidth: 'auto' }}
          >
            ☰
          </button>
          
          <h1 className="h5 mb-0 text-truncate flex-grow-1">
            {currentSession?.title || 'New Chat'}
          </h1>
        </header>

        {/* Error Message */}
        {error && (
          <div className="alert alert-danger m-3 mx-2 mx-sm-3">{error}</div>
        )}

        {/* Chat Messages */}
        <div className="flex-grow-1 overflow-auto p-2 p-sm-3">
          {messages?.length === 0 ? (
            <div className="d-flex align-items-center justify-content-center h-100">
              <div className="text-center w-100 px-3" style={{ maxWidth: 400 }}>
                <div className="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 64, height: 64 }}>
                  <span className="display-6 text-primary">💬</span>
                </div>
                <h3 className="h6 mb-2">Start a conversation</h3>
                <p className="text-muted">Ask me anything and I&apos;ll do my best to help!</p>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`d-flex ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}>
                  <div 
                    className={`card ${msg.role === 'user' ? 'bg-primary text-white' : ''}`} 
                    style={{ 
                      maxWidth: '85%',
                      minWidth: '200px'
                    }}
                  >
                    <div className="card-body p-2 p-sm-3">
                      <div className="card-text">
                        {msg.role === 'user' ? (
                          <div style={{ wordBreak: 'break-word' }}>{msg.content}</div>
                        ) : (
                          <ReactMarkdown
                            components={{
                              code: ({ className, children, ...props }) => {
                                const isInline = !className?.includes('language-');
                                return isInline ? (
                                  <code className="bg-light px-1 rounded text-dark" {...props}>
                                    {children}
                                  </code>
                                ) : (
                                  <pre className="bg-light p-2 rounded text-dark overflow-auto">
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  </pre>
                                );
                              },
                              a: ({ children, ...props }) => (
                                <a className="text-primary" {...props}>
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {(isGeneratingImage || isLoading) && (
                <div className="d-flex justify-content-start">
                  <div className="card" style={{ maxWidth: '85%' }}>
                    <div className="card-body p-2 p-sm-3">
                      <div className="spinner-border text-secondary me-2" role="status" style={{ width: 20, height: 20 }}></div>
                      <span className="text-muted">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-top bg-white p-2 p-sm-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              console.log('Form submitted, selectedModel:', selectedModel, 'input:', input);
              if (selectedModel === 'text') {
                handleSendMessage(e);
              } else {
                handleGenerateImage();
              }
            }}
            className="d-flex flex-column flex-sm-row gap-2 align-items-stretch align-items-sm-end"
          >
            <select
              className="form-select order-1 order-sm-0"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as 'text' | 'image')}
              style={{ maxWidth: '100%', minWidth: '100px' }}
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
            </select>
            
            <div className="flex-grow-1 order-0 order-sm-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={selectedModel === 'text' ? "Message AI..." : "Describe the image you want..."}
                className="form-control"
                style={{ 
                  minHeight: 50, 
                  maxHeight: 200, 
                  resize: 'none',
                  fontSize: '16px' // Prevent zoom on iOS
                }}
                disabled={isGeneratingImage || isLoading}
                rows={2}
              />
            </div>
            
            <button
              type="submit"
              disabled={!input.trim() || isGeneratingImage || isLoading}
              className="btn btn-primary order-2 flex-shrink-0"
              style={{ minWidth: '70px' }}
            >
              Send
            </button>
          </form>
          
          <div className="form-text text-center mt-2 small">
            AI can make mistakes. Consider checking important information.
          </div>
        </div>
      </div>
    </div>
  );
}