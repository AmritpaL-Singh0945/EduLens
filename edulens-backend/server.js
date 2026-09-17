import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AzureOpenAI } from 'openai';
import multer from 'multer';
import * as cheerio from 'cheerio';

// The modernized, ESM-native PDF parser!
import pdf from 'pdf-parse-debugging-disabled';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Set up Multer for handling PDF uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4.1-mini";
const apiVersion = "2024-02-15-preview";

const client = new AzureOpenAI({ endpoint, apiKey, apiVersion, deployment });

// 1. PDF Upload & Text Extraction
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    // It's finally just a normal, working function!
    const data = await pdf(req.file.buffer);
    
    // Truncate to first 12,000 characters to save AI budget
    const extractedText = data.text.substring(0, 12000); 
    
    res.json({ text: extractedText });
  } catch (error) {
    console.error("PDF Parse Error:", error);
    res.status(500).json({ error: "Failed to parse PDF. Ensure it is a valid PDF file." });
  }
});

// 2. CHAT ENDPOINT: With URL Scraping
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    let contextMessages = [...messages];

    // Check if the latest user message contains a URL
    const latestMessage = contextMessages[contextMessages.length - 1];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = latestMessage.content.match(urlRegex);

    if (urls && urls.length > 0) {
      try {
        const response = await fetch(urls[0]);
        const html = await response.text();
        
        const $ = cheerio.load(html);
        $('script, style, noscript, nav, footer').remove();
        let scrapedText = $('body').text().replace(/\s+/g, ' ').trim();
        
        scrapedText = scrapedText.substring(0, 10000); 
        
        latestMessage.content = `The user shared this link: ${urls[0]}. Here is the extracted course text. Please analyze it:\n\n${scrapedText}`;
      } catch (err) {
        console.error("Failed to scrape URL:", err);
      }
    }

    // Budget optimization: keep System Prompt + last 4 messages
    if (contextMessages.length > 5) {
      const systemPrompt = contextMessages[0];
      const recentMessages = contextMessages.slice(-4);
      contextMessages = [systemPrompt, ...recentMessages];
    }

    const response = await client.chat.completions.create({
      model: deployment,
      messages: contextMessages,
      temperature: 0.3,
    });

    const rawReply = response.choices[0]?.message?.content || "";

    const stateMatch = rawReply.match(/<internal_state>([\s\S]*?)<\/internal_state>/);
    const internalState = stateMatch ? stateMatch[1].trim() : null;
    const cleanDisplayMessage = rawReply.replace(/<internal_state>[\s\S]*?<\/internal_state>/g, '').trim();

    res.json({
      role: 'assistant',
      content: cleanDisplayMessage || "Analyzing...",
      hiddenState: internalState
    });

  } catch (error) {
    console.error("Azure OpenAI API Error:", error);
    res.status(500).json({ error: "Failed to generate response." });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`EduLens Backend running on port ${PORT}`));