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

  // Fetch all sessions for the user (on load)
  const fetchSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', user?.sub)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data && data.length > 0) {
        setSessions(data);
        setCurrentSession(data[0]); // most recent session
        fetchMessages(data[0].session_id); // Use session_id from users table
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
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
      
      console.log('Successfully inserted into sessions:', data);
      
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

  // Ensure sessions are fetched on page load or when user changes
  useEffect(() => {
    if (user) fetchSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    <div className="container-fluid vh-100 d-flex flex-row bg-light p-0">
      {/* Sidebar */}
      <div className="bg-dark text-white p-3 d-flex flex-column" style={{ width: 260, minHeight: '100vh' }}>
        <button
          onClick={createNewSession}
          className="btn btn-outline-light w-100 mb-3 d-flex flex-column align-items-center"
        >
          <span className="display-4">+</span>
          <span>New Chat</span>
        </button>
        <div className="flex-grow-1 overflow-auto mb-3">
          {Array.from(new Map(sessions.map(s => [s.session_id, s])).values()).map((session, idx, arr) => (
            <button
              key={session.session_id}
              onClick={() => {
                setCurrentSession(session);
                fetchMessages(session.session_id);
              }}
              className={`btn w-100 text-start mb-2 ${session.session_id === currentSession?.session_id ? 'btn-primary' : 'btn-outline-secondary'}`}
            >
              <div className="text-truncate">Session {arr.length - idx}</div>
              <div className="small text-muted">{new Date(session.created_at).toLocaleDateString()}</div>
            </button>
          ))}
        </div>
        <div className="mt-auto">
          <div className="d-flex align-items-center mb-2">
            {user.picture ? (
              <div style={{ width: 40, height: 40, position: 'relative' }}>
                <Image
                  src={user.picture}
                  alt={user.name || 'User'}
                  className="rounded-circle"
                  fill
                  sizes="40px"
                  style={{ objectFit: 'cover' }}
                  unoptimized // Add this for external images
                />
              </div>
            ) : (
              <div 
                className="rounded-circle bg-primary d-flex align-items-center justify-content-center me-2"
                style={{ width: 40, height: 40 }}
              >
                <span className="text-white">
                  {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
            )}
            <div>
              <div className="fw-bold text-truncate">{user.name || user.email}</div>
              <div className="small text-muted text-truncate">{user.email}</div>
            </div>
          </div>
          <Link href="/api/auth/logout" className="btn btn-outline-light w-100">Sign Out</Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-grow-1 d-flex flex-column h-100">
        {/* Header */}
        <header className="bg-white border-bottom p-3 d-flex align-items-center justify-content-between sticky-top">
          <h1 className="h5 mb-0">{currentSession?.title || 'New Chat'}</h1>
        </header>

        {/* Error Message */}
        {error && (
          <div className="alert alert-danger m-3">{error}</div>
        )}

        {/* Chat Messages */}
        <div className="flex-grow-1 overflow-auto p-3">
          {messages?.length === 0 ? (
            <div className="d-flex align-items-center justify-content-center h-100">
              <div className="text-center w-100" style={{ maxWidth: 400 }}>
                <div className="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 64, height: 64 }}>
                  <span className="display-6 text-primary">💬</span>
                </div>
                <h3 className="h6 mb-2">Start a conversation</h3>
                <p className="text-muted">Ask me anything and I'll do my best to help!</p>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {messages.map((msg) => (
                <div key={msg.id} className={`d-flex ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}>
                  <div className={`card ${msg.role === 'user' ? 'bg-primary text-white' : ''}`} style={{ maxWidth: '75%' }}>
                    <div className="card-body p-3">
                      <div className="card-text">
                        {msg.role === 'user' ? (
                          msg.content
                        ) : (
                          <ReactMarkdown
                            components={{
                              code: ({ className, children, ...props }) => {
                                const isInline = !className?.includes('language-');
                                return isInline ? (
                                  <code className="bg-light px-1 rounded" {...props}>
                                    {children}
                                  </code>
                                ) : (
                                  <pre className="bg-light p-2 rounded">
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
                  <div className="card" style={{ maxWidth: '75%' }}>
                    <div className="card-body p-3">
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
        <div className="border-top bg-white p-3">
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
            className="d-flex gap-2 align-items-end"
          >
            <select
              className="form-select w-auto"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as 'text' | 'image')}
              style={{ maxWidth: 120 }}
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
            </select>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectedModel === 'text' ? "Message AI..." : "Describe the image you want..."}
              className="form-control"
              style={{ minHeight: 50, maxHeight: 200, resize: 'none' }}
              disabled={isGeneratingImage || isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isGeneratingImage || isLoading}
              className="btn btn-primary"
            >
              Send
            </button>
          </form>
          <div className="form-text text-center mt-2">
            AI can make mistakes. Consider checking important information.
          </div>
        </div>
      </div>
    </div>
  );
}