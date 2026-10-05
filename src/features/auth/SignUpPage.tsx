import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, googleProvider, githubProvider } from '../../lib/firebase';
import { useIDEStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { 
  X, 
  Loader2, 
  ArrowLeft, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';
import { FloatAuthHeroEmblem } from './FloatAuthHeroEmblem';
import { FloatTaskFlowPreview } from './FloatTaskFlowPreview';
import { FloatPrinciplesCarousel } from './FloatPrinciplesCarousel';

export interface SignUpPageProps {
  initialMode?: 'signup' | 'signin' | 'reset';
  onClose?: () => void;
  isModal?: boolean;
  returnTo?: string;
}

export function SignUpPage({ initialMode = 'signup', onClose, isModal = false, returnTo }: SignUpPageProps) {
  const [mode, setMode] = useState<'signup' | 'signin' | 'reset'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [brandHovered, setBrandHovered] = useState(false);

  const { startSession } = useIDEStore();

  const navigateAfterAuth = () => {
    const destination = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
    window.history.pushState({}, '', destination);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    try {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '/';
      }
    } catch {
      window.location.href = '/';
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  const handleProviderLogin = async (provider: any) => {
    try {
      setLoading(true);
      setError('');
      setSuccessMsg('');
      const cred = await signInWithPopup(auth, provider);
      if (cred?.user) {
        useAuthStore.getState().setUser(cred.user);
      }
      setAuthSuccess(true);
      startSession();

      setTimeout(() => {
        if (onClose) {
          onClose();
        } else {
          navigateAfterAuth();
        }
      }, 150);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Sign-in popup was closed before completing.');
      } else if (err?.code === 'auth/account-exists-with-different-credential') {
        setError('An account already exists with the same email using a different sign-in method.');
      } else {
        setError(err?.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode === 'reset') {
      try {
        setLoading(true);
        await sendPasswordResetEmail(auth, trimmedEmail);
        setSuccessMsg(`Password recovery link sent to ${trimmedEmail}. Please check your inbox.`);
      } catch (err: any) {
        if (err?.code === 'auth/user-not-found') {
          setError('No account found with this email address.');
        } else if (err?.code === 'auth/too-many-requests') {
          setError('Too many requests. Please wait a moment before trying again.');
        } else {
          setError(err?.message || 'Failed to send password recovery email.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      let cred;
      if (mode === 'signup') {
        cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      } else {
        cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }
      
      if (cred?.user) {
        useAuthStore.getState().setUser(cred.user);
      }
      setAuthSuccess(true);
      startSession();

      setTimeout(() => {
        if (onClose) {
          onClose();
        } else {
          navigateAfterAuth();
        }
      }, 150);
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Try signing in instead.');
      } else if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        setError('Incorrect email or password. Please verify your credentials.');
      } else if (err?.code === 'auth/user-not-found') {
        setError('No account found with this email. Create one to get started.');
      } else if (err?.code === 'auth/weak-password') {
        setError('Password must be at least 6 characters long.');
      } else if (err?.code === 'auth/too-many-requests') {
        setError('Too many unsuccessful attempts. Please try again in a few moments.');
      } else {
        setError(err?.message || 'Authentication failed. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: 'signup' | 'signin' | 'reset') => {
    setMode(newMode);
    setError('');
    setSuccessMsg('');
    if (!isModal) {
      try {
        let newPath = '/sign-in';
        if (newMode === 'signup') newPath = '/sign-up';
        window.history.pushState({}, '', newPath);
      } catch {
        // Safe fallback in restricted environments
      }
    }
  };

  return (
    <div 
      className={`${isModal ? 'fixed inset-0 z-50 overflow-y-auto' : 'relative'} min-h-screen bg-[#0B0B09] text-white flex flex-col lg:flex-row selection:bg-blue-500/20 selection:text-white`}
      style={{ backgroundColor: '#0B0B09' }}
    >
      {/* ======================================================== */}
      {/* PRIMARY ZONE: AUTHENTICATION FORM                        */}
      {/* ======================================================== */}
      <div className="w-full lg:w-[480px] xl:w-[520px] shrink-0 min-h-screen flex flex-col justify-between p-6 sm:p-10 lg:p-12 xl:p-14 bg-[#0D0D0B] border-r border-white/[0.06] relative z-20">
        
        {/* Top Navigation Bar */}
        <div className="w-full flex items-center justify-between">
          <a 
            href="/" 
            onClick={(e) => {
              if (isModal && onClose) {
                e.preventDefault();
                onClose();
              }
            }}
            onMouseEnter={() => setBrandHovered(true)}
            onMouseLeave={() => setBrandHovered(false)}
            className="flex items-center gap-2.5 opacity-90 hover:opacity-100 transition-opacity focus:outline-none focus:ring-1 focus:ring-white/20 rounded cursor-pointer"
            aria-label="FLOAT Home"
          >
            <FloatLogo className="w-6 h-6" animated trigger={brandHovered} />
            <FloatWordmark className="h-4 text-white" />
          </a>

          <button
            onClick={handleClose}
            type="button"
            aria-label="Close"
            title="Close"
            id="auth-page-close-button"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-white/30"
          >
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>

        {/* Main Authentication Content */}
        <div className="w-full max-w-sm mx-auto my-auto py-8">
          
          {/* Mobile-only compact animated emblem header */}
          <div className="lg:hidden flex items-center gap-2 mb-6 text-xs text-blue-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>FLOAT WORKSPACE ACCESS</span>
          </div>

          {/* Form Header Titles */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-[26px] font-semibold tracking-tight text-white leading-tight">
              {mode === 'signup' && "Make room for ambitious builds."}
              {mode === 'signin' && "Pick up where your ideas left off."}
              {mode === 'reset' && "Reset your workspace access."}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
              {mode === 'signup' && "Create your FLOAT account to explore repositories, collaborate with autonomous agents, and write code."}
              {mode === 'signin' && "Sign in to continue your projects, work with your AI models, and keep your development moving."}
              {mode === 'reset' && "Enter the email address associated with your FLOAT account and we'll send you a password recovery link."}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div 
              role="alert" 
              className="mb-5 p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 leading-relaxed"
            >
              <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div 
              role="status" 
              className="mb-5 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5 leading-relaxed"
            >
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Social Provider Buttons (Omit on password reset mode) */}
          {mode !== 'reset' && (
            <>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full mb-6">
                {/* Google OAuth Button */}
                <button
                  type="button"
                  onClick={() => handleProviderLogin(googleProvider)}
                  disabled={loading}
                  aria-label={mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
                  className="w-full flex-1 h-10 px-3.5 flex items-center justify-center gap-2.5 rounded-lg bg-[#161614] hover:bg-[#1E1E1B] active:bg-[#252522] border border-white/10 hover:border-white/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Google</span>
                </button>

                {/* GitHub OAuth Button */}
                <button
                  type="button"
                  onClick={() => handleProviderLogin(githubProvider)}
                  disabled={loading}
                  aria-label={mode === 'signup' ? 'Sign up with GitHub' : 'Sign in with GitHub'}
                  className="w-full flex-1 h-10 px-3.5 flex items-center justify-center gap-2.5 rounded-lg bg-[#161614] hover:bg-[#1E1E1B] active:bg-[#252522] border border-white/10 hover:border-white/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span>GitHub</span>
                </button>
              </div>

              {/* Divider */}
              <div className="relative flex items-center justify-center my-6">
                <div className="w-full border-t border-white/[0.08]" />
                <span className="bg-[#0D0D0B] px-3 text-[11px] font-mono text-slate-500 uppercase tracking-wider shrink-0">
                  or continue with email
                </span>
              </div>
            </>
          )}

          {/* Form */}
          <form onSubmit={handleAuthSubmit} noValidate className="space-y-4">
            
            {/* Email Field */}
            <div>
              <label 
                htmlFor="auth-email-input" 
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <input
                  id="auth-email-input"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="developer@domain.com"
                  disabled={loading}
                  required
                  className="w-full h-11 px-3.5 rounded-lg bg-[#141412] border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/80 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                />
              </div>
            </div>

            {/* Password Field (Only for signin and signup) */}
            {mode !== 'reset' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label 
                    htmlFor="auth-password-input" 
                    className="block text-xs font-medium text-slate-300"
                  >
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => switchMode('reset')}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    id="auth-password-input"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Create password (min 6 characters)' : 'Enter your password'}
                    disabled={loading}
                    required
                    className="w-full h-11 pl-3.5 pr-10 rounded-lg bg-[#141412] border border-white/10 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500/80 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {mode === 'signup' && (
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Must be at least 6 characters
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-6 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>
                  {mode === 'signup' && 'Create FLOAT account'}
                  {mode === 'signin' && 'Sign in to FLOAT'}
                  {mode === 'reset' && 'Send password recovery link'}
                </span>
              )}
            </button>
          </form>

          {/* Mode Switchers */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] text-center text-xs text-slate-400">
            {mode === 'signup' && (
              <p>
                Already have a FLOAT account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-white hover:text-blue-400 font-medium transition-colors cursor-pointer underline underline-offset-4"
                >
                  Sign in
                </button>
              </p>
            )}

            {mode === 'signin' && (
              <p>
                Don&apos;t have an account yet?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="text-white hover:text-blue-400 font-medium transition-colors cursor-pointer underline underline-offset-4"
                >
                  Create one now
                </button>
              </p>
            )}

            {mode === 'reset' && (
              <p>
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-white hover:text-blue-400 font-medium transition-colors cursor-pointer underline underline-offset-4"
                >
                  Return to sign in
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Footer Links */}
        <footer className="w-full pt-6 text-center text-[11px] text-slate-500">
          <a 
            href="/terms"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/terms');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }} 
            className="hover:text-slate-300 transition-colors"
          >
            Terms of Service
          </a>
          <span className="mx-2 text-slate-700">·</span>
          <a 
            href="/privacy"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/privacy');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }} 
            className="hover:text-slate-300 transition-colors"
          >
            Privacy Policy
          </a>
        </footer>
      </div>

      {/* ======================================================== */}
      {/* SECONDARY ZONE: FLOAT BRAND EXPERIENCE (Desktop / Tablet) */}
      {/* ======================================================== */}
      <div className="hidden lg:flex flex-1 min-h-screen bg-[#070705] flex-col items-center justify-between p-10 xl:p-14 relative overflow-hidden select-none border-l border-white/[0.06]">
        {/* Subtle technical background grid texture */}
        <div 
          className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff04_1px,transparent_1px),linear-gradient(to_bottom,#ffffff04_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" 
          aria-hidden="true"
        />

        {/* Ambient top-right cool-blue illumination */}
        <div 
          className="absolute -top-24 right-1/4 w-[500px] h-[350px] bg-gradient-to-b from-blue-600/12 via-blue-500/5 to-transparent rounded-full blur-3xl pointer-events-none" 
          aria-hidden="true"
        />

        {/* Top Brand Status Header */}
        <div className="relative z-10 w-full flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="uppercase tracking-widest text-slate-400 font-semibold">FLOAT AI Developer Platform</span>
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            v0.9.4 · Production
          </div>
        </div>

        {/* Center Visual: Emblem + Task Flow Demonstration */}
        <div className="relative z-10 flex flex-col items-center my-auto py-6 space-y-8 w-full max-w-md">
          {/* Animated FLOAT Hero Emblem */}
          <FloatAuthHeroEmblem size={190} isSuccess={authSuccess} />

          {/* Illustrative Task Flow Preview */}
          <FloatTaskFlowPreview />
        </div>

        {/* Bottom Carousel: Rotating Engineering Principles */}
        <div className="relative z-10 w-full flex justify-center pt-5 border-t border-white/[0.04]">
          <FloatPrinciplesCarousel />
        </div>
      </div>
    </div>
  );
}
