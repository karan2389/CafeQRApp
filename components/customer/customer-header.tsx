import { Bell, Clock } from "lucide-react";

export interface CustomerHeaderProps {
  tableLabel: string;
  isClosed: boolean;
  activeServiceCount?: number;
  activeServiceStatus?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CANCELLED";
  onOpenServiceDialog: () => void;
}

export function CustomerHeader({
  tableLabel,
  isClosed,
  activeServiceCount = 0,
  activeServiceStatus,
  onOpenServiceDialog,
}: CustomerHeaderProps) {
  const hasActiveRequest = activeServiceCount > 0;
  return (
    <header className="courista-header">
      <div className="courista-header-inner">
        <a href="#menu" className="courista-brand" aria-label="Courista, skip to menu">
          <span className="courista-brand-name">Courista</span>
          <span className="courista-brand-tag">EAT · PLAY · CONNECT</span>
        </a>
        <div className="courista-header-actions">
          <span className="courista-table-badge" aria-label={`Ordering for ${tableLabel}`}>
            <span aria-hidden="true">▦</span> {tableLabel}
          </span>
          <button
            type="button"
            className={`courista-header-help ${hasActiveRequest ? "is-active" : ""}`}
            onClick={onOpenServiceDialog}
            disabled={isClosed}
            aria-label={
              hasActiveRequest
                ? activeServiceStatus === "ACKNOWLEDGED"
                  ? "Staff on the way; view request"
                  : "Staff notified; view request"
                : "Call staff"
            }
            title={
              hasActiveRequest
                ? activeServiceStatus === "ACKNOWLEDGED"
                  ? "Staff on the way"
                  : "Staff notified"
                : "Call staff"
            }
          >
            {hasActiveRequest && activeServiceStatus === "ACKNOWLEDGED" ? <Clock size={19} /> : <Bell size={19} />}
            {hasActiveRequest && <span className="courista-help-dot" />}
          </button>
        </div>
      </div>
    </header>
  );
}
