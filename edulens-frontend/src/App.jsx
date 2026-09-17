import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
    const match = text.match(regex);
    if (!match) return null;
    
    // Clean potential markdown blocks AI sometimes adds inside tags
    let rawJson = match[1].trim();
    rawJson = rawJson.replace(/^```(json)?/i, '').replace(/```$/i, '').trim();
    
    return JSON.parse(rawJson);
  } catch (e) {
    console.error(`EduLens Debug: Failed to parse <${tag}> JSON.`, e);
    return null;
  }
};

// --- Sub-component for clean MCQ Select UI ---
const MCQBlock = ({ mcqData, onAnswerSubmit, isDisabled }) => {
  const [selected, setSelected] = useState("");

  return (
    <div className="bg-[#1f1f23] border border-zinc-700/60 p-5 rounded-xl shadow-md my-4 max-w-xl">
      <p className="font-semibold text-zinc-100 mb-4 text-[15px]">{mcqData.question}</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={isDisabled}
          className="flex-1 bg-[#2a2a2f] border border-zinc-700/80 text-zinc-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:border-[#d97757] transition disabled:opacity-50 cursor-pointer"
        >
          <option value="" disabled>Select your answer...</option>
          {Object.entries(mcqData.options).map(([key, val]) => (
            <option key={key} value={key}>{key}: {val}</option>
          ))}
        </select>
        <button
          onClick={() => {
            if (selected) onAnswerSubmit(`My answer is ${selected}`);
          }}
          disabled={!selected || isDisabled}
          className="bg-[#d97757] hover:bg-[#c66a4c] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Submit
        </button>
      </div>
    </div>
  );
};


