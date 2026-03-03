import { useState, useEffect } from 'react';
import { TeamWorkspace } from '@/components/workspace/TeamWorkspace';
import { BotSidebar } from '@/components/workspace/BotSidebar';
import { useBots } from '@/hooks/useBots';

export function TeamPage() {
  const { data: bots = [] } = useBots();
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);

  // Default to first bot once loaded
  useEffect(() => {
    if (!selectedBotId && bots.length > 0) {
      setSelectedBotId(bots[0].id);
    }
  }, [bots, selectedBotId]);

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Team Workspace</h2>
        <p className="text-gray-600 mt-1">
          Overview of bot collaboration and active task connections
        </p>
      </div>

      <div className="flex gap-0" style={{ minHeight: 'calc(100vh - 200px)' }}>
        <div className="flex-1 min-w-0 bg-white rounded-xl p-6 card-gradient">
          <TeamWorkspace onBotSelect={setSelectedBotId} selectedBotId={selectedBotId} />
        </div>
        {selectedBotId && (
          <BotSidebar botId={selectedBotId} onClose={() => setSelectedBotId(null)} />
        )}
      </div>
    </div>
  );
}
