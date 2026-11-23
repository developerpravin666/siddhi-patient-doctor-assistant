import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw,
  Eye,
  Trash2,
  Copy,
  Check,
  X,
  MessageSquare,
  CheckCheck,
  AlertCircle,
  Clock,
  MinusCircle,
  Code2,
  ShieldAlert,
  Bot,
  Inbox,
  Radio
} from 'lucide-react';
import { WebhookEvent } from '../types';
import { getWebhookEvents, deleteWebhookEvent, purgeWebhookEvents } from '../api/client';
import { DataTable, ColumnDef } from '../components/DataTable';
import { SearchableSelect } from '../components/SearchableSelect';
import { useConfirm } from '../context/ConfirmationContext';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'PROCESSED', label: 'PROCESSED (Live Inbound Message)' },
  { value: 'STATUS_UPDATE', label: 'STATUS_UPDATE (Delivery / Read Receipt)' },
  { value: 'DUPLICATE', label: 'DUPLICATE (Idempotent Ignored)' },
  { value: 'SIMULATED', label: 'SIMULATED (Portal Chat)' },
  { value: 'FAILED', label: 'FAILED (Signature / Format Error)' },
  { value: 'IGNORED', label: 'IGNORED (Empty / Non-message)' },
];

const EVENT_TYPE_OPTIONS = [
  { value: '', label: 'All Event Types' },
  { value: 'message_text', label: 'Text Messages (message_text)' },
  { value: 'message_interactive', label: 'Interactive Replies (buttons/lists)' },
  { value: 'status_delivered', label: 'Delivered Receipts (status_delivered)' },
  { value: 'status_read', label: 'Read Receipts (status_read)' },
  { value: 'status_sent', label: 'Sent Receipts (status_sent)' },
  { value: 'simulator_chat', label: 'Simulator Events (simulator_chat)' },
];

