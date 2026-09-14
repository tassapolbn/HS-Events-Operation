import { useEffect, useState, type ComponentType } from 'react';
import { CalendarDays, Inbox } from 'lucide-react';
import { useDisplayDepartments, useDisplayEvents, useDisplayRequests } from '../hooks/usePublicDisplay';
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
          <p className="truncate text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
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
  const { t } = useLanguage();
  const { isEventsTeam } = useAuth();
  const [tab, setTab] = useState<DisplayTab>(initialTab);
  const [selectedDept, setSelectedDept] = useState('');
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

  const { data: departments } = useDisplayDepartments();
  const eventsQuery = useDisplayEvents(campus);
  const requestsQuery = useDisplayRequests(campus);

  const departmentList = departments ?? [];
  const active = tab === 'events' ? eventsQuery : requestsQuery;

  const canEdit = isEventsTeam;
  const boardEditMode = canEdit;
  const editProps = {
    editMode: boardEditMode,
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

  const scopeToggle = (
    <BoardScopeToggle scope={scope} onChange={setScope} activeCount={scopeCounts.active} doneCount={scopeCounts.done} />
  );

  return (
    <DisplayShell
      tab={tab}
      onTabChange={setTab}
      scale={scale}
      onScaleChange={setScale}
      departments={departmentList}
      selectedDepartmentId={selectedDept}
      onSelectDepartment={setSelectedDept}
      onRefresh={() => {
        eventsQuery.refetch();
        requestsQuery.refetch();
      }}
      refreshing={active.isFetching}
      updatedAt={active.dataUpdatedAt ? new Date(active.dataUpdatedAt) : null}
      canEdit={canEdit}
      campusName={campus ? CAMPUS_NAMES[campus] : undefined}
    >
      {combined ? (
        <div className="space-y-4">
          {scopeToggle}
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('display.combinedHint')}</p>
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
        nextSortOrder={editing?.kind === 'session' ? editing.session.sort_order : 0}
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
