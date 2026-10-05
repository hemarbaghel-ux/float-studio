import React, { useState, useEffect, useRef } from 'react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useAuthStore } from '../../store/authStore';
import { useConsentStore } from '../../store/consentStore';
import { useIntegrationStore, RepositoryItem } from '../../store/integrationStore';
import { IntegrationSetupModal } from '../integrations/IntegrationSetupModal';
import { launchOAuthFlow, ActiveOAuthSession } from '../../lib/oauthPopup';
import { User, Users, Check, Github, Gitlab, Shield, Lock, EyeOff, Loader2, AlertCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FloatLogo } from '../../components/FloatLogo';

export function OnboardingFlow() {
  const [step, setStep] = useState(1);
  const [showLearnMore, setShowLearnMore] = useState(false);
  const { 
    setOnboarded, 
    accountType, setAccountType, 
    role, setRole,
    dataSharing, setDataSharing
  } = useOnboardingStore();

  const { updateConsent, isSaving, error: consentError, clearError } = useConsentStore();
  const { connections, getAuthUrl, getRepositories, fetchIntegrations } = useIntegrationStore();
  const { user } = useAuthStore();

  const [connectingProvider, setConnectingProvider] = useState<'github' | 'gitlab' | null>(null);
  const [setupModalProvider, setSetupModalProvider] = useState<'github' | 'gitlab' | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [connectedProvider, setConnectedProvider] = useState<'github' | 'gitlab' | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<RepositoryItem[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const activeSessionRef = useRef<ActiveOAuthSession | null>(null);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  // Clean up any pending OAuth popup polling/listeners on unmount
  useEffect(() => {
    return () => {
      if (activeSessionRef.current) {
        activeSessionRef.current.cancel();
        activeSessionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const ghConn = connections.find(c => c.provider === 'github' && c.status === 'connected');
    const glConn = connections.find(c => c.provider === 'gitlab' && c.status === 'connected');
    if (ghConn) {
      setConnectedProvider('github');
      setConnectedAccount(ghConn.accountName || 'GitHub User');
    } else if (glConn) {
      setConnectedProvider('gitlab');
      setConnectedAccount(glConn.accountName || 'GitLab User');
    }
  }, [connections]);

  const handleConnect = async (provider: 'github' | 'gitlab') => {
    // Prevent duplicate clicks if already connecting
    if (connectingProvider) return;

    // Cancel any previous pending session
    if (activeSessionRef.current) {
      activeSessionRef.current.cancel();
      activeSessionRef.current = null;
    }

    setOauthError(null);
    setConnectingProvider(provider);

    try {
      const authData = await getAuthUrl(provider);

      if (!authData.configured || !authData.authUrl) {
        setConnectingProvider(null);
        setSetupModalProvider(provider);
        return;
      }

      activeSessionRef.current = launchOAuthFlow({
        authUrl: authData.authUrl,
        provider,
        onSuccess: async (data) => {
          setConnectingProvider(null);
          setConnectedProvider(data.provider);
          setConnectedAccount(data.accountName || (data.provider === 'github' ? 'GitHub User' : 'GitLab User'));
          setOauthError(null);

          // Fetch real repositories from provider
          setLoadingRepos(true);
          const repoRes = await getRepositories(data.provider);
          setLoadingRepos(false);
          if (repoRes.success) {
            setRepositories(repoRes.repositories);
          }

          fetchIntegrations();
        },
        onCancelled: (msg) => {
          setConnectingProvider(null);
          setOauthError(msg);
        },
        onError: (err) => {
          setConnectingProvider(null);
          setOauthError(err);
        },
        onTimeout: (msg) => {
          setConnectingProvider(null);
          setOauthError(msg);
        },
        onBlocked: (msg) => {
          setConnectingProvider(null);
          setOauthError(msg);
        }
      });
    } catch (err: any) {
      setConnectingProvider(null);
      setOauthError(err.message || 'Failed to start authorization flow');
    }
  };

  const handleConsentContinue = async (chosenValue: boolean) => {
    clearError();
    setDataSharing(chosenValue);
    const success = await updateConsent(chosenValue, 'onboarding');
    if (success) {
      setStep(4);
    }
  };

  const handleComplete = () => {
    setOnboarded(true, user?.uid);
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white flex flex-col items-center justify-center font-sans">
      {step === 1 && (
        <div className="max-w-2xl w-full px-6 flex flex-col items-center">
          <FloatLogo className="w-12 h-12 mb-6" />
          <h1 className="text-2xl font-semibold mb-8">Set up your FLOAT account</h1>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-8">
            <button 
              onClick={() => setAccountType('personal')}
              className={cn(
                "p-4 rounded-xl border text-left flex flex-col gap-2 transition-all",
                accountType === 'personal' 
                  ? "border-white/20 bg-white/5" 
                  : "border-white/5 bg-transparent hover:border-white/10"
              )}
            >
              <User size={20} className="mb-4" />
              <div className="font-medium text-[15px]">Just for me</div>
              <div className="text-sm text-[#A1A1AA]">Personal usage and individual settings</div>
            </button>
            <button 
              onClick={() => setAccountType('team')}
              className={cn(
                "p-4 rounded-xl border text-left flex flex-col gap-2 transition-all",
                accountType === 'team' 
                  ? "border-white/20 bg-white/5" 
                  : "border-white/5 bg-transparent hover:border-white/10"
              )}
            >
              <Users size={20} className="mb-4" />
              <div className="font-medium text-[15px]">For my team</div>
              <div className="text-sm text-[#A1A1AA]">Collaboration features and shared context</div>
            </button>
          </div>

          <div className="w-full">
            <div className="text-sm mb-4">Which role best describes you?</div>
            <div className="flex flex-wrap gap-2 mb-12">
              {['Software Engineer', 'Designer', 'Product Manager', 'Researcher', 'Data', 'Educator', 'Student', 'Marketer', 'Operations', 'Other...'].map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn(
                    "px-4 py-2 rounded-lg border text-sm transition-colors",
                    role === r 
                      ? "border-white/30 bg-white/10 text-white" 
                      : "border-white/10 bg-transparent text-[#A1A1AA] hover:border-white/20 hover:text-white"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full flex flex-col gap-4">
            <button 
              onClick={() => setStep(2)}
              className="w-full py-3 bg-[#1E1E1E] hover:bg-[#2A2A2A] text-white rounded-lg font-medium transition-colors border border-white/10"
            >
              Set up Individual Plan
            </button>
            <button 
              onClick={() => setStep(2)}
              className="w-full py-3 text-[#A1A1AA] hover:text-white transition-colors text-sm"
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="max-w-md w-full px-6 flex flex-col items-center text-center">
          <FloatLogo className="w-14 h-14 mb-6" />
          <h1 className="text-2xl font-semibold mb-3">Continue with the Start plan</h1>
          <p className="text-[#A1A1AA] text-sm mb-8">Begin using FLOAT with the Start plan. You can cancel at any time.</p>
          
          <button 
            onClick={() => setStep(3)}
            className="w-full py-3 bg-white text-black hover:bg-white/90 rounded-lg font-medium transition-colors mb-4"
          >
            Continue
          </button>
          <button 
            onClick={() => setStep(3)}
            className="w-full py-3 text-[#A1A1AA] hover:text-white transition-colors text-sm mb-16"
          >
            Skip for now
          </button>
          
          <div className="text-xs text-[#A1A1AA] flex flex-col gap-1">
            <span>Signed in as {user?.email || 'your account'}</span>
            <a href="/pricing" className="text-[#3b82f6] hover:underline">View current availability</a>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-xl w-full px-6 flex flex-col items-center">
          <FloatLogo className="w-12 h-12 mb-6" />
          <h1 className="text-xl font-semibold mb-2">Optional diagnostics</h1>
          <p className="text-[#A1A1AA] text-sm mb-6 text-center">Choose whether FLOAT may record optional diagnostic events.</p>

          {/* Real Error Banner if save failed */}
          {consentError && (
            <div className="w-full mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Failed to save consent preference</span>
                <span>{consentError}</span>
              </div>
              <button
                onClick={() => handleConsentContinue(dataSharing)}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-md text-[11px] transition-colors cursor-pointer shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Consent Control Card */}
          <div className="w-full bg-[#161616] border border-white/10 rounded-xl p-5 mb-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-[15px] block">Optional diagnostic logging</span>
                <span className="text-xs text-[#8B949E]">
                  {dataSharing ? 'Enabled for supported diagnostic logging' : 'Disabled'}
                </span>
              </div>

              {/* Functional Toggle (Default OFF) */}
              <button 
                type="button"
                role="switch"
                aria-checked={dataSharing}
                onClick={() => setDataSharing(!dataSharing)}
                disabled={isSaving}
                className={cn(
                  "w-11 h-6 rounded-full relative transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-white/20",
                  dataSharing ? "bg-white" : "bg-[#2A2A2A] border border-white/10"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform",
                  dataSharing ? "translate-x-5 bg-black" : "translate-x-0 bg-[#8B949E]"
                )} />
              </button>
            </div>

            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              The current release does not send optional telemetry to an analytics collector; the preference is stored with your account and only enables diagnostic logging in development. AI requests still send your prompt and attached context through the configured server to the selected provider. Provider data handling depends on that provider's terms and configuration.
            </p>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs text-[#8B949E]">
              <span className="flex items-center gap-1.5">
                <Shield size={13} className="text-emerald-400" />
                <span>Default: OFF</span>
              </span>
              <span>Notice status: Draft</span>
            </div>
          </div>

          {/* Learn More Collapsible Details */}
          <div className="w-full mb-6">
            <button
              type="button"
              onClick={() => setShowLearnMore(!showLearnMore)}
              className="text-xs text-[#8B949E] hover:text-white transition-colors flex items-center gap-1 cursor-pointer mx-auto"
            >
              <span>{showLearnMore ? 'Hide details' : 'About data handling'}</span>
              {showLearnMore ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {showLearnMore && (
              <div className="mt-3 p-4 rounded-xl bg-[#141414] border border-white/10 text-xs text-[#A1A1AA] space-y-3 animate-in fade-in duration-150">
                <div className="space-y-1">
                  <span className="font-semibold text-white block">1. Optional diagnostics</span>
                  <p>An external analytics collector is not configured in this release. The preference gates optional diagnostic logging in development builds; do not treat it as a production analytics control.</p>
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-white block">2. Who processes AI requests?</span>
                  <p>AI requests pass through the configured FLOAT server and then to the selected provider. This preference does not change that processing. Review the provider and deployment terms before sending sensitive information.</p>
                </div>
                <div className="space-y-1">
                  <span className="font-semibold text-white block">3. Can I change my mind later?</span>
                  <p>You can change this preference under Settings → Privacy & Data. The published privacy notice is still a draft.</p>
                </div>
                <div className="pt-2 border-t border-white/5">
                  <a 
                    href="/privacy" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <span>Read data-handling draft</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons: Continue & Decline */}
          <div className="w-full flex flex-col sm:flex-row items-center gap-3 mb-6">
            <button 
              type="button"
              disabled={isSaving}
              onClick={() => handleConsentContinue(dataSharing)}
              className="w-full sm:flex-1 py-2.5 bg-white text-black hover:bg-white/90 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin text-black" />
                  <span>Saving preference...</span>
                </>
              ) : (
                <span>Continue {dataSharing ? 'with Sharing ON' : 'with Sharing OFF'}</span>
              )}
            </button>

            <button 
              type="button"
              disabled={isSaving}
              onClick={() => handleConsentContinue(false)}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#1C1C1C] hover:bg-[#252525] text-[#C9D1D9] hover:text-white border border-white/10 rounded-lg font-medium text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              Decline & Keep OFF
            </button>
          </div>
          
          <div className="text-xs text-[#8B949E] text-center">
            You can always review and withdraw consent at any time in{' '}
            <span className="text-slate-300">Settings</span>.
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="max-w-md w-full px-6 flex flex-col items-center">
          <h1 className="text-2xl font-semibold mb-2 text-center">
            {connectedProvider ? `${connectedProvider === 'github' ? 'GitHub' : 'GitLab'} Connected` : 'Connect GitHub to finish setup'}
          </h1>
          <p className="text-xs text-[#8B949E] text-center mb-6">
            {connectedProvider 
              ? 'Your account has been linked. You can proceed directly or review your repositories.'
              : 'Link your code host to enable AI code indexing, pull request reviews, and automations.'}
          </p>

          {oauthError && (
            <div className="w-full bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 mb-5 flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1">{oauthError}</div>
              <button 
                type="button"
                onClick={() => setOauthError(null)} 
                className="text-xs text-rose-400 hover:text-white cursor-pointer ml-1"
              >
                Dismiss
              </button>
            </div>
          )}

          {connectedProvider ? (
            <div className="w-full flex flex-col gap-4 mb-6">
              {/* Connected Account Card */}
              <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-black border border-white/10 flex items-center justify-center">
                    {connectedProvider === 'github' ? <Github size={20} /> : <Gitlab size={20} className="text-orange-400" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm text-white flex items-center gap-2">
                      <span>{connectedAccount || 'Connected User'}</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                        <Check size={10} /> Active
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8B949E] capitalize">{connectedProvider} OAuth linked</div>
                  </div>
                </div>
              </div>

              {/* Repositories section */}
              <div className="w-full flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-[#8B949E]">
                  <span>Authorized Repositories</span>
                  {loadingRepos && <Loader2 size={12} className="animate-spin text-white" />}
                </div>

                {loadingRepos ? (
                  <div className="py-6 text-center text-xs text-[#8B949E] bg-white/[0.02] border border-white/5 rounded-xl">
                    Loading repositories from {connectedProvider}...
                  </div>
                ) : repositories.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {repositories.map(repo => (
                      <div 
                        key={repo.id}
                        onClick={() => setSelectedRepo(repo.fullName)}
                        className={cn(
                          "p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors",
                          selectedRepo === repo.fullName
                            ? "bg-white/10 border-white/30 text-white"
                            : "bg-white/[0.02] border-white/5 text-[#C9D1D9] hover:bg-white/[0.05]"
                        )}
                      >
                        <div className="flex flex-col truncate">
                          <span className="font-mono text-[11px] font-medium text-white">{repo.fullName}</span>
                          <span className="text-[10px] text-[#8B949E]">{repo.defaultBranch} • {repo.language || 'Code'}</span>
                        </div>
                        <span className="text-[10px] text-[#8B949E] uppercase shrink-0">
                          {repo.private ? 'Private' : 'Public'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-[#8B949E] bg-white/[0.02] border border-white/5 rounded-xl">
                    No repositories found in authorized account.
                  </div>
                )}
              </div>

              {/* Continue button */}
              <button 
                type="button"
                onClick={handleComplete}
                className="w-full py-3 bg-white text-black hover:bg-white/90 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                Continue to FLOAT Workspace
              </button>
            </div>
          ) : (
            <>
              <div className="w-full bg-transparent border border-white/10 rounded-xl p-4 mb-6 flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5 text-xs text-[#C9D1D9]">
                  <Check size={14} className="text-emerald-400 shrink-0" /> 
                  <span>AI agents index codebase context and project structure</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-[#C9D1D9]">
                  <Check size={14} className="text-emerald-400 shrink-0" /> 
                  <span>Automated pull request inspection and code review</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-[#C9D1D9]">
                  <Check size={14} className="text-emerald-400 shrink-0" /> 
                  <span>Requested permissions: profile identity &amp; repo access</span>
                </div>
              </div>

              <button 
                type="button"
                onClick={() => handleConnect('github')}
                disabled={connectingProvider !== null}
                className="w-full py-3 bg-white text-black hover:bg-white/90 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 mb-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connectingProvider === 'github' ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-black" />
                    <span>Authorizing GitHub...</span>
                  </>
                ) : (
                  <>
                    <Github size={18} /> Connect GitHub ↗
                  </>
                )}
              </button>
              
              <button 
                type="button"
                onClick={() => handleConnect('gitlab')}
                disabled={connectingProvider !== null}
                className="w-full py-3 bg-[#1E1E1E] hover:bg-[#2A2A2A] text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 border border-white/10 mb-6 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connectingProvider === 'gitlab' ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-white" />
                    <span>Authorizing GitLab...</span>
                  </>
                ) : (
                  <>
                    <Gitlab size={18} /> Connect GitLab ↗
                  </>
                )}
              </button>

              <button 
                type="button"
                onClick={handleComplete}
                className="w-full py-3 text-[#A1A1AA] hover:text-white transition-colors text-sm cursor-pointer"
              >
                Maybe later
              </button>

              <p className="text-[11px] text-[#6E7681] text-center mt-4">
                You can connect or disconnect GitHub and GitLab at any time in Settings &gt; Integrations.
              </p>
            </>
          )}

          {setupModalProvider && (
            <IntegrationSetupModal 
              provider={setupModalProvider}
              isOpen={true}
              onClose={() => setSetupModalProvider(null)}
              onCheckAgain={() => {
                const prov = setupModalProvider;
                setSetupModalProvider(null);
                handleConnect(prov);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
