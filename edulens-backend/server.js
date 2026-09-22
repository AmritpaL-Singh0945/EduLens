import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AzureOpenAI } from 'openai';
import multer from 'multer';
import * as cheerio from 'cheerio';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from './models/User.js';

import { createRequire } from 'module';

// The standard PDF parser (CommonJS import via createRequire)
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/edulens';
mongoose.connect(MONGO_URI)
  .then((conn) => {
    console.log(`Connected to MongoDB: ${conn.connection.host}`);
  })
  .catch((err) => console.error('MongoDB connection error:', err));

// Auth Routes
app.post('/api/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });

    await newUser.save();
    
    // Generate token
    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '7d' });
    
    res.status(201).json({ token, user: { id: newUser._id, username, email } });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret_key', { expiresIn: '7d' });
    
    res.json({ token, user: { id: user._id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});


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

    // Check if the latest user message contains URLs
    const latestMessage = contextMessages[contextMessages.length - 1];
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = latestMessage.content.match(urlRegex);

    // Increased length threshold to allow combining extracted PDF text with URLs in comparison prompts
    if (urls && urls.length > 0 && latestMessage.content.length < 20000) {
      try {
        let appendedScrapes = "";
        // Process up to 3 unique URLs to avoid timeouts/rate limits
        const uniqueUrls = [...new Set(urls)].slice(0, 3);
        
        for (const url of uniqueUrls) {
          try {
            const response = await fetch(url);
            const html = await response.text();
            
            const $ = cheerio.load(html);
            $('script, style, noscript, nav, footer').remove();
            let scrapedText = $('body').text().replace(/\s+/g, ' ').trim();
            
            scrapedText = scrapedText.substring(0, 8000); 
            appendedScrapes += `\n--- Extracted from ${url} ---\n${scrapedText}\n`;
          } catch(fetchErr) {
            console.error(`Failed to fetch ${url}:`, fetchErr);
          }
        }
        
        latestMessage.content = `${latestMessage.content}\n\nHere is the extracted content from the provided links to analyze:\n${appendedScrapes}`;
      } catch (err) {
        console.error("Failed to scrape URLs:", err);
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