export const WebhookEvents: React.FC = () => {
  const confirm = useConfirm();

  // Server-side State
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Controlled Grid Parameters
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortKey, setSortKey] = useState<string | null>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Dropdown Filter States
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');

  // Payload Modal State
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchEvents = useCallback(async (overrides?: {
    search?: string;
    status?: string;
    eventType?: string;
    page?: number;
    pageSize?: number;
    sortKey?: string | null;
    sortDir?: 'asc' | 'desc';
  }) => {
    try {
      setLoading(true);
      const effSearch = overrides?.search !== undefined ? overrides.search : searchTerm;
      const effStatus = overrides?.status !== undefined ? overrides.status : statusFilter;
      const effEventType = overrides?.eventType !== undefined ? overrides.eventType : eventTypeFilter;
      const effPage = overrides?.page !== undefined ? overrides.page : page;
      const effPageSize = overrides?.pageSize !== undefined ? overrides.pageSize : pageSize;
      const effSortKey = overrides?.sortKey !== undefined ? overrides.sortKey : sortKey;
      const effSortDir = overrides?.sortDir !== undefined ? overrides.sortDir : sortDir;

      const res = await getWebhookEvents({
        search: effSearch || undefined,
        status: effStatus || undefined,
        event_type: effEventType || undefined,
        page: effPage,
        page_size: effPageSize,
        sort_by: effSortKey || 'created_at',
        sort_dir: effSortDir,
      });

      setEvents(res.events);
      setTotalCount(res.total);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to load webhook events', 'error');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, eventTypeFilter, page, pageSize, sortKey, sortDir]);

  // Initial and param change fetch
  useEffect(() => {
    fetchEvents();
  }, [page, pageSize, sortKey, sortDir, statusFilter, eventTypeFilter]);

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    setPage(1);
    fetchEvents({ search: term, page: 1 });
  };

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    setPage(1);
    fetchEvents({ status: val, page: 1 });
  };

  const handleEventTypeFilterChange = (val: string) => {
    setEventTypeFilter(val);
    setPage(1);
    fetchEvents({ eventType: val, page: 1 });
  };

  const handleDelete = async (event: WebhookEvent) => {
    const isConfirmed = await confirm({
      title: 'Delete Webhook Event',
      message: `Are you sure you want to delete webhook event ${event.id.slice(0, 8)}...?`,
      confirmText: 'Delete Event',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!isConfirmed) return;

    try {
      await deleteWebhookEvent(event.id);
      showToast('Webhook event deleted successfully');
      fetchEvents();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete webhook event', 'error');
    }
  };

  const handlePurgeAll = async () => {
    const isConfirmed = await confirm({
      title: 'Purge All Webhook Events',
      message: 'This will permanently remove all stored Meta WhatsApp webhook events from the database. Are you sure?',
      confirmText: 'Purge All Events',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!isConfirmed) return;

    try {
      await purgeWebhookEvents();
      showToast('All webhook events purged successfully');
      fetchEvents();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to purge webhook events', 'error');
    }
  };

  const handleCopyPayload = () => {
    if (!selectedEvent?.raw_payload) return;
    navigator.clipboard.writeText(JSON.stringify(selectedEvent.raw_payload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Helper formatting for timestamps
  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PROCESSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            PROCESSED
          </span>
        );
      case 'STATUS_UPDATE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <CheckCheck className="w-3 h-3 text-purple-500" />
            STATUS RECEIPT
          </span>
        );
      case 'DUPLICATE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            DUPLICATE
          </span>
        );
      case 'SIMULATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
            <Bot className="w-3 h-3 text-cyan-600" />
            SIMULATED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="w-3 h-3 text-rose-500" />
            FAILED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <MinusCircle className="w-3 h-3 text-slate-400" />
            {status}
          </span>
        );
    }
  };

  const renderEventTypeBadge = (type: string) => {
    if (type.startsWith('message')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <MessageSquare className="w-3 h-3" />
          {type}
        </span>
      );
    }
    if (type.startsWith('status')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <CheckCheck className="w-3 h-3" />
          {type}
        </span>
      );
    }
    if (type.startsWith('simulator')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
          <Bot className="w-3 h-3" />
          {type}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
        <Inbox className="w-3 h-3 text-slate-400" />
        {type}
      </span>
    );
  };

  const columns: ColumnDef<WebhookEvent>[] = useMemo(() => [
    {
      key: 'created_at',
      header: 'Timestamp',
      sortable: true,
      width: '180px',
      render: (e) => (
        <div className="space-y-0.5">
          <p className="font-semibold text-slate-800 text-xs">{formatDateTime(e.created_at)}</p>
          <span className="text-[10px] text-slate-400 font-mono">ID: {e.id.slice(0, 8)}</span>
        </div>
      )
    },
    {
      key: 'event_type',
      header: 'Event Category',
      sortable: true,
      width: '160px',
      render: (e) => renderEventTypeBadge(e.event_type)
    },
    {
      key: 'sender_phone',
      header: 'Sender Phone / WABA',
      sortable: true,
      width: '170px',
      render: (e) => (
        <div className="space-y-0.5">
          {e.sender_phone ? (
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-800">
              <span>+{e.sender_phone}</span>
            </div>
          ) : (
            <span className="text-slate-400 text-xs italic">System / Anonymous</span>
          )}
          {e.recipient_phone_id && (
            <p className="text-[10px] font-mono text-slate-400">Target ID: {e.recipient_phone_id}</p>
          )}
        </div>
      )
    },
    {
      key: 'message_body',
      header: 'Message Payload / Content',
      render: (e) => (
        <div className="max-w-md">
          {e.message_body ? (
            <p className="text-xs text-slate-700 line-clamp-2 leading-relaxed" title={e.message_body}>
              {e.message_body}
            </p>
          ) : e.error_message ? (
            <p className="text-xs text-rose-600 font-medium line-clamp-1">{e.error_message}</p>
          ) : (
            <span className="text-xs text-slate-400 italic">No text content in event</span>
          )}
          {e.message_id && (
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate" title={e.message_id}>
              wamid: {e.message_id}
            </p>
          )}
        </div>
      )
    },
    {
      key: 'status',
      header: 'Dispatch Status',
      sortable: true,
      width: '140px',
      align: 'center',
      render: (e) => renderStatusBadge(e.status)
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: '110px',
      render: (e) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedEvent(e)}
            className="p-1.5 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition"
            title="Inspect Raw JSON Payload"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(e)}
            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
            title="Delete Event"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ], []);

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCheck className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Meta WhatsApp Webhook Stream</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                Super Admin Only
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live database stream of every incoming Meta Cloud API webhook event, delivery receipt, and diagnostic payload.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchEvents()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handlePurgeAll}
            disabled={loading || totalCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 transition disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            Purge Stream
          </button>
        </div>
      </div>

      {/* Main Server-side Grid */}
      <DataTable<WebhookEvent>
        data={events}
        columns={columns}
        keyExtractor={(e) => e.id}
        loading={loading}
        mode="server"
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        sortKey={sortKey}
        sortDir={sortDir}
        searchTerm={searchTerm}
        onPageChange={setPage}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(1);
        }}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
        }}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search phone, message, event ID, wamid..."
        extraFilters={
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Dropdown Filter */}
            <div className="w-48">
              <SearchableSelect
                size="sm"
                searchable={false}
                value={statusFilter}
                onChange={handleStatusFilterChange}
                options={STATUS_OPTIONS}
                placeholder="All Statuses"
              />
            </div>

            {/* Event Type Dropdown Filter */}
            <div className="w-52">
              <SearchableSelect
                size="sm"
                searchable={false}
                value={eventTypeFilter}
                onChange={handleEventTypeFilterChange}
                options={EVENT_TYPE_OPTIONS}
                placeholder="All Event Types"
              />
            </div>

            {(statusFilter || eventTypeFilter || searchTerm) && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('');
                  setEventTypeFilter('');
                  setSearchTerm('');
                  setPage(1);
                  fetchEvents({ status: '', eventType: '', search: '', page: 1 });
                }}
                className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded-lg hover:bg-rose-50 transition"
              >
                <X className="w-3 h-3" /> Clear Filters
              </button>
            )}
          </div>
        }
      />

      {/* Payload Inspection Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Webhook Event JSON Payload</h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    ID: {selectedEvent.id} • {selectedEvent.event_type}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPayload}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                >
                  {copiedPayload ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPayload ? 'Copied!' : 'Copy JSON'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Metadata Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50/80 border-b border-slate-100 text-xs">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Status</span>
                <div className="mt-0.5">{renderStatusBadge(selectedEvent.status)}</div>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Sender Mobile</span>
                <span className="font-mono text-slate-800 font-semibold">
                  {selectedEvent.sender_phone ? `+${selectedEvent.sender_phone}` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Recipient Phone ID</span>
                <span className="font-mono text-slate-800 font-semibold truncate block">
                  {selectedEvent.recipient_phone_id || 'N/A'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">Timestamp</span>
                <span className="text-slate-700 font-medium block">
                  {formatDateTime(selectedEvent.created_at)}
                </span>
              </div>
            </div>

            {/* Modal Code Body */}
            <div className="p-4 overflow-y-auto flex-1 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed">
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(selectedEvent.raw_payload || {}, null, 2)}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
