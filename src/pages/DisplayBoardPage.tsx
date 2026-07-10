import { useEffect, useState } from 'react';
import {
  useDisplayDepartments, useDisplayEvents, useDisplayRequests
} from '../hooks/usePublicDisplay';
import { DisplayShell, type DisplayScale, type DisplayTab } from '../components/display/DisplayShell';
import { EventsBoard } from '../components/display/EventsBoard';
import { RequestsBoard } from '../components/display/RequestsBoard';

const SCALE_KEY = 'eventops.display.scale';
const SCALE_FONT: Record<DisplayScale, string> = {
  small: '13px',
  medium: '16px',
  large: '18px',
  xlarge: '21px'
};

/** Public display board with Events / Department Requests tabs. No login required. */
export function DisplayBoardPage({ initialTab = 'events' }: { initialTab?: DisplayTab }) {
  const [tab, setTab] = useState<DisplayTab>(initialTab);
  const [selectedDept, setSelectedDept] = useState('');
  const [scale, setScale] = useState<DisplayScale>(() => {
    const saved = localStorage.getItem(SCALE_KEY);
    return saved === 'small' || saved === 'large' || saved === 'xlarge' ? saved : 'medium';
  });

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
  const eventsQuery = useDisplayEvents();
  const requestsQuery = useDisplayRequests();

  const active = tab === 'events' ? eventsQuery : requestsQuery;

  return (
    <DisplayShell
      tab={tab}
      onTabChange={setTab}
      scale={scale}
      onScaleChange={setScale}
      departments={departments ?? []}
      selectedDepartmentId={selectedDept}
      onSelectDepartment={setSelectedDept}
      onRefresh={() => {
        eventsQuery.refetch();
        requestsQuery.refetch();
      }}
      refreshing={active.isFetching}
      updatedAt={active.dataUpdatedAt ? new Date(active.dataUpdatedAt) : null}
    >
      {tab === 'events' ? (
        <EventsBoard
          events={eventsQuery.data}
          departments={departments ?? []}
          selectedDept={selectedDept}
          isLoading={eventsQuery.isLoading}
        />
      ) : (
        <RequestsBoard
          requests={requestsQuery.data}
          departments={departments ?? []}
          selectedDept={selectedDept}
          isLoading={requestsQuery.isLoading}
        />
      )}
    </DisplayShell>
  );
}
