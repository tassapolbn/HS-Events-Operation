import { searchEvents, searchRequests } from '../lib/boardSearch';
import { useSearchParams } from 'react-router-dom';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { CalendarDays, CircleHelp, Inbox } from 'lucide-react';
import { boardDepartmentKey, resolveBoardDepartment } from '../lib/boardDepartment';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useDisplayDepartments, useDisplayEvents, useDisplayRequests } from '../hooks/usePublicDisplay';
import { useDisplayLiveUpdates } from '../hooks/useDisplayLiveUpdates';
import { useBoardAnnouncements } from '../hooks/useAnnouncements';
import { AnnouncementBanner } from '../components/announcements/AnnouncementBanner';
import { DayAlertBar } from '../components/calendar/DayAlertBar';
import { calendarFromBoard, todayTomorrowAlerts } from '../lib/calendarDays';
import { schoolToday } from '../lib/archive';
import { useAutoUpdate } from '../hooks/useAutoUpdate';
import { DisplayShell, type DisplayScale, type DisplayTab } from '../components/display/DisplayShell';
import { EventsBoard } from '../components/display/EventsBoard';
import { RequestsBoard } from '../components/display/RequestsBoard';
import { BoardScopeToggle } from '../components/display/BoardScopeToggle';
import { BOARD_SCOPE_KEY, blockIsDone, readBoardScope, requestIsDone, type BoardScope } from '../lib/boardScope';
import { sessionTimeline } from '../lib/sessionTimeline';
import { AttachmentViewer } from '../components/display/AttachmentViewer';
import { EventEditModal } from '../components/display/EventEditModal';
import { TaskEditModal } from '../components/display/TaskEditModal';
import { SessionFormModal } from '../components/events/SessionFormModal';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { useLightModeOnly } from '../contexts/ThemeContext';
import { useLanguage } from '../i18n';
import { CAMPUS_NAMES } from '../lib/constants';
import type { Campus, DisplayDepartment, DisplayEvent, DisplaySession, DisplayTask, EventSession } from '../types';

const SCALE_KEY = 'eventops.display.scale';
const SCALE_FONT: Record<DisplayScale, string> = {
  small: '13px',
  medium: '16px',
  large: '18px',
  xlarge: '21px'
};

type EditTarget =
  | { kind: 'event'; event: DisplayEvent }
  | { kind: 'session'; event: DisplayEvent; session: DisplaySession }
  | { kind: 'task'; event: DisplayEvent; task: DisplayTask };

/** Heading above each panel in the combined department view. */
function PanelHeading({
  icon: Icon,
  title,
  department
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  department: DisplayDepartment | null;
}) {
  const { deptName } = useLanguage();
  const color = department?.color ?? '#1a3c5e';
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        {department && (
          <p className="truncate text-base font-extrabold" style={{ color }}>
            {deptName(department)}
          </p>
        )}
        <h2 className="truncate text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h2>
      </div>
    </div>
  );
}

