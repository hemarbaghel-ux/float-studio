import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, ShieldAlert, KeyRound, Globe, ArrowRight } from 'lucide-react';
import { IntegrationProvider } from '../../store/integrationStore';

interface IntegrationSetupModalProps {
  provider: IntegrationProvider;
  isOpen: boolean;
  onClose: () => void;
  onCheckAgain?: () => void;
}

export function IntegrationSetupModal({ provider, isOpen, onClose, onCheckAgain }: IntegrationSetupModalProps) {
  const [copiedProd, setCopiedProd] = useState(false);
  const [copiedLocal, setCopiedLocal] = useState(false);
  const [copiedDev, setCopiedDev] = useState(false);

  if (!isOpen) return null;

  const isGitHub = provider === 'github';
  const providerName = isGitHub ? 'GitHub' : 'GitLab';
  
  // Specific domains based on deployment and environment
  const prodUrl = 'https://float-studio.ai.studio';
  const localUrl = 'http://localhost:3000';
  const containerUrl = 'https://ais-dev-xde37vvf4qb6g2edxkejeq-787945699615.asia-southeast1.run.app';

  const prodCallback = `${prodUrl}/api/integrations/${provider}/callback`;
  const localCallback = `${localUrl}/api/integrations/${provider}/callback`;
  const containerCallback = `${containerUrl}/api/integrations/${provider}/callback`;

  const devSettingsUrl = isGitHub
    ? 'https://github.com/settings/developers'
    : 'https://gitlab.com/-/profile/applications';

  const copyToClipboard = (text: string, type: 'prod' | 'local' | 'dev') => {
    navigator.clipboard.writeText(text);
    if (type === 'prod') {
      setCopiedProd(true);
      setTimeout(() => setCopiedProd(false), 2000);
    } else if (type === 'local') {
      setCopiedLocal(true);
      setTimeout(() => setCopiedLocal(false), 2000);
    } else {
      setCopiedDev(true);
      setTimeout(() => setCopiedDev(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-xl bg-[#141414] border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-6 text-white max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400">
              <KeyRound size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Configure {providerName} OAuth</h2>
              <p className="text-xs text-[#A1A1AA]">Required server environment variables are not yet detected</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-[#8B949E] hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-200/90 leading-relaxed">
          <ShieldAlert size={18} className="shrink-0 text-amber-400 mt-0.5" />
          <div>
            FLOAT uses real OAuth with official {providerName} APIs. No mock data or fake connection states are permitted. To connect, register an OAuth application and provide your credentials.
          </div>
        </div>

        <div className="space-y-4 text-xs">
          {/* Step 1 */}
          <div className="flex flex-col gap-1.5">
            <div className="font-medium text-white flex items-center justify-between">
              <span>Step 1: Open {providerName} Developer Portal</span>
              <a 
                href={devSettingsUrl} 
                target="_blank" 
                rel="noreferrer"
                className="text-[#60A5FA] hover:underline flex items-center gap-1 text-[11px]"
              >
                Open {providerName} Settings <ExternalLink size={12} />
              </a>
            </div>
            <p className="text-[#8B949E]">
              {isGitHub 
                ? 'Go to GitHub Settings → Developer settings → OAuth Apps → New OAuth App.' 
                : 'Go to GitLab User Settings → Applications → Add new application.'}
            </p>
          </div>

          {/* Step 2 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-white">Step 2: Add Authorization Callback URL</span>
              {isGitHub && (
                <span className="text-[10px] text-amber-400 font-medium">Single callback per app</span>
              )}
            </div>
            <p className="text-[#8B949E]">
              Enter the exact Authorization callback URL in your {providerName} app settings (no trailing slash):
            </p>
            
            <div className="space-y-2">
              <div className="bg-[#0A0A0A] border border-emerald-500/30 rounded-lg p-2.5 flex items-center justify-between gap-2">
                <div className="truncate font-mono text-[11px] text-[#E6EDF3]">
                  <span className="text-emerald-400 font-semibold mr-2">Production:</span>
                  {prodCallback}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(prodCallback, 'prod')}
                  className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0 border border-emerald-500/30"
                >
                  {copiedProd ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copiedProd ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="bg-[#0A0A0A] border border-white/10 rounded-lg p-2.5 flex items-center justify-between gap-2">
                <div className="truncate font-mono text-[11px] text-[#E6EDF3]">
                  <span className="text-[#8B949E] mr-2">Local Dev:</span>
                  {localCallback}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(localCallback, 'local')}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] text-white flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                >
                  {copiedLocal ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  <span>{copiedLocal ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="bg-[#0A0A0A] border border-white/10 rounded-lg p-2.5 flex items-center justify-between gap-2">
                <div className="truncate font-mono text-[11px] text-[#E6EDF3]">
                  <span className="text-[#8B949E] mr-2">Preview Container:</span>
                  {containerCallback}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(containerCallback, 'dev')}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] text-white flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                >
                  {copiedDev ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  <span>{copiedDev ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex flex-col gap-2">
            <span className="font-medium text-white">Step 3: Set Environment Variables in AI Studio</span>
            <p className="text-[#8B949E]">Copy the Client ID and Client Secret generated by {providerName} and add them:</p>
            <div className="bg-[#0A0A0A] border border-white/10 rounded-lg p-3 font-mono text-[11px] text-[#E6EDF3] space-y-1">
              <div>{isGitHub ? 'GITHUB_CLIENT_ID' : 'GITLAB_CLIENT_ID'}="&lt;your_client_id&gt;"</div>
              <div>{isGitHub ? 'GITHUB_CLIENT_SECRET' : 'GITLAB_CLIENT_SECRET'}="&lt;your_client_secret&gt;"</div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-white">Step 4: Scopes Requested</span>
            <p className="text-[#8B949E]">
              {isGitHub 
                ? 'FLOAT requests `read:user` (identity) and `repo` (code context and PR reviews).' 
                : 'FLOAT requests `read_user` (identity) and `read_repository` (reading code for workspace context).'}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#A1A1AA] hover:text-white transition-colors cursor-pointer"
          >
            Close / Maybe Later
          </button>
          {onCheckAgain && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onCheckAgain();
              }}
              className="px-4 py-2 text-xs font-medium bg-white text-black hover:bg-white/90 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>Try Connecting Again</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
