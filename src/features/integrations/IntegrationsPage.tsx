import React, { useEffect, useState, useRef } from 'react';
import { useIntegrationStore, INTEGRATION_REGISTRY, IntegrationCategory, IntegrationProvider } from '../../store/integrationStore';
import { Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { IntegrationCard } from './IntegrationCard';
import { IntegrationSetupModal } from './IntegrationSetupModal';
import { launchOAuthFlow, ActiveOAuthSession } from '../../lib/oauthPopup';

export function IntegrationsPage() {
  const { 
    configuredProviders, 
    connections, 
    loading, 
    fetchIntegrations, 
    getAuthUrl, 
    disconnect 
  } = useIntegrationStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<IntegrationCategory | 'All' | 'Connected' | 'Not Connected'>('All');
  const [setupProvider, setSetupProvider] = useState<IntegrationProvider | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<IntegrationProvider | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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

  const handleConnect = async (provider: IntegrationProvider) => {
    // Prevent duplicate attempts if already connecting
    if (connectingProvider) return;

    // Cancel any previous pending session
    if (activeSessionRef.current) {
      activeSessionRef.current.cancel();
      activeSessionRef.current = null;
    }

    setStatusMessage(null);
    setConnectingProvider(provider);

    try {
      const authData = await getAuthUrl(provider);

      if (!authData.configured || !authData.authUrl) {
        setConnectingProvider(null);
        setSetupProvider(provider);
        return;
      }

      if (provider === 'github' || provider === 'gitlab') {
        activeSessionRef.current = launchOAuthFlow({
          authUrl: authData.authUrl,
          provider,
          onSuccess: (data) => {
            setConnectingProvider(null);
            setStatusMessage({
              type: 'success',
              message: `Successfully connected ${data.provider.toUpperCase()} account${data.accountName ? ` (@${data.accountName})` : ''}!`
            });
            fetchIntegrations();
          },
          onCancelled: (msg) => {
            setConnectingProvider(null);
            setStatusMessage({
              type: 'error',
              message: msg
            });
          },
          onError: (err) => {
            setConnectingProvider(null);
            setStatusMessage({
              type: 'error',
              message: err
            });
          },
          onTimeout: (msg) => {
            setConnectingProvider(null);
            setStatusMessage({
              type: 'error',
              message: msg
            });
          },
          onBlocked: (msg) => {
            setConnectingProvider(null);
            setStatusMessage({
              type: 'error',
              message: msg
            });
          }
        });
      } else {
        // Fallback for non-git integrations if implemented
        setConnectingProvider(null);
        window.open(authData.authUrl, 'oauth_popup', 'width=600,height=720');
      }
    } catch (err: any) {
      setConnectingProvider(null);
      setStatusMessage({
        type: 'error',
        message: err.message || 'Failed to initialize authorization flow'
      });
    }
  };

  const filteredIntegrations = INTEGRATION_REGISTRY.filter(def => {
    if (searchTerm && !def.name.toLowerCase().includes(searchTerm.toLowerCase()) && !def.description.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    const isConnected = connections.some(c => c.provider === def.id && c.status === 'connected');
    
    if (filter === 'Connected' && !isConnected) return false;
    if (filter === 'Not Connected' && isConnected) return false;
    if (filter !== 'All' && filter !== 'Connected' && filter !== 'Not Connected' && def.category !== filter) return false;

    return true;
  });

  const categories = Array.from(new Set(filteredIntegrations.map(d => d.category)));

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 pt-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">Integrations</h1>
        <p className="text-slate-500 dark:text-[#A1A1AA] max-w-3xl">
          Connect GitHub or GitLab when OAuth credentials are configured for this deployment. Additional integrations are not available in this release.
        </p>
      </div>

      {statusMessage && (
        <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{statusMessage.message}</span>
          </div>
          <button 
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-white/10 pb-4">
        <div className="relative w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search integrations..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {['All', 'Connected', 'Not Connected', 'Code Hosting', 'Communication', 'Project Management', 'Monitoring'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                filter === f 
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-black' 
                  : 'bg-white dark:bg-[#111111] text-slate-600 dark:text-[#A1A1AA] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 dark:text-[#A1A1AA]">Loading integrations...</div>
      ) : filteredIntegrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-slate-500 dark:text-[#A1A1AA] text-lg mb-2">No integrations found</p>
          <p className="text-sm text-slate-400 dark:text-[#8B949E]">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {categories.map(category => (
            <div key={category} className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/5 pb-2">
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredIntegrations.filter(def => def.category === category).map(def => {
                  const connection = connections.find(c => c.provider === def.id);
                  const isConfigured = configuredProviders.includes(def.id);
                  return (
                    <IntegrationCard 
                      key={def.id} 
                      definition={def} 
                      connection={connection} 
                      isConfigured={isConfigured}
                      isConnecting={connectingProvider === def.id}
                      onConnect={() => handleConnect(def.id)}
                      onConfigure={() => setSetupProvider(def.id)}
                      onDisconnect={() => connection && disconnect(connection.id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Setup Guide Modal */}
      {setupProvider && (
        <IntegrationSetupModal 
          provider={setupProvider}
          isOpen={true}
          onClose={() => setSetupProvider(null)}
          onCheckAgain={() => {
            const p = setupProvider;
            setSetupProvider(null);
            handleConnect(p);
          }}
        />
      )}
    </div>
  );
}