/** Public display board with Events / Department Requests tabs. No login required. */
export function DisplayBoardPage({
  initialTab = 'events',
  campus
}: {
  initialTab?: DisplayTab;
  campus?: Campus;
}) {
  const { t, lang } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [presenting, setPresenting] = useState(() => searchParams.get('tv') === '1');
  const [showCombinedHint, setShowCombinedHint] = useState(false);
  const restoredDepartment = useRef<string | null>(null);
  useAutoScroll(presenting);
  const exitPresentation = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  const togglePresentation = () => {
    if (presenting) {
      exitPresentation();
      return;
    }
    setEditing(null);
    setPresenting(true);
    try {
      void document.documentElement.requestFullscreen().catch(() => {});
    } catch {
      // Presentation also works in browsers that do not support fullscreen.
    }
  };
  useEffect(() => {
    if (!presenting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitPresentation();
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [presenting, exitPresentation]);
  const requestId = searchParams.get('request') || '';
  const eventId = requestId ? '' : searchParams.get('event') || '';
  const taskId = eventId ? searchParams.get('task') || '' : '';
  const focused = Boolean(requestId || eventId);
  const { isEventsTeam } = useAuth();
  // The board is always read in light, whatever the device or the browser prefers
  useLightModeOnly();
  const [tab, setTab] = useState<DisplayTab>(initialTab);
  const [selectedDept, setSelectedDept] = useState('');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  // Active / Done splits finished work away from work that still has to happen
  const [scope, setScope] = useState<BoardScope>(readBoardScope);
  const [scale, setScale] = useState<DisplayScale>(() => {
    const saved = localStorage.getItem(SCALE_KEY);
    return saved === 'small' || saved === 'large' || saved === 'xlarge' ? saved : 'medium';
  });

  useEffect(() => {
    try {
      localStorage.setItem(BOARD_SCOPE_KEY, scope);
    } catch {
      // Storage can be blocked on a shared display; the choice just lasts this visit
    }
  }, [scope]);

  // Live editing, only ever active for a signed-in events-team member
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const closeEditor = () => setEditing(null);


  // The whole board is sized in rem units, so scaling the root font size
  // scales text, cards, icons, badges and spacing together.
  useEffect(() => {
    document.documentElement.style.fontSize = SCALE_FONT[scale];
    localStorage.setItem(SCALE_KEY, scale);
    return () => {
      document.documentElement.style.fontSize = '';
    };
  }, [scale]);

  // Reload only when the Events team changes something, never on a timer
  const live = useDisplayLiveUpdates(campus);

  // Pick up new releases by itself, but never while someone is editing or searching
  useAutoUpdate(editing !== null || search.trim() !== '');

  // Re-read the clock every 30 seconds so the Active / Done counts follow the
  // time of day even when no new data arrives.
  const [clockTick, setClockTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const { data: departments } = useDisplayDepartments();
  useEffect(() => {
    const key = boardDepartmentKey(campus);
    if (!departments || focused || restoredDepartment.current === key) return;
    restoredDepartment.current = key;
    if (searchParams.has('dept')) {
      const resolved = resolveBoardDepartment(searchParams.get('dept'), departments);
      if (resolved !== null) setSelectedDept(resolved);
      return;
    }
    try {
      const saved = localStorage.getItem(key);
      setSelectedDept(departments.some((dept) => dept.id === saved) ? saved! : '');
    } catch {
      // Storage can be blocked on a shared display.
    }
  }, [departments, focused, campus, searchParams]);
  const announcementsQuery = useBoardAnnouncements(campus);
  const announcements = announcementsQuery.data;
  const rawEventsQuery = useDisplayEvents(campus, eventId);
  const rawRequestsQuery = useDisplayRequests(campus);
  const filteredEvents = useMemo(() => searchEvents(rawEventsQuery.data ?? [], deferredSearch, departments ?? []), [rawEventsQuery.data, deferredSearch, departments]);
  const filteredRequests = useMemo(() => searchRequests(rawRequestsQuery.data ?? [], deferredSearch, departments ?? []), [rawRequestsQuery.data, deferredSearch, departments]);
  const eventsQuery = { ...rawEventsQuery, data: focused ? rawEventsQuery.data : filteredEvents };
  const requestsQuery = { ...rawRequestsQuery, data: focused ? rawRequestsQuery.data : filteredRequests };

  // What is on today and tomorrow, from everything on this board, whatever is searched or chosen
  const boardAlerts = useMemo(() => {
    const { events, sessions } = calendarFromBoard(rawEventsQuery.data ?? []);
    return todayTomorrowAlerts(events, sessions, schoolToday());
    // clockTick moves the bar on to the next day at midnight
  }, [rawEventsQuery.data, clockTick]);

  const departmentList = departments ?? [];
  const active = requestId ? requestsQuery : eventId ? eventsQuery : tab === 'events' ? eventsQuery : requestsQuery;
  const linkedEvent = eventsQuery.data?.find(event => event.id === eventId);
  const linkedRequest = requestsQuery.data?.find(request => request.id === requestId);
  const targetAvailable = requestId ? Boolean(linkedRequest) : Boolean(linkedEvent && (!taskId || linkedEvent.tasks.some(task => task.id === taskId)));
  const exitFocus = () => { setSearchParams({}); setSelectedDept(''); setTab(requestId ? 'requests' : 'events'); setSearch(''); };

  const canEdit = isEventsTeam;
  const boardEditMode = canEdit && !presenting;
  const editProps = {
    editMode: boardEditMode,
    presenting,
    onEditEvent: (event: DisplayEvent) => setEditing({ kind: 'event', event }),
    onEditSession: (event: DisplayEvent, session: DisplaySession) => setEditing({ kind: 'session', event, session }),
    onEditTask: (event: DisplayEvent, task: DisplayTask) => setEditing({ kind: 'task', event, task })
  };

  // Selecting a department shows its event work and its requests side by side,
  // so requests that live on a separate tab are no longer overlooked.
  const combined = Boolean(selectedDept);
  const selectedDepartment = departmentList.find((d) => d.id === selectedDept) ?? null;
  const hasDeptEventWork = (eventsQuery.data ?? []).some((ev) =>
    ev.tasks.some((task) => task.department_id === selectedDept)
  );

  const sessionForModal: EventSession | null =
    editing?.kind === 'session' ? { ...editing.session, event_id: editing.event.id } : null;

  // How much sits on each side of the Active / Done switch right now
  const scopeCounts = (() => {
    const now = Date.now();
    let active = 0;
    let done = 0;
    if (tab === 'events' || combined) {
      for (const entry of sessionTimeline(eventsQuery.data ?? [], selectedDept)) {
        const isDone = blockIsDone(
          entry.block.session,
          entry.block.session?.session_date ?? entry.date,
          entry.block.tasks,
          now
        );
        if (isDone) done += 1;
        else active += 1;
      }
    }
    if (tab === 'requests' || combined) {
      for (const request of requestsQuery.data ?? []) {
        if (selectedDept && request.department_id !== selectedDept) continue;
        if (requestIsDone(request)) done += 1;
        else active += 1;
      }
    }
    return { active, done };
  })();

  const scopeToggle = !presenting && (
    <BoardScopeToggle scope={scope} onChange={setScope} activeCount={scopeCounts.active} doneCount={scopeCounts.done} />
  );

  return (
    <DisplayShell
      tab={requestId ? 'requests' : eventId ? 'events' : tab}
      onTabChange={(next) => { if (focused) setSearchParams({}); setTab(next); }}
      search={search}
      onSearch={(value) => { if (focused) { setTab(requestId ? 'requests' : 'events'); setSearchParams({}); } setSearch(value); }}
      scale={scale}
      onScaleChange={setScale}
      departments={departmentList}
      selectedDepartmentId={focused ? '' : selectedDept}
      onSelectDepartment={(next) => {
        if (focused) setSearchParams({});
        const key = boardDepartmentKey(campus);
        restoredDepartment.current = key;
        setSelectedDept(next);
        try {
          localStorage.setItem(key, next);
        } catch {
          // The choice still applies when storage is unavailable.
        }
      }}
      presenting={presenting}
      onTogglePresentation={togglePresentation}
      onRefresh={() => {
        eventsQuery.refetch();
        requestsQuery.refetch();
        announcementsQuery.refetch();
      }}
      refreshing={active.isFetching}
      updatedAt={active.dataUpdatedAt ? new Date(active.dataUpdatedAt) : null}
      live={live}
      canEdit={canEdit}
      campusName={campus ? CAMPUS_NAMES[campus] : undefined}
    >
      {/* What is on today and tomorrow */}
      {!focused && <DayAlertBar alerts={boardAlerts} size="board" />}
      {/* Today's notices from the Events team */}
      {!focused && (announcements ?? []).length > 0 && (
        <div className="mb-5 space-y-2" data-board-announcements>
          {(announcements ?? []).map((item) => (
            <AnnouncementBanner key={item.id} message={item.message} tone={item.tone} size="board" />
          ))}
        </div>
      )}
      {!presenting && search.trim() && <p role="status" className="mb-4 text-sm text-slate-600">{lang === 'th' ? 'ผลการค้นหาในบอร์ดนี้' : 'Search results on this board'}: “{search}” <button className="ml-2 rounded-lg px-3 py-2 font-semibold text-navy-800 underline" onClick={() => setSearch('')}>{lang === 'th' ? 'ล้างคำค้น' : 'Clear'}</button></p>}
      {active.isError && !focused && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{lang === 'th' ? 'โหลดข้อมูลไม่สำเร็จ กรุณากดรีเฟรช' : 'Could not load work. Please refresh.'}</p>}
      {focused ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-300 bg-gold-50 p-4">
            <p className="font-semibold text-navy-900">{lang === 'th' ? 'งานจากอีเมลแจ้งเตือน' : 'Job from your notification'}</p>
            <button className="rounded-lg bg-navy-900 px-4 py-2 font-semibold text-white" onClick={exitFocus}>{lang === 'th' ? 'ดูงานทั้งหมด' : 'View all work'}</button>
          </div>
          {active.isError ? (
            <p role="alert">{lang === 'th' ? 'โหลดงานไม่สำเร็จ กรุณากดรีเฟรช' : 'Could not load this job. Please refresh.'}</p>
          ) : !active.isLoading && !targetAvailable ? (
            <p role="status" className="rounded-xl border bg-white p-6">{lang === 'th' ? 'งานนี้ไม่แสดงบนบอร์ดแล้ว อาจถูกซ่อน เก็บถาวร หรืออยู่นอกช่วงวันที่แสดง กรุณาติดต่อทีม Events' : 'This job is no longer available on this board. It may be hidden, archived or outside the display period. Please contact the Events Team.'}</p>
          ) : requestId ? (
            <RequestsBoard requests={linkedRequest ? [linkedRequest] : undefined} departments={departmentList} selectedDept="" isLoading={requestsQuery.isLoading} scope={linkedRequest && requestIsDone(linkedRequest) ? 'done' : 'active'} layout="list" />
          ) : (
            <EventsBoard key={`${eventId}:${taskId}`} events={linkedEvent ? [linkedEvent] : undefined} departments={departmentList} selectedDept="" isLoading={eventsQuery.isLoading} focusEventId={eventId} focusTaskId={taskId} {...editProps} />
          )}
        </div>
      ) : combined ? (
        <div className="space-y-4">
          {scopeToggle}
          {!presenting && <div>
            <button type="button" aria-expanded={showCombinedHint} aria-label={lang === 'th' ? 'คำอธิบาย' : 'What is this?'} onClick={() => setShowCombinedHint((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-navy-500 dark:hover:bg-slate-800"><CircleHelp className="h-5 w-5" /></button>
            {showCombinedHint && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('display.combinedHint')}</p>}
          </div>}
          <div className="grid gap-6 xl:grid-cols-5">
            <section className="min-w-0 xl:col-span-3">
              <PanelHeading icon={CalendarDays} title={t('display.eventWork')} department={selectedDepartment} />
              {eventsQuery.isLoading || hasDeptEventWork ? (
                <EventsBoard
                  events={eventsQuery.data}
                  departments={departmentList}
                  selectedDept={selectedDept}
                  isLoading={eventsQuery.isLoading}
                  scope={scope}
                  {...editProps}
                />
              ) : (
                <EmptyState icon={CalendarDays} message={t('display.noDeptEvents')} />
              )}
            </section>
            <section className="min-w-0 xl:col-span-2">
              <PanelHeading icon={Inbox} title={t('display.deptRequests')} department={selectedDepartment} />
              <RequestsBoard
                requests={requestsQuery.data}
                departments={departmentList}
                selectedDept={selectedDept}
                isLoading={requestsQuery.isLoading}
                scope={scope}
                layout="list"
              />
            </section>
          </div>
        </div>
      ) : tab === 'events' ? (
        <div className="space-y-5">
          {scopeToggle}
          <EventsBoard
            events={eventsQuery.data}
            departments={departmentList}
            selectedDept={selectedDept}
            isLoading={eventsQuery.isLoading}
            scope={scope}
            {...editProps}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {scopeToggle}
          <RequestsBoard
            requests={requestsQuery.data}
            departments={departmentList}
            selectedDept={selectedDept}
            isLoading={requestsQuery.isLoading}
            scope={scope}
          />
        </div>
      )}

      {/* Live editing dialogs, only reachable by a signed-in events-team member */}
      <EventEditModal
        open={editing?.kind === 'event'}
        onClose={closeEditor}
        event={editing?.kind === 'event' ? editing.event : null}
      />
      <SessionFormModal
        open={editing?.kind === 'session'}
        onClose={closeEditor}
        eventId={editing?.event.id ?? ''}
        eventDate={editing?.event.event_date ?? ''}
        session={sessionForModal}
        // The board only ever edits a session, so nothing here creates one
        sessions={editing?.kind === 'session' ? editing.event.sessions ?? [] : []}
      />
      <TaskEditModal
        open={editing?.kind === 'task'}
        onClose={closeEditor}
        event={editing?.kind === 'task' ? editing.event : null}
        task={editing?.kind === 'task' ? editing.task : null}
        departments={departmentList}
      />

      {/* Floor plans and other files open here, on top of the board */}
      <AttachmentViewer />
    </DisplayShell>
  );
}
