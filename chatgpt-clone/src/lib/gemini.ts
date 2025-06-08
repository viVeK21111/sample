// src/lib/gemini.ts
import type { Message } from './supabase';

// Client-side functions that call API routes
export async function generateText(prompt: string, history: Message[] = []): Promise<string> {
  try {
    console.log('Client: Calling generateText with prompt:', prompt);
    console.log('Client: History:', history);
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        history: history.map(msg => ({
          role: msg.role,
          content: msg.content,
          query: msg.query,
          datatext: msg.datatext
        }))
      }),
    });

    console.log('Client: API response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Client: API error:', errorData);
      throw new Error(`API error: ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('Client: Received data:', data);
    
    return data.text;
  } catch (error) {
    console.error('Client: Error in generateText:', error);
    throw error;
  }
}

export async function generateImage(prompt: string, history: Message[] = []): Promise<string> {
  try {
    console.log('Client: Calling generateImage with prompt:', prompt);
    console.log('Client: History:', history);
    
    const response = await fetch('/api/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        history: history.map(msg => ({
          role: msg.role,
          content: msg.content,
          query: msg.query,
          datatext: msg.datatext
        }))
      }),
    });

    console.log('Client: Image API response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Client: Image API error:', errorData);
      throw new Error(`API error: ${errorData.error || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('Client: Received image data:', data);
    
    return data.text;
  } catch (error) {
    console.error('Client: Error in generateImage:', error);
    throw error;
  }
}

// Test function
export async function testGeminiConnection() {
  try {
    console.log('Client: Testing Gemini connection...');
    const result = await generateText('Hello, this is a test');
    console.log('Client: Test response:', result);
    return true;
  } catch (error) {
    console.error('Client: Gemini test failed:', error);
    return false;
  }
}