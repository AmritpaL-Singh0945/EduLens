import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, User, Lock, Mail } from 'lucide-react';

export function Login({ setAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('http://localhost:5001/api/login', { email, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setAuth(res.data.user);
      navigate('/analyzer');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-200 transition-colors duration-300 px-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <Link to="/" className="bg-primary-50 dark:bg-primary-500/10 p-3 rounded-xl mb-4 border border-primary-100 dark:border-primary-500/20 inline-block hover:scale-105 transition-transform">
            <BookOpen className="w-8 h-8 text-primary-600 dark:text-primary-500" />
          </Link>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Welcome Back</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Sign in to continue to EduLens</p>
        </div>

        {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-4">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              </div>
              <input 
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition text-sm text-zinc-900 dark:text-zinc-100"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              </div>
              <input 
                type="password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition text-sm text-zinc-900 dark:text-zinc-100"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit" disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition mt-2 shadow-md shadow-primary-600/20"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-6">
          Don't have an account? <Link to="/signup" className="text-primary-600 dark:text-primary-400 hover:underline font-semibold">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export function Signup({ setAuth }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }
    
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('http://localhost:5001/api/signup', { username, email, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setAuth(res.data.user);
      navigate('/analyzer');
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-200 transition-colors duration-300 py-10 px-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <Link to="/" className="bg-primary-50 dark:bg-primary-500/10 p-3 rounded-xl mb-4 border border-primary-100 dark:border-primary-500/20 inline-block hover:scale-105 transition-transform">
            <BookOpen className="w-8 h-8 text-primary-600 dark:text-primary-500" />
          </Link>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Create an Account</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Join EduLens to start analyzing</p>
        </div>

        {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-4">{error}</div>}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">Username</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              </div>
              <input 
                type="text" required
                value={username} onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition text-sm text-zinc-900 dark:text-zinc-100"
                placeholder="johndoe"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">Email</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              </div>
              <input 
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition text-sm text-zinc-900 dark:text-zinc-100"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              </div>
              <input 
                type="password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition text-sm text-zinc-900 dark:text-zinc-100"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-400 mb-1.5 uppercase tracking-wider">Confirm Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              </div>
              <input 
                type="password" required
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition text-sm text-zinc-900 dark:text-zinc-100"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button 
            type="submit" disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition mt-4 shadow-md shadow-primary-600/20"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-6">
          Already have an account? <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:underline font-semibold">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
