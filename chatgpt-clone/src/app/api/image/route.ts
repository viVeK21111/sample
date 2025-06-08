// src/app/api/image/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Initialize Gemini API (server-side only)
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey!);
const imageModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-preview-image-generation' });

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

export async function POST(request: NextRequest) {
  try {
    console.log('API route called - POST /api/image');
    
    const body = await request.json();
    const { prompt, history = [] } = body;
    
    console.log('Received image prompt:', prompt);
    console.log('Received history:', history);
    
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Include context from conversation if available
    const contextPrompt = history.length > 0 
      ? `Based on our conversation: ${history.map((m: Message) => m.content).join(' ')}\n\nNow, ${prompt}`
      : prompt;

    console.log('Generating image with contextual prompt...');
    
    const result = await imageModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: contextPrompt }] }],
      safetySettings,
    });
    
    const response = await result.response;
    const text = response.text();
    
    console.log('Generated image response:', text);
    
    return NextResponse.json({ text });
  } catch (error) {
    console.error('Error in image API:', error);
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    );
  }
}