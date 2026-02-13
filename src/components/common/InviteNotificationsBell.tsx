'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface InviteNotification {
  id: string;
  projectId: string;
  projectName: string;
  role: string;
  type?: string;
  createdAt: string;
  isUnread: boolean;
  message: string;
  link?: string | null;
}

interface InviteNotificationsResponse {
  unreadCount: number;
  notifications: InviteNotification[];
}

interface InviteNotificationsBellProps {
  className?: string;
}

const MAX_BADGE_COUNT = 9;

export default function InviteNotificationsBell({ className = '' }: InviteNotificationsBellProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [notificationActionId, setNotificationActionId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<InviteNotification[]>([]);
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await fetch('/api/notifications/invites', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as Partial<InviteNotificationsResponse> & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load notifications');
      }

      setUnreadCount(typeof payload.unreadCount === 'number' ? payload.unreadCount : 0);
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const removeNotificationLocally = (notificationId: string) => {
    setNotifications((previous) => {
      const target = previous.find((item) => item.id === notificationId);
      const next = previous.filter((item) => item.id !== notificationId);
      if (target?.isUnread) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }
      return next;
    });
  };

  const deleteSingleNotification = async (notificationId: string) => {
    if (notificationActionId || isDeletingAll) {
      return false;
    }

    try {
      setNotificationActionId(notificationId);
      setError('');
      const response = await fetch(`/api/notifications/invites/${notificationId}`, {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete notification');
      }
      removeNotificationLocally(notificationId);
      return true;
    } catch (deleteError) {
      setError((deleteError as Error).message);
      return false;
    } finally {
      setNotificationActionId(null);
    }
  };

  const handleOpenNotification = async (notification: InviteNotification) => {
    const deleted = await deleteSingleNotification(notification.id);
    if (!deleted) {
      return;
    }

    if (notification.link) {
      setIsOpen(false);
      router.push(notification.link);
      router.refresh();
    }
  };

  const handleDeleteAllNotifications = async () => {
    if (isDeletingAll || notificationActionId) {
      return;
    }

    try {
      setIsDeletingAll(true);
      setError('');
      const response = await fetch('/api/notifications/invites', {
        method: 'DELETE',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete notifications');
      }
      setNotifications([]);
      setUnreadCount(0);
    } catch (deleteError) {
      setError((deleteError as Error).message);
    } finally {
      setIsDeletingAll(false);
    }
  };

  useEffect(() => {
    void fetchNotifications();
    const intervalHandle = window.setInterval(() => {
      void fetchNotifications();
    }, 30000);

    return () => {
      window.clearInterval(intervalHandle);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!containerRef.current || containerRef.current.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const badgeLabel = useMemo(() => {
    if (unreadCount <= MAX_BADGE_COUNT) {
      return `${unreadCount}`;
    }
    return `${MAX_BADGE_COUNT}+`;
  }, [unreadCount]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (nextOpen) {
            void fetchNotifications();
          }
        }}
        className="rounded-lg border border-slate-600 bg-slate-700/80 p-2 text-slate-300 transition-colors hover:bg-slate-600 hover:text-white"
        aria-label="Notifications"
        title="Notifications"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.85 17.5a3 3 0 0 1-5.7 0m9.15-2.5H5.7c1.2-1.12 1.8-2.9 1.8-5.32V8.5a4.5 4.5 0 1 1 9 0v1.18c0 2.43.6 4.2 1.8 5.32Z"
          />
        </svg>
      </button>

      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border border-red-300/50 bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
          {badgeLabel}
        </span>
      ) : null}

      {isOpen ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <div className="flex items-center gap-2">
              {isLoading ? <span className="text-[11px] text-slate-400">Refreshing...</span> : null}
              <button
                type="button"
                onClick={() => void handleDeleteAllNotifications()}
                disabled={isDeletingAll || notifications.length === 0 || Boolean(notificationActionId)}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingAll ? 'Deleting...' : 'Delete all'}
              </button>
            </div>
          </div>

          {error ? (
            <p className="rounded border border-red-600/40 bg-red-900/20 p-2 text-xs text-red-200">{error}</p>
          ) : notifications.length === 0 ? (
            <p className="rounded border border-slate-700 bg-slate-800/60 p-2 text-xs text-slate-400">
              No notifications.
            </p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {notifications.map((notification) => {
                const isBusy = notificationActionId === notification.id || isDeletingAll;
                return (
                  <div
                    key={notification.id}
                    className={`rounded border p-2 text-xs ${
                      notification.isUnread
                        ? 'border-red-500/40 bg-red-900/15'
                        : 'border-slate-700 bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => void handleOpenNotification(notification)}
                        disabled={isBusy}
                        className="flex-1 text-left"
                      >
                        <p className="text-slate-100">{notification.message}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteSingleNotification(notification.id);
                        }}
                        disabled={isBusy}
                        className="rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Delete notification"
                        title="Delete notification"
                      >
                        X
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
