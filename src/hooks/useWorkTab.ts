import { useEffect, useState } from 'react';
import type { AgentProfile } from '../domain/types';
import type { WorkTab } from '../navigation/routes';

/**
 * Which list Home and History show. Agents with both skills switch between them; agents with
 * one see only theirs. Until the profile loads, the asked-for tab (a push opens Deliveries).
 */
export function useWorkTab(me: AgentProfile | null, asked?: WorkTab) {
  const [chosen, setTab] = useState<WorkTab>(asked ?? 'collections');
  useEffect(() => {
    if (asked) setTab(asked);
  }, [asked]);
  const services = me?.services;
  const collects = !services || services.includes('sample_collection');
  const delivers = Boolean(services?.includes('medicine_delivery'));
  const tab: WorkTab = !services ? chosen : delivers && !collects ? 'deliveries' : !delivers ? 'collections' : chosen;
  return { tab, setTab, both: collects && delivers };
}
