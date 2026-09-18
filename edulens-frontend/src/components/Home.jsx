import { Link } from 'react-router-dom';
import { BookOpen, Zap, Shield, ArrowRight } from 'lucide-react';

export function Home({ user }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
      
      {/* Navbar */}
      <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-50 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary-600 dark:text-primary-500" />
            <span className="font-bold text-xl tracking-tight">EduLens</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <Link to="/analyzer" className="text-sm font-medium hover:text-primary-600 transition">Go to Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-medium hover:text-primary-600 transition hidden sm:block">Log in</Link>
                <Link to="/signup" className="text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition shadow-sm">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-20 md:py-32 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 text-sm font-medium mb-8">
          <Zap className="w-4 h-4" /> AI-Powered Learning
        </div>
        
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight max-w-4xl leading-tight mb-6 text-zinc-900 dark:text-white">
          Transform raw syllabi into <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-blue-400">structured knowledge.</span>
        </h1>
        
        <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mb-10 leading-relaxed">
          Upload any course PDF, paste a syllabus, or share a link. EduLens instantly generates interactive roadmaps, extracts prerequisites, and builds custom quizzes.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link to={user ? "/analyzer" : "/signup"} className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-3.5 rounded-xl font-medium transition shadow-lg shadow-primary-600/20 text-lg">
            Start Analyzing <ArrowRight className="w-5 h-5" />
          </Link>
          {!user && (
            <Link to="/login" className="flex items-center justify-center gap-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-8 py-3.5 rounded-xl font-medium transition text-lg">
              Sign In
            </Link>
          )}
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl mt-32 text-left">
          {[
            { icon: BookOpen, title: "Smart Extraction", desc: "Instantly convert unstructured PDFs and links into clean, organized curriculum roadmaps." },
            { icon: Shield, title: "Prerequisite Mapping", desc: "Automatically identify knowledge gaps and missing foundational concepts before you start." },
            { icon: Zap, title: "Adaptive Assessments", desc: "Test your knowledge dynamically with AI-generated multiple choice questions." }
          ].map((f, i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 rounded-2xl shadow-sm hover:shadow-md transition">
              <div className="bg-primary-50 dark:bg-primary-500/10 w-12 h-12 flex items-center justify-center rounded-xl mb-6">
                <f.icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="text-xl font-bold mb-3 dark:text-white">{f.title}</h3>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

    </div>
  );
}
