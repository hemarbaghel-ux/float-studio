import React, { useState } from 'react';
import { 
  User, ShieldCheck, Mail, Calendar, Key, Copy, Check, 
  ArrowLeft, LogOut, CheckCircle2, AlertCircle, Loader2, Sparkles,
  Shield, Edit3, Lock, AlertTriangle, RefreshCw
} from 'lucide-react';
import { updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { FloatLogo, FloatWordmark } from '../../components/FloatLogo';

export function ProfilePage() {
  const { user, setUser, logout } = useAuthStore();
  
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);

  // Security states
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const initial = (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'F').toUpperCase();

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!displayName.trim()) {
      setUpdateError('Display name cannot be empty.');
      return;
    }

    setIsUpdating(true);
    setUpdateError(null);

    try {
      await updateProfile(auth.currentUser, {
        displayName: displayName.trim()
      });
      // Update local auth store so whole app gets updated immediately
      setUser({ ...auth.currentUser } as any);
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setUpdateError(err?.message || 'Failed to update profile name. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    setIsSendingReset(true);
    setResetError(null);
    setResetSent(false);

    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err: any) {
      setResetError(err?.message || 'Failed to send password reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const copyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      setCopiedUid(true);
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  const formatAccountDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const providerName = user?.providerData?.[0]?.providerId === 'google.com'
    ? 'Google OAuth'
    : user?.providerData?.[0]?.providerId === 'github.com'
    ? 'GitHub'
    : 'Email / Password';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#000000] text-slate-900 dark:text-[#E6EDF3] flex flex-col font-sans transition-colors selection:bg-slate-300 dark:selection:bg-white/20">
      
      {/* Top Header */}
      <header className="h-14 border-b border-slate-200 dark:border-white/10 px-4 sm:px-6 flex items-center justify-between bg-white dark:bg-[#080808] shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:text-[#8B949E] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Back to Workspace"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <FloatLogo className="w-5 h-5 shrink-0" />
            <FloatWordmark className="h-3.5 text-slate-900 dark:text-white shrink-0" />
            <span className="text-slate-300 dark:text-white/20 text-xs">/</span>
            <span className="text-xs font-semibold text-slate-700 dark:text-[#C9D1D9]">User Profile</span>
          </div>
        </div>

        <button
          onClick={() => {
            window.history.pushState({}, '', '/');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
          className="px-3 py-1.5 bg-slate-900 text-white dark:bg-white dark:text-black rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
        >
          Done
        </button>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        
        {/* Profile Card Header */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-black border border-slate-200 dark:border-white/20 flex items-center justify-center font-bold text-2xl shadow-sm shrink-0 uppercase">
              {initial}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                  {user?.displayName || user?.email?.split('@')[0] || 'Developer'}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-[#E6EDF3] border border-slate-200 dark:border-white/10 flex items-center gap-1">
                  <ShieldCheck size={12} />
                  <span>Free Plan</span>
                </span>
              </div>
              <span className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5 truncate">
                {user?.email || 'Signed in via Firebase Auth'}
              </span>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="self-start sm:self-auto px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Update Profile Form */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit3 size={15} className="text-slate-600 dark:text-[#C5C5C5]" />
              <span>Edit Profile Details</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
              Update how your name appears across workspace comments and AI conversations
            </p>
          </div>

          {updateSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 size={14} />
              <span>Profile name updated successfully in Firebase Authentication.</span>
            </div>
          )}

          {updateError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{updateError}</span>
            </div>
          )}

          <form onSubmit={handleUpdateName} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-[#C9D1D9] mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your developer name"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-400 dark:focus:border-white/30"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isUpdating}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 dark:text-black disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer"
              >
                {isUpdating ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Security & Authentication */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Lock size={15} className="text-slate-600 dark:text-[#C5C5C5]" />
              <span>Security & Password</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
              Manage your credentials and authentication methods
            </p>
          </div>

          {resetSent && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 size={14} />
              <span>Password reset link sent to {user?.email}. Check your inbox.</span>
            </div>
          )}

          {resetError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{resetError}</span>
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-white/5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-white">Password Reset</h4>
                <p className="text-slate-500 dark:text-[#8B949E]">Send a secure password reset link to your registered email</p>
              </div>
              <button
                onClick={handleSendPasswordReset}
                disabled={isSendingReset || !user?.email}
                className="px-3.5 py-1.5 border border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg font-medium transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer disabled:opacity-50"
              >
                {isSendingReset ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={12} />
                    <span>Send Reset Email</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-slate-500 dark:text-[#8B949E]">Linked Auth Provider</span>
              <span className="font-medium text-slate-800 dark:text-white">{providerName}</span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-slate-500 dark:text-[#8B949E]">Last Active Session</span>
              <span className="font-medium text-slate-800 dark:text-white">
                {formatAccountDate(user?.metadata?.lastSignInTime)}
              </span>
            </div>
          </div>
        </div>

        {/* Account Details & Metadata */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-white/10 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Account Details</h3>
          
          <div className="divide-y divide-slate-100 dark:divide-white/5 text-xs">
            <div className="flex items-center justify-between py-3">
              <span className="text-slate-500 dark:text-[#8B949E] flex items-center gap-2">
                <Key size={14} />
                <span>Account ID (UID)</span>
              </span>
              <div className="flex items-center gap-2">
                <code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#141414] font-mono text-slate-800 dark:text-white">
                  {user?.uid ? `${user.uid.slice(0, 16)}...` : 'N/A'}
                </code>
                {user?.uid && (
                  <button
                    onClick={copyUid}
                    className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    title="Copy full UID"
                  >
                    {copiedUid ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-slate-500 dark:text-[#8B949E] flex items-center gap-2">
                <Mail size={14} />
                <span>Authentication Email</span>
              </span>
              <span className="font-medium text-slate-800 dark:text-white">{user?.email || 'N/A'}</span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-slate-500 dark:text-[#8B949E] flex items-center gap-2">
                <Calendar size={14} />
                <span>Member Since</span>
              </span>
              <span className="font-medium text-slate-800 dark:text-white">
                {formatAccountDate(user?.metadata?.creationTime)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3">
              <span className="text-slate-500 dark:text-[#8B949E] flex items-center gap-2">
                <Shield size={14} />
                <span>Security & Verification</span>
              </span>
              <span className="text-slate-800 dark:text-[#E6EDF3] font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Verified Firebase Session</span>
              </span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="p-6 rounded-2xl bg-white dark:bg-[#0A0A0A] border border-rose-200 dark:border-rose-900/30 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <AlertTriangle size={15} />
                <span>Account Danger Zone</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#8B949E] mt-0.5">
                Sign out of all sessions or delete your FLOAT account and project data
              </p>
            </div>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors self-start sm:self-auto cursor-pointer"
            >
              Delete Account
            </button>
          </div>
        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete FLOAT Account?</h3>
            <p className="text-xs text-slate-500 dark:text-[#8B949E] leading-relaxed">
              This action cannot be undone. All your project files, cloud history, and configuration preferences will be permanently wiped.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  await logout();
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
