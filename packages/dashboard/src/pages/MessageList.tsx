import { useMemo, useState } from 'react';
import { useMessages } from '@/hooks/useMessages';
import { useBots } from '@/hooks/useBots';
import { MessageCard } from '@/components/MessageCard';
import { MessageType } from '@/lib/types';

const typeFilters: { label: string; value: MessageType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Direct Message', value: 'direct_message' },
  { label: 'Task Notification', value: 'task_notification' },
  { label: 'Broadcast', value: 'broadcast' },
  { label: 'System', value: 'system' },
];

export function MessageList() {
  const [typeFilter, setTypeFilter] = useState<MessageType | 'all'>('all');
  const { data: messages = [], isLoading, error, refetch } = useMessages();
  const { data: bots = [] } = useBots();

  const botMap = useMemo(() => {
    const map = new Map<string, { name: string; avatarColor?: string; avatarUrl?: string }>();
    for (const bot of bots) {
      map.set(bot.id, { name: bot.name, avatarColor: bot.avatarColor, avatarUrl: bot.avatarUrl });
    }
    return map;
  }, [bots]);

  const enrichedMessages = useMemo(
    () =>
      messages.map((msg) => {
        const fromBot = botMap.get(msg.fromBotId);
        const toBot = botMap.get(msg.toBotId);
        return {
          ...msg,
          fromBotName: msg.fromBotName || fromBot?.name,
          fromAvatarColor: msg.fromAvatarColor || fromBot?.avatarColor,
          fromAvatarUrl: msg.fromAvatarUrl || fromBot?.avatarUrl,
          toBotName: msg.toBotName || toBot?.name,
          toAvatarColor: msg.toAvatarColor || toBot?.avatarColor,
          toAvatarUrl: msg.toAvatarUrl || toBot?.avatarUrl,
        };
      }),
    [messages, botMap],
  );

  const filteredMessages =
    typeFilter === 'all' ? enrichedMessages : enrichedMessages.filter((msg) => msg.type === typeFilter);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-60 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading messages</h3>
          <p className="text-red-600 text-sm mt-1">{(error as Error).message}</p>
          <button
            onClick={() => refetch()}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Messages</h2>
          <p className="text-gray-600 mt-1">
            {filteredMessages.length} of {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="mb-6 flex gap-2 flex-wrap">
        {typeFilters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setTypeFilter(filter.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              typeFilter === filter.value
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {filteredMessages.length === 0 ? (
        <div className="empty-state">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          <p className="text-gray-500 text-lg font-medium">No messages found</p>
          <p className="text-gray-400 text-sm mt-1">
            {typeFilter !== 'all'
              ? `No ${typeFilter} messages`
              : 'Messages will appear here when bots communicate'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredMessages.map((msg) => (
            <MessageCard key={msg.messageId} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}
