import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import { Login, Signup } from './components/Auth';
import { Home } from './components/Home';
import { LogOut, LayoutDashboard, History, Settings, Upload, Sun, Moon, ArrowRight, BookOpen, Trash2 } from 'lucide-react';

const SYSTEM_PROMPT = {
  role: "system",
  content: `<role>
You are EduLens AI, an advanced Course Content Analyzer and Learning Assistant.
</role>

<core_directives>
1. YOU ARE AN ANALYZER & ASSISTANT. Focus on extraction, hierarchy, and structural analysis, but smoothly transition to teaching or quizzing when requested.
2. DEPENDENCY MAPPING. Explicitly flag missing foundational knowledge.
3. STRUCTURED UI OUTPUTS. Use <ui_analysis> for curriculums/roadmaps and <ui_mcq> for questions.
</core_directives>

<workflow_states>
[STATE 1: INGESTION] - User pastes content, URLs, or PDF.
[STATE 2: STRUCTURAL ANALYSIS] - Output <ui_analysis> JSON card (Modules or Roadmap).
[STATE 3: DEEP DIVE] - Expand on topics or teach.
[STATE 4: ASSESSMENT] - Output <ui_mcq> JSON block for quizzes.
</workflow_states>

<operational_rules>

## STATE 2: STRUCTURAL ANALYSIS
When generating an analysis or roadmap, you MUST output the <ui_analysis> JSON block. You can use either the "modules" format or the "roadmap" format depending on what fits best.
FORMAT 1 (Modules): { "course_title": "...", "difficulty_level": "...", "estimated_hours": 0, "missing_prerequisites": [], "modules": [ { "id": 1, "title": "...", "topics": [], "estimated_hours": 0 } ] }
FORMAT 2 (Roadmap): { "course_title": "...", "total_estimated_hours": 0, "roadmap": [ { "week": "1", "module": "...", "objectives": [], "activities": [], "estimated_hours": 0 } ] }

## STATE 4: ASSESSMENT
When asked for an MCQ, quiz, or knowledge check, you MUST output using this EXACT format:
<ui_mcq>
{
  "question": "The actual question text goes here?",
  "options": {
    "A": "Option 1 text",
    "B": "Option 2 text",
    "C": "Option 3 text",
    "D": "Option 4 text"
  }
}
</ui_mcq>
Wait for the user to answer. In your next turn, evaluate their answer, briefly explain why it's correct/incorrect, and ask the next question if appropriate.
</operational_rules>`
};

// --- Best Practice: Robust JSON Parsing Utility ---
const extractSafeJSON = (text, tag) => {
  try {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
    const match = text.match(regex);
    let rawJson = '';

    if (match) {
      rawJson = match[1].trim();
    } else {
      // Fallback: If AI forgets tags, try to find a JSON object in the text
      const isAnalysis = tag === 'ui_analysis' && (text.includes('"course_title"') || text.includes('"roadmap"') || text.includes('"modules"'));
      const isMcq = tag === 'ui_mcq' && text.includes('"question"') && text.includes('"options"');
      
      if (isAnalysis || isMcq) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) rawJson = jsonMatch[0].trim();
      }
    }

    if (!rawJson) return null;
    
    // Clean potential markdown blocks AI sometimes adds inside tags
    rawJson = rawJson.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    
    return JSON.parse(rawJson);
  } catch (e) {
    console.error(`EduLens Debug: Failed to parse <${tag}> JSON.`, e);
    return null;
  }
};