function App() {
  const [messages, setMessages] = useState([SYSTEM_PROMPT]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('EduLens is thinking...');
  const [greeting, setGreeting] = useState('');
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 12) setGreeting('Good morning');
    else if (hour >= 12 && hour < 17) setGreeting('Good afternoon');
    else if (hour >= 17 && hour < 22) setGreeting('Good evening');
    else setGreeting('Good night');
  }, []);

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
      const uploadRes = await axios.post('http://localhost:5001/api/upload', formData, {
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

  const handleSendMessage = async (textToSend, skipInputCheck = false, fileName = null) => {
    const query = textToSend || input;
    if (!skipInputCheck && (!query.trim() || isLoading)) return;

    // Dynamic Contextual Loading State
    if (!isLoading) { // Don't override PDF loading state
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
      const response = await axios.post('http://localhost:5001/api/chat', { messages: apiMessages });
      
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

  return (
    <div className="min-h-screen bg-[#18181b] text-[#ececed] flex flex-col font-sans selection:bg-[#cc6644]/30">
      <input type="file" accept="application/pdf" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

      <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-800/40 bg-[#18181b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="text-[#d97757] font-serif text-2xl font-bold select-none">❖</span>
          <span className="font-medium text-sm tracking-wide text-zinc-200">EduLens Course Analyzer</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-zinc-800/80 text-zinc-400 px-3 py-1 rounded-full border border-zinc-700/50">
            Engine: <span className="text-[#d97757]">gpt-4.1-mini</span>
          </span>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-4xl w-full mx-auto px-4">
        {!isChatStarted ? (
          <div className="flex-1 flex flex-col items-center justify-center -mt-10">
            <div className="flex items-center gap-3.5 mb-6 text-center">
              <span className="text-[#d97757] text-4xl select-none">❖</span>
              <h1 className="text-3xl md:text-4xl font-serif tracking-tight text-zinc-100 font-normal">
                {greeting}, Amritpal
              </h1>
            </div>
            <p className="text-zinc-400 mb-8 max-w-lg text-center leading-relaxed">
              Paste your raw syllabus, a course URL, or upload a PDF. EduLens will automatically extract the hierarchy and map prerequisites.
            </p>

            <div className="w-full max-w-2xl bg-[#222226] border border-zinc-800/80 rounded-2xl p-4 shadow-2xl focus-within:border-zinc-700 transition">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Paste your syllabus, topic list, or course URL here..."
                rows={4}
                className="w-full bg-transparent resize-none outline-none text-zinc-200 placeholder-zinc-600 text-sm leading-relaxed"
              />
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60 mt-2">
                <button 
                  type="button" onClick={() => fileInputRef.current.click()}
                  className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition" title="Upload PDF Syllabus"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                  </svg>
                </button>
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!input.trim() || isLoading}
                  className="px-4 py-1.5 rounded-lg bg-[#d97757] hover:bg-[#c66a4c] disabled:opacity-30 text-white text-sm font-medium transition flex items-center gap-2"
                >
                  Analyze Content
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
              <span className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Try an example:</span>
              {[
                { label: 'OS Syllabus', prompt: 'Analyze this OS syllabus: 1. Process Management 2. Memory Management (Paging, Segmentation) 3. File Systems 4. Deadlocks.' },
                { label: 'Generate Roadmap', prompt: 'Generate an 8-week structured roadmap for learning Machine Learning.' }
              ].map((pill, i) => (
                <button
                  key={i} onClick={() => handleSendMessage(pill.prompt)}
                  className="bg-[#222226]/80 hover:bg-[#2a2a2f] border border-zinc-800 text-zinc-300 text-xs px-3.5 py-1.5 rounded-lg transition"
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between py-6">
            <div className="space-y-8 overflow-y-auto pb-4">
              {activeMessages.map((msg, idx) => {
                const isLatestMessage = idx === activeMessages.length - 1;
                
                // --- Robust UI Extraction ---
                const analysisData = msg.role === 'assistant' ? extractSafeJSON(msg.content, 'ui_analysis') : null;
                const mcqData = msg.role === 'assistant' ? extractSafeJSON(msg.content, 'ui_mcq') : null;
                
                let displayContent = msg.content;
                if (analysisData) displayContent = displayContent.replace(/<ui_analysis>[\s\S]*?<\/ui_analysis>/, '').trim();
                if (mcqData) displayContent = displayContent.replace(/<ui_mcq>[\s\S]*?<\/ui_mcq>/, '').trim();

                return (
                  <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-[#222226] border border-zinc-700/60 flex items-center justify-center text-[#d97757] shrink-0 text-sm mt-1">❖</div>
                    )}
                    
                    <div className={`max-w-[90%] w-full ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                      
                      {/* USER MESSAGE */}
                      {msg.role === 'user' && (
                        <div className="flex flex-col items-end gap-2 max-w-[85%]">
                          {msg.fileName ? (
                            <div className="bg-[#222226] border border-zinc-700/60 shadow-sm rounded-xl px-4 py-3 flex items-center gap-3">
                              <div className="bg-red-500/10 p-2 rounded-lg">
                                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                </svg>
                              </div>
                              <div className="flex flex-col text-left">
                                <span className="text-zinc-200 text-sm font-semibold truncate max-w-[200px]">{msg.fileName}</span>
                                <span className="text-zinc-500 text-xs">PDF Document</span>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-[#2a2a2f] text-zinc-100 border border-zinc-700/50 rounded-2xl px-5 py-3 text-sm inline-block whitespace-pre-wrap">
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
                            <div className="text-[14.5px] leading-relaxed text-zinc-300 prose prose-invert max-w-none prose-p:my-2 prose-headings:text-zinc-100 prose-table:my-4">
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
                            <div className="bg-[#1f1f23] border border-zinc-700/60 rounded-xl overflow-hidden shadow-xl mt-2">
                              {/* Header Area */}
                              <div className="bg-[#26262b] px-6 py-4 border-b border-zinc-700/60 flex justify-between items-start">
                                <div>
                                  <h2 className="text-lg font-bold text-zinc-100">
                                    {analysisData.course_title || "Course Roadmap"}
                                  </h2>
                                  <div className="flex gap-3 mt-2 text-xs font-medium">
                                    <span className="text-zinc-400">Total Est: {analysisData.total_estimated_hours || analysisData.estimated_hours || 0} hrs</span>
                                    {analysisData.difficulty_level && (
                                      <>
                                        <span className="text-zinc-600">•</span>
                                        <span className="px-2 py-0.5 rounded text-zinc-900 bg-zinc-300">
                                          {analysisData.difficulty_level}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Warning: Missing Prerequisites */}
                              {analysisData.missing_prerequisites && analysisData.missing_prerequisites.length > 0 && (
                                <div className="px-6 py-3 bg-[#3f2c27] border-b border-[#5a3a31] flex gap-3 items-start">
                                  <span className="text-[#d97757] mt-0.5">⚠️</span>
                                  <div>
                                    <h4 className="text-[#d97757] text-xs font-bold uppercase tracking-wider mb-1">Missing Prerequisites detected</h4>
                                    <p className="text-zinc-300 text-sm">Assumes prior knowledge of: 
                                      <span className="font-semibold text-zinc-100"> {analysisData.missing_prerequisites.join(', ')}</span>.
                                    </p>
                                  </div>
                                </div>
                              )}

                              {/* RENDER DYNAMICALLY: ROADMAP FORMAT */}
                              {analysisData.roadmap && (
                                <div className="p-6 space-y-4">
                                  {analysisData.roadmap.map((rm, i) => (
                                    <div key={i} className="bg-[#2a2a2f] border border-zinc-700/40 rounded-lg p-5">
                                      <div className="flex justify-between items-start mb-3 border-b border-zinc-700/50 pb-2">
                                        <h3 className="text-zinc-100 font-semibold text-sm">Week {rm.week}: {rm.module}</h3>
                                        <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-1 rounded">{rm.estimated_hours}h</span>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Objectives</h4>
                                          <ul className="text-xs text-zinc-300 list-disc list-inside space-y-1">
                                            {rm.objectives?.map((obj, idx) => <li key={idx}>{obj}</li>)}
                                          </ul>
                                        </div>
                                        <div>
                                          <h4 className="text-[10px] font-bold text-zinc-500 uppercase mb-2">Activities</h4>
                                          <ul className="text-xs text-zinc-300 list-disc list-inside space-y-1">
                                            {rm.activities?.map((act, idx) => <li key={idx}>{act}</li>)}
                                          </ul>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* RENDER DYNAMICALLY: MODULE FORMAT */}
                              {analysisData.modules && (
                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {analysisData.modules.map((mod, i) => (
                                    <div key={i} onClick={() => handleSendMessage(`Let's dive deeper into ${mod.title}`)} className="bg-[#2a2a2f] border border-zinc-700/40 rounded-lg p-4 hover:border-zinc-500 transition cursor-pointer">
                                      <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-zinc-100 font-semibold text-sm">Module {mod.id || i+1}: {mod.title}</h3>
                                        <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-1 rounded">{mod.estimated_hours}h</span>
                                      </div>
                                      <ul className="text-xs text-zinc-400 list-disc list-inside space-y-1">
                                        {mod.topics?.map((t, idx) => <li key={idx}>{t}</li>)}
                                      </ul>
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
                <div className="flex gap-4 items-center pl-1">
                  <div className="w-8 h-8 rounded-full bg-[#222226] border border-zinc-700/60 flex items-center justify-center text-[#d97757] shrink-0 text-sm animate-pulse shadow-md">❖</div>
                  <div className="text-xs text-zinc-400 flex items-center gap-2 bg-[#202024] px-4 py-2.5 rounded-full border border-zinc-800/80">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#d97757] animate-ping" />
                    {loadingStatus}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="sticky bottom-2 w-full bg-[#222226] border border-zinc-800/90 rounded-2xl p-3 shadow-xl focus-within:border-zinc-700 transition flex items-center gap-3">
              <button type="button" onClick={() => fileInputRef.current.click()} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
                </svg>
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question, request an MCQ, or upload a PDF..."
                rows={1}
                className="w-full bg-transparent resize-none outline-none text-zinc-200 placeholder-zinc-500 text-sm leading-relaxed pt-1.5"
              />
              <button onClick={() => handleSendMessage()} disabled={!input.trim() || isLoading} className="shrink-0 w-8 h-8 rounded-full bg-[#d97757] hover:bg-[#c66a4c] disabled:opacity-30 flex items-center justify-center text-white transition self-end">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" /></svg>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;