export type DashboardTab = 'im' | 'agents' | 'extensions' | 'sessions' | 'system';

const DASHBOARD_TAB_ITEMS: ReadonlyArray<{
  key: DashboardTab;
  labelKey: string;
  descriptionKey: string;
}> = [
  { key: 'sessions', labelKey: 'tab.sessions', descriptionKey: 'tabDesc.sessions' },
