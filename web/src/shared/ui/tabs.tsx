// A tablist with roving focus: Tab enters the selected tab, arrow keys move between tabs (WAI-ARIA
// tabs pattern). The caller renders the panels with tabPanelId / tabId.
import { useRef, type KeyboardEvent, type ReactElement } from 'react';
import styles from './tabs.module.scss';

// ---- types -------------------------------------------------------------------------------------

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProperties {
  label: string;
  /** Prefix for the tab and panel ids; unique on the page. */
  name: string;
  tabs: TabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  look?: 'segmented' | 'chips';
}

// ---- constants ---------------------------------------------------------------------------------

const STEP_BY_KEY: Partial<Record<string, number>> = { ArrowRight: 1, ArrowLeft: -1 };

// ---- functions ---------------------------------------------------------------------------------

export function Tabs({
  label,
  name,
  tabs,
  selectedId,
  onSelect,
  look = 'segmented',
}: TabsProperties): ReactElement {
  const listElement = useRef<HTMLDivElement>(null);
  function moveFocus(event: KeyboardEvent): void {
    const nextId = neighbourId(tabs, selectedId, STEP_BY_KEY[event.key]);
    if (nextId === undefined) {
      return;
    }
    onSelect(nextId);
    listElement.current?.querySelector<HTMLElement>(`#${tabId(name, nextId)}`)?.focus();
  }
  return (
    <div
      ref={listElement}
      role="tablist"
      aria-label={label}
      className={`${styles.list} ${styles[look]}`}
      onKeyDown={moveFocus}
    >
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          name={name}
          tab={tab}
          isSelected={tab.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function TabButton({
  name,
  tab,
  isSelected,
  onSelect,
}: {
  name: string;
  tab: TabItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <button
      id={tabId(name, tab.id)}
      type="button"
      role="tab"
      aria-selected={isSelected}
      aria-controls={tabPanelId(name, tab.id)}
      tabIndex={isSelected ? 0 : -1}
      className={styles.tab}
      onClick={() => {
        onSelect(tab.id);
      }}
    >
      {tab.label}
    </button>
  );
}

/** The tab one step left or right of the selected one, wrapping around the ends. */
function neighbourId(
  tabs: TabItem[],
  selectedId: string,
  step: number | undefined,
): string | undefined {
  if (step === undefined) {
    return undefined;
  }
  const current = tabs.findIndex((tab) => tab.id === selectedId);
  return tabs[(current + step + tabs.length) % tabs.length]?.id;
}

export function tabId(name: string, id: string): string {
  return `${name}-tab-${id}`;
}

export function tabPanelId(name: string, id: string): string {
  return `${name}-panel-${id}`;
}
