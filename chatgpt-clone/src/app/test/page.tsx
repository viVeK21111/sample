'use client';

import { useState, useEffect } from 'react';
import { testSupabaseConnection } from '@/lib/supabase';
import { testGeminiConnection } from '@/lib/gemini';

export default function TestPage() {
  const [supabaseStatus, setSupabaseStatus] = useState<'testing' | 'success' | 'error'>('testing');
  const [geminiStatus, setGeminiStatus] = useState<'testing' | 'success' | 'error'>('testing');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function runTests() {
      try {
        // Test Supabase
        const supabaseResult = await testSupabaseConnection();
        setSupabaseStatus(supabaseResult ? 'success' : 'error');

        // Test Gemini
        const geminiResult = await testGeminiConnection();
        setGeminiStatus(geminiResult ? 'success' : 'error');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    }

    runTests();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Connection Tests</h1>
      
      <div className="space-y-4">
        <div className="p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Supabase Connection</h2>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              supabaseStatus === 'testing' ? 'bg-yellow-500' :
              supabaseStatus === 'success' ? 'bg-green-500' :
              'bg-red-500'
            }`} />
            <span>
              {supabaseStatus === 'testing' ? 'Testing...' :
               supabaseStatus === 'success' ? 'Connected' :
               'Connection Failed'}
            </span>
          </div>
        </div>

        <div className="p-4 border rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Gemini API Connection</h2>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              geminiStatus === 'testing' ? 'bg-yellow-500' :
              geminiStatus === 'success' ? 'bg-green-500' :
              'bg-red-500'
            }`} />
            <span>
              {geminiStatus === 'testing' ? 'Testing...' :
               geminiStatus === 'success' ? 'Connected' :
               'Connection Failed'}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-4 border border-red-500 rounded-lg bg-red-50">
            <h2 className="text-lg font-semibold text-red-700 mb-2">Error</h2>
            <p className="text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
} 