// --- Sub-component for clean MCQ Select UI ---
const MCQBlock = ({ mcqData, onAnswerSubmit, isDisabled }) => {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 md:p-6 rounded-xl shadow-md my-6 max-w-2xl transition-colors duration-300">
      <div className="flex items-center gap-2 mb-4">
        <span className="bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">Knowledge Check</span>
      </div>
      <p className="font-bold text-zinc-900 dark:text-zinc-100 mb-5 text-base md:text-lg leading-relaxed">{mcqData.question}</p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(mcqData.options).map(([key, val]) => (
          <button
            key={key}
            onClick={() => {
              if (!isDisabled) onAnswerSubmit(`My answer is ${key}`);
            }}
            disabled={isDisabled}
            className="text-left bg-zinc-50 dark:bg-zinc-950 hover:bg-primary-50 dark:hover:bg-primary-900/20 border border-zinc-200 dark:border-zinc-800 hover:border-primary-300 dark:hover:border-primary-700 text-zinc-800 dark:text-zinc-200 p-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm hover:shadow"
          >
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-500 dark:text-zinc-400 group-hover:bg-primary-100 dark:group-hover:bg-primary-800 group-hover:text-primary-700 dark:group-hover:text-primary-300 group-hover:border-primary-300 dark:group-hover:border-primary-600 transition-colors">
                {key}
              </span>
              <span className="text-sm font-medium leading-snug pt-0.5">{val}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

function Analyzer({ user, setAuth, toggleTheme, isDark }) {
  const [messages, setMessages] = useState([SYSTEM_PROMPT]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('EduLens is thinking...');
  const [greeting, setGreeting] = useState('');
  
  // History State
  const [history, setHistory] = useState([]);
  const [sessionId, setSessionId] = useState(() => Date.now().toString());
  const [showHistory, setShowHistory] = useState(false);

  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 12) setGreeting('Good morning');
    else if (hour >= 12 && hour < 17) setGreeting('Good afternoon');
    else if (hour >= 17 && hour < 22) setGreeting('Good evening');
    else setGreeting('Good night');
  }, []);

  // Load history from localStorage
  useEffect(() => {
    if (user?.id) {
      const saved = localStorage.getItem(`edulens_history_${user.id}`);
      if (saved) setHistory(JSON.parse(saved));
    }
  }, [user]);

  // Save to history when messages update
  useEffect(() => {
    if (user?.id && messages.length > 1) {
      setHistory(prev => {
        const title = messages[1]?.fileName || messages[1]?.content?.substring(0, 25) + '...' || 'New Analysis';
        const existingIdx = prev.findIndex(h => h.id === sessionId);
        let newHistory = [...prev];
        if (existingIdx >= 0) {
          newHistory[existingIdx] = { ...newHistory[existingIdx], messages, title };
        } else {
          newHistory = [{ id: sessionId, title, date: new Date().toISOString(), messages }, ...newHistory];
        }
        localStorage.setItem(`edulens_history_${user.id}`, JSON.stringify(newHistory));
        return newHistory;
      });
    }
  }, [messages, sessionId, user]);

  const loadSession = (id) => {
    const session = history.find(h => h.id === id);
    if (session) {
      setMessages(session.messages);
      setSessionId(id);
    }
  };

  const startNewSession = () => {
    setMessages([SYSTEM_PROMPT]);
    setSessionId(Date.now().toString());
    setInput('');
  };

  const deleteSession = (id) => {
    setHistory(prev => {
      const newHistory = prev.filter(h => h.id !== id);
      localStorage.setItem(`edulens_history_${user.id}`, JSON.stringify(newHistory));
      return newHistory;
    });
    if (sessionId === id) {
      startNewSession();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert("Please upload a PDF file.");
      return;
    }

    setLoadingStatus(`Analyzing document: ${file.name}...`);
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await axios.post(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const extractedText = uploadRes.data.text;
      
      await handleSendMessage(`Please analyze this course content from my PDF:\n\n${extractedText}`, true, file.name);
    } catch (error) {
      console.error("PDF upload failed:", error);
      alert("Failed to parse PDF.");
      setIsLoading(false);
    }
    
    e.target.value = null;
  };

  const handleExtractPage = async () => {
    if (window.chrome && chrome.tabs) {
      setLoadingStatus("Extracting page content...");
      setIsLoading(true);
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              // Get innerText of the main body
              return document.body.innerText;
            }
          });
          
          if (results && results[0] && results[0].result) {
            const text = results[0].result.substring(0, 5000); // Limit size
            await handleSendMessage(`Please analyze this course content from the page "${tab.title}":\n\n${text}`, true, "Current Page");
          }
        }
      } catch (err) {
        console.error("Failed to extract page content:", err);
        alert("Failed to extract page content.");
        setIsLoading(false);
      }
    } else {
      alert("This feature is only available when running as a Chrome Extension.");
    }
  };


  const handleSendMessage = async (textToSend, skipInputCheck = false, fileName = null) => {
    const query = textToSend || input;
    if (!skipInputCheck && (!query.trim() || isLoading)) return;

    if (!isLoading) {
      if (query.toLowerCase().includes('mcq') || query.toLowerCase().includes('quiz')) setLoadingStatus("Generating adaptive assessment...");
      else if (query.includes('http')) setLoadingStatus("Scraping and analyzing URL...");
      else setLoadingStatus("EduLens is thinking...");
    }

    const userMessage = { role: "user", content: query, fileName: fileName };
    const newChatHistory = [...messages, userMessage];

    setMessages(newChatHistory);
    if (!skipInputCheck) setInput('');
    setIsLoading(true);

    try {
      const apiMessages = newChatHistory.map(({ role, content }) => ({ role, content }));
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/api/chat`, { messages: apiMessages });
      
      setMessages((prev) => [...prev, { role: "assistant", content: response.data.content }]);
    } catch (error) {
      console.error("Error connecting to server:", error);
      setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ Failed to connect to backend." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const activeMessages = messages.filter(msg => msg.role !== 'system');
  const isChatStarted = activeMessages.length > 0;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuth(null);
    navigate('/login');
  };

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex font-sans selection:bg-primary-500/30 transition-colors duration-300">
      <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

      {/* SIDEBAR */}
      <aside className="w-64 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 hidden md:flex flex-col justify-between p-4 transition-colors duration-300 shadow-sm z-20 relative">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-8 px-2 mt-2 shrink-0">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition cursor-pointer">
              <BookOpen className="w-6 h-6 text-primary-600 dark:text-primary-500" />
              <span className="font-bold text-zinc-900 dark:text-white tracking-wide text-lg">EduLens</span>
            </Link>
          </div>

          <nav className="space-y-1.5 flex-1 overflow-y-auto pr-1 scrollbar-thin">
            <button onClick={startNewSession} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition shadow-sm mb-4 shrink-0">
              <span className="text-lg leading-none">+</span> New Analysis
            </button>
            <button onClick={() => setShowHistory(false)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition shrink-0 ${!showHistory ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200'}`}>
              <LayoutDashboard className="w-4 h-4" /> Current Session
            </button>
            <button onClick={() => setShowHistory(true)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition shrink-0 ${showHistory ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200'}`}>
              <History className="w-4 h-4" /> History
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200 text-sm font-medium transition shrink-0" onClick={() => fileInputRef.current.click()}>
              <Upload className="w-4 h-4" /> Upload Course
            </button>

            {/* History List */}
            {showHistory && (
              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
                <p className="px-3 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Previous</p>
                {history.length === 0 ? (
                  <p className="px-3 text-xs text-zinc-400 italic">No history yet</p>
                ) : (
                  history.map(h => (
                    <div key={h.id} className="flex items-center gap-1">
                      <button
                        onClick={() => { loadSession(h.id); setShowHistory(false); }}
                        className={`flex-1 text-left truncate px-3 py-2 rounded-lg text-sm transition ${sessionId === h.id ? 'bg-primary-50/50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/80'}`}
                      >
                        {h.title}
                      </button>
                      <button 
                        onClick={() => deleteSession(h.id)}
                        className="p-2 text-zinc-400 hover:text-red-500 transition rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Delete chat"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </nav>
        </div>

        <div>
          <div className="px-3 mb-4">
            <div className="bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-3 flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold text-xs uppercase shadow-sm">
                 {user?.username?.[0] || 'U'}
               </div>
               <div className="flex flex-col">
                 <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-200 truncate max-w-[100px]">{user?.username}</span>
                 <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[100px]">{user?.email}</span>
               </div>
            </div>
          </div>
          
          <nav className="flex flex-col gap-1.5 px-3 pb-2">
            <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition" title="Toggle theme">
              {isDark ? (
                <><Sun className="w-4 h-4" /> Light Mode</>
              ) : (
                <><Moon className="w-4 h-4" /> Dark Mode</>
              )}
            </button>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition" title="Log out">
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </nav>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
        
        {/* Mobile Header */}
        <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-10 md:hidden shadow-sm">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition cursor-pointer">
            <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-500" />
            <span className="font-bold text-sm tracking-wide text-zinc-900 dark:text-zinc-100">EduLens</span>
          </Link>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg transition" title="Toggle theme">
              {isDark ? <><Sun className="w-3.5 h-3.5" /> Light</> : <><Moon className="w-3.5 h-3.5" /> Dark</>}
            </button>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 px-2.5 py-1.5 rounded-lg transition ml-1" title="Log out">
              <LogOut className="w-3.5 h-3.5" /> Exit
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative overflow-hidden h-full">
          {!isChatStarted ? (
            <div className="flex-1 flex flex-col items-center justify-center overflow-y-auto w-full pt-10 pb-20">
              <div className="flex items-center gap-3.5 mb-6 text-center">
                <BookOpen className="w-10 h-10 text-primary-600 dark:text-primary-500" />
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  {greeting}, {user?.username}
                </h1>
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 mb-10 max-w-lg text-center leading-relaxed text-lg">
                Paste your raw syllabus, a course URL, or upload a PDF. EduLens will instantly generate a structured roadmap.
              </p>

              <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xl focus-within:border-primary-500 dark:focus-within:border-primary-500 transition-colors duration-300">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Paste your syllabus, topic list, or course URL here..."
                  rows={4}
                  className="w-full bg-transparent resize-none outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 text-base leading-relaxed"
                />
                <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800/60 mt-2">
                  <div className="flex items-center gap-2">
                    <button 
                      type="button" onClick={() => fileInputRef.current.click()}
                      className="p-2 text-zinc-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-zinc-800 rounded-lg transition" title="Upload PDF Syllabus"
                    >
                      <Upload className="w-5 h-5" />
                    </button>
                    {window.chrome && window.chrome.tabs && (
                      <button 
                        type="button" onClick={handleExtractPage}
                        className="px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition border border-zinc-200 dark:border-zinc-700"
                      >
                        Analyze Current Tab
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim() || isLoading}
                    className="px-5 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium transition flex items-center gap-2 shadow-sm"
                  >
                    Analyze Content
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
                <span className="text-xs text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-semibold">Try an example:</span>
                {[
                  { label: 'OS Syllabus', prompt: 'Analyze this OS syllabus: 1. Process Management 2. Memory Management (Paging, Segmentation) 3. File Systems 4. Deadlocks.' },
                  { label: 'Generate Roadmap', prompt: 'Generate an 8-week structured roadmap for learning Machine Learning.' }
                ].map((pill, i) => (
                  <button
                    key={i} onClick={() => handleSendMessage(pill.prompt)}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-primary-500 dark:hover:border-primary-500 text-sm px-4 py-1.5 rounded-full transition shadow-sm"
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between py-6 overflow-hidden h-full">
              <div className="space-y-12 overflow-y-auto pb-10 pr-2 scrollbar-thin h-full">
                {activeMessages.map((msg, idx) => {
                  const isLatestMessage = idx === activeMessages.length - 1;
                  
                  // --- Robust UI Extraction ---
                  const analysisData = msg.role === 'assistant' ? extractSafeJSON(msg.content, 'ui_analysis') : null;
                  const mcqData = msg.role === 'assistant' ? extractSafeJSON(msg.content, 'ui_mcq') : null;
                  
                  let displayContent = msg.content;
                  if (analysisData) {
                    displayContent = displayContent.replace(/<ui_analysis>[\s\S]*?<\/ui_analysis>/i, '').trim();
                    if (!msg.content.includes('<ui_analysis>')) displayContent = displayContent.replace(/```json[\s\S]*?```/i, '').replace(/\{[\s\S]*\}/, '').trim();
                  }
                  if (mcqData) {
                    displayContent = displayContent.replace(/<ui_mcq>[\s\S]*?<\/ui_mcq>/i, '').trim();
                    if (!msg.content.includes('<ui_mcq>')) displayContent = displayContent.replace(/```json[\s\S]*?```/i, '').replace(/\{[\s\S]*\}/, '').trim();
                  }

                  return (
                    <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500 mb-8`}>
                      
                      {/* ASSISTANT AVATAR */}
                      {msg.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/50 border border-primary-200 dark:border-primary-800 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0 mt-1 shadow-sm">
                          <BookOpen className="w-4 h-4" />
                        </div>
                      )}
                      
                      <div className={`max-w-[90%] w-full ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                        
                        {/* USER MESSAGE */}
                        {msg.role === 'user' && (
                          <div className="flex flex-col items-end gap-2 max-w-[85%]">
                            {msg.fileName ? (
                              <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-sm rounded-2xl px-4 py-3 flex items-center gap-3">
                                <div className="bg-blue-50 dark:bg-primary-500/10 p-2 rounded-xl">
                                  <BookOpen className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="text-zinc-900 dark:text-zinc-100 text-sm font-semibold truncate max-w-[200px] md:max-w-[300px]">{msg.fileName}</span>
                                  <span className="text-zinc-500 dark:text-zinc-400 text-xs">Uploaded Document</span>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-primary-600 text-white shadow-sm rounded-2xl rounded-tr-sm px-5 py-3 text-[15px] inline-block whitespace-pre-wrap leading-relaxed">
                                {msg.content}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ASSISTANT MESSAGE */}
                        {msg.role === 'assistant' && (
                          <div className="w-full flex flex-col gap-3">
                          
                          {/* Markdown Text */}
                          {displayContent && (
                            <div className="text-base md:text-lg leading-relaxed text-zinc-700 dark:text-zinc-300 prose dark:prose-invert max-w-none prose-p:my-4 prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100 prose-headings:font-bold prose-a:text-primary-600 dark:prose-a:text-primary-400 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                            </div>
                          )}

                          {/* Interactive MCQ Block */}
                          {mcqData && (
                            <MCQBlock 
                              mcqData={mcqData} 
                              onAnswerSubmit={handleSendMessage} 
                              isDisabled={!isLatestMessage || isLoading} 
                            />
                          )}
                          
                          {/* Structured Analysis / Roadmap Card */}
                          {analysisData && (
                            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl mt-8">
                              {/* Header Area */}
                              <div className="bg-zinc-50 dark:bg-zinc-900/50 px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                  <h2 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white">
                                    {analysisData.course_title || "Course Roadmap"}
                                  </h2>
                                  <div className="flex flex-wrap gap-3 mt-3 text-xs font-semibold uppercase tracking-wider">
                                    <span className="text-zinc-600 dark:text-zinc-400 bg-zinc-200 dark:bg-zinc-800 px-3 py-1 rounded-md">Total Est: {analysisData.total_estimated_hours || analysisData.estimated_hours || 0} hrs</span>
                                    {analysisData.difficulty_level && (
                                      <span className="text-white bg-primary-600 px-3 py-1 rounded-md">
                                        {analysisData.difficulty_level}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Warning: Missing Prerequisites */}
                              {analysisData.missing_prerequisites && analysisData.missing_prerequisites.length > 0 && (
                                <div className="px-6 py-4 bg-orange-50 dark:bg-orange-500/10 border-b border-orange-200 dark:border-orange-500/20 flex gap-3 items-start">
                                  <span className="text-orange-600 dark:text-orange-400 mt-0.5">⚠️</span>
                                  <div>
                                    <h4 className="text-orange-700 dark:text-orange-400 text-sm font-bold uppercase tracking-wider mb-1">Missing Prerequisites detected</h4>
                                    <p className="text-orange-800 dark:text-orange-200 text-sm leading-relaxed">Assumes prior knowledge of: 
                                      <span className="font-bold"> {analysisData.missing_prerequisites.join(', ')}</span>.
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* RENDER DYNAMICALLY: ROADMAP FORMAT */}
                              {analysisData.roadmap && (
                                <div className="p-6 md:p-8 space-y-6">
                                  {analysisData.roadmap.map((rm, i) => (
                                    <div key={i} className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/50 rounded-xl p-5 md:p-6 shadow-sm">
                                      <div className="flex justify-between items-center mb-5 border-b border-zinc-200 dark:border-zinc-700/50 pb-4">
                                        <h3 className="text-zinc-900 dark:text-zinc-100 font-bold text-lg md:text-xl">Week {rm.week}: {rm.module}</h3>
                                        <span className="text-xs text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/50 px-3 py-1 rounded-full font-bold">{rm.estimated_hours}h</span>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div>
                                          <h4 className="text-xs font-black text-zinc-500 uppercase mb-3 tracking-widest">Objectives</h4>
                                          <ul className="text-sm md:text-base text-zinc-700 dark:text-zinc-300 list-disc list-outside ml-4 space-y-2">
                                            {rm.objectives?.map((obj, idx) => <li key={idx} className="leading-snug">{obj}</li>)}
                                          </ul>
                                        </div>
                                        <div>
                                          <h4 className="text-xs font-black text-zinc-500 uppercase mb-3 tracking-widest">Activities</h4>
                                          <ul className="text-sm md:text-base text-zinc-700 dark:text-zinc-300 list-disc list-outside ml-4 space-y-2">
                                            {rm.activities?.map((act, idx) => <li key={idx} className="leading-snug">{act}</li>)}
                                          </ul>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* RENDER DYNAMICALLY: MODULE FORMAT */}
                              {analysisData.modules && (
                                <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {analysisData.modules.map((mod, i) => (
                                    <div key={i} onClick={() => handleSendMessage(`Let's dive deeper into ${mod.title}`)} className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/50 rounded-xl p-5 md:p-6 shadow-sm hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-md transition cursor-pointer group">
                                      <div className="flex justify-between items-start mb-4">
                                        <h3 className="text-zinc-900 dark:text-zinc-100 font-bold text-lg group-hover:text-primary-600 dark:group-hover:text-primary-400 transition leading-tight">Module {mod.id || i+1}: {mod.title}</h3>
                                        <span className="text-xs text-primary-700 dark:text-primary-300 bg-primary-100 dark:bg-primary-900/50 px-2.5 py-1 rounded-full font-bold">{mod.estimated_hours}h</span>
                                      </div>
                                      <ul className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 list-disc list-inside space-y-2 line-clamp-4">
                                        {mod.topics?.map((t, idx) => <li key={idx} className="leading-snug">{t}</li>)}
                                      </ul>
                                      <div className="mt-5 text-sm font-bold text-primary-600 dark:text-primary-400 opacity-0 group-hover:opacity-100 transition flex items-center gap-2">
                                        Click to dive deeper <ArrowRight className="w-4 h-4" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                            </div>
                          )}

                        </div>
                      )}
                      </div>
                    </div>
                  );
                })}

                {isLoading && (
                  <div className="flex gap-4 items-center">
                    <BookOpen className="w-6 h-6 text-primary-600 dark:text-primary-500 animate-pulse" />
                    <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-3 bg-white dark:bg-zinc-900 px-5 py-3 rounded-full border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <span className="inline-block w-2 h-2 rounded-full bg-primary-500 animate-ping" />
                      {loadingStatus}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 shadow-xl focus-within:border-primary-500 dark:focus-within:border-primary-500 transition-colors flex items-center gap-3 shrink-0 mb-4 z-10">
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => fileInputRef.current.click()} className="p-2 text-zinc-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-zinc-800 rounded-xl transition">
                    <Upload className="w-5 h-5" />
                  </button>
                  {window.chrome && window.chrome.tabs && (
                    <button 
                      type="button" onClick={handleExtractPage}
                      className="px-2 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition border border-zinc-200 dark:border-zinc-700"
                      title="Analyze Current Tab"
                    >
                      Analyze Tab
                    </button>
                  )}
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question, request an MCQ, or upload a PDF..."
                  rows={1}
                  className="w-full bg-transparent resize-none outline-none text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 text-base leading-relaxed pt-1.5"
                />
                <button onClick={() => handleSendMessage()} disabled={!input.trim() || isLoading} className="shrink-0 w-10 h-10 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center text-white transition self-end shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" /></svg>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Dark mode state
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center text-primary-600 dark:text-primary-500">Loading...</div>;
  }

  return (
    <Routes>
      <Route 
        path="/" 
        element={<Home user={user} />} 
      />
      <Route 
        path="/analyzer" 
        element={user ? <Analyzer user={user} setAuth={setUser} toggleTheme={toggleTheme} isDark={isDark} /> : <Navigate to="/login" />} 
      />
      <Route 
        path="/login" 
        element={!user ? <Login setAuth={setUser} /> : <Navigate to="/analyzer" />} 
      />
      <Route 
        path="/signup" 
        element={!user ? <Signup setAuth={setUser} /> : <Navigate to="/analyzer" />} 
      />
    </Routes>
  );
}

export default App;