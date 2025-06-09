// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Initialize Gemini API (server-side only)
const apiKey = process.env.GEMINI_API_KEY; // Remove NEXT_PUBLIC_ prefix for server-side
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey!);
const textModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
  query?: string;
  datatext?: string;
}

const convertMessagesToHistory = (messages: Message[]) => {
  // Ensure the first message is from the user
  const filtered = [...messages];
  while (filtered.length > 0 && filtered[0].role !== 'user') {
    filtered.shift();
  }
  // Optionally, remove any leading non-user messages
  return filtered.map(item => ({
    role: item.role === 'user' ? 'user' : 'model',
    parts: [{ text: item.role === 'user' ? item.query || item.content : item.datatext || item.content }]
  }));
};

export async function POST(request: NextRequest) {
  try {
    console.log('API route called - POST /api/chat');
    
    const body = await request.json();
    const { prompt, history = [] } = body;
    
    console.log('Received prompt:', prompt);
    console.log('Received history:', history);
    
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    console.log('Starting chat with Gemini...');
    const geminiHistory = convertMessagesToHistory(history);
    console.log('Final Gemini history:', geminiHistory);
    const chat = textModel.startChat({
      history: geminiHistory,
      safetySettings,
    });
    
    const result = await chat.sendMessage(prompt);
    console.log('Received response from Gemini');
    
    const response = result.response;
    const text = response.text();
    
    console.log('Generated text:', text);
    
    return NextResponse.json({ text });
  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}