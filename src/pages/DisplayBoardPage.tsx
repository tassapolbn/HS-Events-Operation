import { useState } from 'react';
import {
  useDisplayDepartments, useDisplayEvents, useDisplayRequests
} from '../hooks/usePublicDisplay';
import { DisplayShell, type DisplayTab } from '../components/display/DisplayShell';
import { EventsBoard } from '../components/display/EventsBoard';
import { RequestsBoard } from '../components/display/RequestsBoard';

/** Public display board with Events / Department Requests tabs. No login required. */
export function DisplayBoardPage({ initialTab = 'events' }: { initialTab?: DisplayTab }) {
  const [tab, setTab] = useState<DisplayTab>(initialTab);
  const [selectedDept, setSelectedDept] = useState('');

  const { data: departments } = useDisplayDepartments();
  const eventsQuery = useDisplayEvents();
  const requestsQuery = useDisplayRequests();

  const active = tab === 'events' ? eventsQuery : requestsQuery;

  return (
    <DisplayShell
      tab={tab}
      onTabChange={setTab}
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
